import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'
import LogoutButton from '@/components/admin/LogoutButton'
import SuperAdminBanner from '@/components/admin/SuperAdminBanner'
import PlanExpiredBanner from '@/components/admin/PlanExpiredBanner'
import { APP_NAME } from '@/lib/app-config'

export default async function TenantAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) redirect('/auth/login')

  // Always use admin client for is_superadmin — anon client can fail silently with RLS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any

  const { data: profile } = await adb
    .from('profiles')
    .select('is_superadmin, full_name')
    .eq('id', user.id)
    .single()

  const isSuperAdmin: boolean = profile?.is_superadmin === true

  // Resolve tenant
  const { data: tenant } = await adb
    .from('tenants')
    .select('id, name, plan, plan_expires_at')
    .eq('slug', slug)
    .single()

  if (!tenant) redirect('/auth/login')

  if (!isSuperAdmin) {
    // Regular path: must be tenant_admin of this specific tenant
    const { data: tenantUser } = await adb
      .from('tenant_users')
      .select('role')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .single()

    const role = (tenantUser as { role: string } | null)?.role
    if (role !== 'tenant_admin') redirect(`/t/${slug}/operator`)
  } else {
    // Superadmin cross-tenant access — log it (deduplicated per hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
    const { data: recentLog } = await adb
      .from('superadmin_access_log')
      .select('id')
      .eq('superadmin_id', user.id)
      .eq('tenant_id', tenant.id)
      .gte('accessed_at', oneHourAgo)
      .limit(1)
      .maybeSingle()

    if (!recentLog) {
      await adb.from('superadmin_access_log').insert({
        superadmin_id: user.id,
        tenant_id: tenant.id,
        role: 'admin',
      })
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {isSuperAdmin && <SuperAdminBanner tenantName={tenant.name} />}
      {!isSuperAdmin && tenant.plan !== 'free' && (
        <PlanExpiredBanner expiresAt={tenant.plan_expires_at ?? null} />
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-60 bg-white border-r flex flex-col flex-shrink-0">
          <div className="p-5 border-b">
            <h1 className="text-base font-bold text-gray-900 leading-tight">{APP_NAME}</h1>
            <p className="text-xs text-gray-500 mt-0.5">Administración</p>
          </div>
          <AdminNav />
          <div className="p-4 border-t">
            {profile?.full_name && (
              <p className="text-xs text-gray-500 mb-2 truncate">{profile.full_name}</p>
            )}
            <LogoutButton />
          </div>
        </aside>

        <main className="flex-1 overflow-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
