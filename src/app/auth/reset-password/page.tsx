'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      // Caso 1: PKCE flow — viene con ?code=xxx en la URL
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          setSessionReady(true)
          return
        }
      }

      // Caso 2: ya hay sesión activa de recovery (evento ya disparado)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSessionReady(true)
        return
      }

      // Caso 3: escuchar el evento PASSWORD_RECOVERY (implicit flow)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setSessionReady(true)
        }
      })
      return () => subscription.unsubscribe()
    }

    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('No se pudo actualizar la contraseña. El link puede haber expirado.')
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
    setTimeout(() => router.push('/auth/login'), 3000)
  }

  if (!sessionReady) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Restablecer contraseña</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Verificando link de recuperación...</p>
          <p className="text-xs text-gray-400">
            Si este mensaje persiste, el link puede haber expirado.{' '}
            <Link href="/auth/forgot-password" className="text-blue-600 hover:underline">
              Solicitá uno nuevo.
            </Link>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Nueva contraseña</CardTitle>
        <CardDescription>Ingresá tu nueva contraseña.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-sm text-green-700 bg-green-50 p-3 rounded-md">
            ✓ Contraseña actualizada correctamente. Redirigiendo al inicio de sesión...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
            </Button>
            <Link href="/auth/login" className="block text-center text-sm text-blue-600 hover:underline">
              Cancelar
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <Suspense fallback={
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <p className="text-sm text-gray-500 text-center">Cargando...</p>
          </CardContent>
        </Card>
      }>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
