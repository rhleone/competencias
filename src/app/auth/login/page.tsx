'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { APP_NAME } from '@/lib/app-config'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales inválidas. Verificá tu email y contraseña.')
      setLoading(false)
      return
    }

    // Check if superadmin
    const { data: profileData } = await supabase
      .from('profiles')
      .select('is_superadmin')
      .eq('id', data.user.id)
      .single()

    const profile = profileData as { is_superadmin: boolean } | null
    if (profile?.is_superadmin) {
      router.push('/super')
      return
    }

    // Look up user's tenant membership
    const { data: tenantUser } = await db
      .from('tenant_users')
      .select('role, tenant:tenant_id(slug)')
      .eq('user_id', data.user.id)
      .limit(1)
      .single()

    if (tenantUser?.tenant?.slug) {
      const slug = tenantUser.tenant.slug
      const role = tenantUser.role
      if (role === 'tenant_admin') {
        router.push(`/t/${slug}/admin`)
      } else {
        router.push(`/t/${slug}/operator`)
      }
      return
    }

    // Fallback: no tenant assigned yet
    setError('Tu usuario no está asociado a ninguna organización. Contactá al administrador.')
    await supabase.auth.signOut()
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{APP_NAME}</CardTitle>
          <CardDescription>Ingresá con tus credenciales</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="tu@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
            <Link href="/auth/forgot-password" className="block text-center text-sm text-blue-600 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
