'use client'

export const dynamic = 'force-dynamic'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { APP_NAME } from '@/lib/app-config'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
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

    // Check superadmin — query both columns to avoid partial-row RLS issues
    const { data: profileData } = await db
      .from('profiles')
      .select('is_superadmin')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileData?.is_superadmin === true) {
      // Respect ?next param if it points to /super, otherwise default to /super
      router.push(next?.startsWith('/super') ? next : '/super')
      return
    }

    // Look up tenant membership
    const { data: tenantUser } = await db
      .from('tenant_users')
      .select('role, tenant:tenant_id(slug)')
      .eq('user_id', data.user.id)
      .limit(1)
      .single()

    if (tenantUser?.tenant?.slug) {
      const slug = tenantUser.tenant.slug
      router.push(tenantUser.role === 'tenant_admin'
        ? `/t/${slug}/admin`
        : `/t/${slug}/operator`)
      return
    }

    setError('Tu usuario no está asociado a ninguna organización. Contactá al administrador.')
    await supabase.auth.signOut()
    setLoading(false)
  }

  return (
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
      <p className="text-center text-xs text-gray-400 pt-1">
        ¿No tenés cuenta?{' '}
        <Link href="/register" className="text-blue-600 hover:underline">
          Registrá tu organización
        </Link>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{APP_NAME}</CardTitle>
          <CardDescription>Ingresá con tus credenciales</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  )
}
