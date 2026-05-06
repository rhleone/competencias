'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { APP_NAME } from '@/lib/app-config'

function toSlug(val: string) {
  return val.toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function RegisterPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleOrgName(val: string) {
    setOrgName(val)
    if (!slug || slug === toSlug(orgName)) setSlug(toSlug(val))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (!slug) { setError('Ingresá un identificador para tu organización'); return }

    setLoading(true)

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_name: orgName, slug, email, password }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Error al registrarse')
      setLoading(false)
      return
    }

    // Sign in immediately
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      // Account created but sign-in failed — send to login
      router.push('/auth/login?registered=1')
      return
    }

    router.push(`/t/${json.slug}/admin`)
  }

  const features = [
    'Gestión de equipos y disciplinas',
    'Scheduling automático de partidos',
    'Resultados en tiempo real',
    'Vista pública del campeonato',
    'Hasta 2 usuarios en el plan gratuito',
  ]

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-start">

        {/* Left — pitch */}
        <div className="text-white space-y-6 hidden md:block pt-4">
          <div>
            <h1 className="text-3xl font-bold">{APP_NAME}</h1>
            <p className="text-blue-200 mt-2">
              Plataforma de gestión de campeonatos deportivos para colegios, clubes y ligas.
            </p>
          </div>
          <ul className="space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-blue-100">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <p className="text-xs text-blue-300">
            Plan gratuito disponible. Sin tarjeta de crédito.
          </p>
        </div>

        {/* Right — form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Crear organización</h2>
          <p className="text-sm text-gray-500 mb-6">Empezá gratis, sin límite de tiempo.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la organización *</Label>
              <Input
                value={orgName}
                onChange={(e) => handleOrgName(e.target.value)}
                placeholder="Ej: Colegio San Martín"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Identificador (URL) *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 shrink-0 font-mono">/t/</span>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="colegio-san-martin"
                  required
                  className="font-mono text-sm"
                />
              </div>
              <p className="text-xs text-gray-400">
                Tu panel estará en <span className="font-mono">/t/{slug || '...'}/admin</span>
              </p>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@tucolegio.edu"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Contraseña *</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Confirmar contraseña *</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repetí tu contraseña"
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creando organización...' : 'Crear organización gratis'}
            </Button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-4">
            ¿Ya tenés cuenta?{' '}
            <Link href="/auth/login" className="text-blue-600 hover:underline">
              Iniciá sesión
            </Link>
          </p>
        </div>

      </div>
    </main>
  )
}
