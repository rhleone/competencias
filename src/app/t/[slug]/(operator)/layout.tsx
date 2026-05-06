import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/admin/LogoutButton'
import SuperAdminBanner from '@/components/admin/SuperAdminBanner'
import { APP_NAME } from '@/lib/app-config'

export default async function TenantOperatorLayout({
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adb = createAdminClient() as any

  const { data: profile } = await adb
    .from('profiles')
    .select('is_superadmin, full_name')
    .eq('id', user.id)
    .single()

  const isSuperAdmin: boolean = profile?.is_superadmin === true

  const { data: tenant } = await adb
    .from('tenants')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!tenant) redirect('/auth/login')

  if (!isSuperAdmin) {
    const { data: tenantUser } = await adb
      .from('tenant_users')
      .select('role')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .single()

    if (!tenantUser) redirect('/auth/login')
  } else {
    // Log cross-tenant operator access (deduplicated per hour per role)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
    const { data: recentLog } = await adb
      .from('superadmin_access_log')
      .select('id')
      .eq('superadmin_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('role', 'operator')
      .gte('accessed_at', oneHourAgo)
      .limit(1)
      .maybeSingle()

    if (!recentLog) {
      await adb.from('superadmin_access_log').insert({
        superadmin_id: user.id,
        tenant_id: tenant.id,
        role: 'operator',
      })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {isSuperAdmin && <SuperAdminBanner tenantName={tenant.name} />}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div>
          <span className="font-bold text-gray-900">{APP_NAME}</span>
          <span className="text-gray-400 mx-2">·</span>
          <span className="text-sm text-gray-500">Carga de Resultados</span>
        </div>
        <div className="flex items-center gap-4">
          {profile?.full_name && (
            <span className="text-sm text-gray-600">{profile.full_name}</span>
          )}
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-6 w-full">
        {children}
      </main>
    </div>
  )
}
