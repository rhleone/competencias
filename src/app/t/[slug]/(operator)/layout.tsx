import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/admin/LogoutButton'
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

  if (!profile?.is_superadmin) {
    const { data: tenantData } = await db.from('tenants').select('id').eq('slug', slug).single()
    const { data: tenantUser } = await db
      .from('tenant_users')
      .select('role')
      .eq('tenant_id', tenantData?.id)
      .eq('user_id', user.id)
      .single()

    if (!tenantUser) redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
      <main className="max-w-4xl mx-auto p-6">
        {children}
      </main>
    </div>
  )
}
