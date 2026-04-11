'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { Database, EditionStatus } from '@/types/database'
import { use } from 'react'

type Edition = Database['public']['Tables']['editions']['Row']

export default function EditEditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [form, setForm] = useState({
    name: '',
    year: new Date().getFullYear(),
    start_date: '',
    end_date: '',
    status: 'draft' as EditionStatus,
  })

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('editions').select('*').eq('id', id).single()
      if (data) {
        const edition = data as Edition
        setForm({
          name: edition.name,
          year: edition.year,
          start_date: edition.start_date,
          end_date: edition.end_date,
          status: edition.status,
        })
      }
      setFetching(false)
    }
    load()
  }, [id])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: name === 'year' ? parseInt(value) : value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    if (new Date(form.start_date) >= new Date(form.end_date)) {
      toast.error('La fecha de inicio debe ser anterior a la fecha de fin.')
      setLoading(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('editions')
      .update({
        name: form.name,
        year: form.year,
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
      })
      .eq('id', id)

    if (error) {
      toast.error(`Error al guardar: ${error.message}`)
      setLoading(false)
      return
    }

    toast.success('Edición actualizada correctamente')
    router.push(`/admin/editions/${id}`)
    router.refresh()
  }

  if (fetching) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <a href={`/admin/editions/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Volver a la edición
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editar Edición</CardTitle>
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

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={form.status}
                onValueChange={(val) => setForm((prev) => ({ ...prev, status: val as EditionStatus }))}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="finished">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar cambios'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/admin/editions/${id}`)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
