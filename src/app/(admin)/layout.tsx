import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types/database'
import AdminNav from '@/components/admin/AdminNav'
import LogoutButton from '@/components/admin/LogoutButton'
import { APP_NAME } from '@/lib/app-config'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user

  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const profile = profileData as { role: UserRole; full_name: string | null } | null
  if (profile?.role !== 'admin') redirect('/operator')

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
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

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  )
}
