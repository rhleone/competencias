'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewEditionPage() {
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    year: new Date().getFullYear(),
    start_date: '',
    end_date: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: name === 'year' ? parseInt(value) : value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (new Date(form.start_date) >= new Date(form.end_date)) {
      setError('La fecha de inicio debe ser anterior a la fecha de fin.')
      setLoading(false)
      return
    }

    const { error: insertError } = await db.from('editions').insert({
      name: form.name,
      year: form.year,
      start_date: form.start_date,
      end_date: form.end_date,
      status: 'draft',
    })

    if (insertError) {
      setError(`Error al crear la edición: ${insertError.message}`)
      setLoading(false)
      return
    }

    router.push('/admin')
    router.refresh()
  }

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <a href="/admin" className="text-sm text-gray-500 hover:text-gray-700">← Volver al panel</a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva Edición del Campeonato</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la edición</Label>
              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="Ej: Juegos Belgranianos 2026"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="year">Año</Label>
              <Input
                id="year"
                name="year"
                type="number"
                value={form.year}
                onChange={handleChange}
                required
                min={2020}
                max={2100}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Fecha de inicio</Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  value={form.start_date}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Fecha de fin</Label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  value={form.end_date}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creando...' : 'Crear Edición'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/admin')}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
