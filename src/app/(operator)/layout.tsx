import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types/database'
import LogoutButton from '@/components/admin/LogoutButton'
import { APP_NAME } from '@/lib/app-config'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
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

  if (!profile || !['admin', 'operator'].includes(profile.role)) redirect('/auth/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div>
          <span className="font-bold text-gray-900">{APP_NAME}</span>
          <span className="text-gray-400 mx-2">·</span>
          <span className="text-sm text-gray-500">Carga de Resultados</span>
        </div>
        <div className="flex items-center gap-4">
          {profile.full_name && <span className="text-sm text-gray-600">{profile.full_name}</span>}
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        {children}
      </main>
    </div>
  )
}
