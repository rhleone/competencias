import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'
import LogoutButton from '@/components/admin/LogoutButton'
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('is_superadmin, full_name')
    .eq('id', user.id)
    .single()

  const profile = profileData as { is_superadmin: boolean; full_name: string | null } | null

  // Allow superadmins and users with tenant_admin role for this tenant
  if (!profile?.is_superadmin) {
    const { data: tenantUser } = await db
      .from('tenant_users')
      .select('role')
      .eq('tenant_id',
        (await db.from('tenants').select('id').eq('slug', slug).single()).data?.id
      )
      .eq('user_id', user.id)
      .single()

    const role = (tenantUser as { role: string } | null)?.role
    if (role !== 'tenant_admin') redirect(`/t/${slug}/operator`)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
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
  )
}
