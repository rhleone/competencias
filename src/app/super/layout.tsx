import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { APP_NAME } from '@/lib/app-config'

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: profile } = await db
    .from('profiles')
    .select('is_superadmin, full_name')
    .eq('id', user.id)
    .single()

  if (!profile?.is_superadmin) redirect('/auth/login')

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r flex flex-col shrink-0">
        <div className="px-4 py-4 border-b">
          <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Superadmin</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{APP_NAME}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Link href="/super/payments" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition">
            Pagos
          </Link>
          <Link href="/super/tenants" className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition">
            Organizaciones
          </Link>
        </nav>
        <div className="px-4 py-3 border-t text-xs text-gray-400 truncate">
          {profile.full_name ?? user.email}
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
