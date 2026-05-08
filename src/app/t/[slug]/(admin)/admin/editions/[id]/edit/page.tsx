'use client'

import { useState, useEffect, useRef } from 'react'
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
import { useTenant } from '@/lib/tenant-context'

type Edition = Database['public']['Tables']['editions']['Row']

export default function EditEditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { slug, id: tenantId, plan } = useTenant()
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: '',
    year: new Date().getFullYear(),
    start_date: '',
    end_date: '',
    status: 'draft' as EditionStatus,
  })

  useEffect(() => {
    async function load() {
      const { data } = await db.from('editions').select('id, name, year, status, start_date, end_date, image_url').eq('id', id).single()
      if (data) {
        const edition = data as Edition
        setForm({ name: edition.name, year: edition.year, start_date: edition.start_date, end_date: edition.end_date, status: edition.status })
        if (edition.image_url) setImagePreview(edition.image_url)
      }
      setFetching(false)
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: name === 'year' ? parseInt(value) : value }))
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null
    const ext = imageFile.name.split('.').pop()
    const path = `${id}.${ext}`
    const { error } = await db.storage.from('edition-covers').upload(path, imageFile, { upsert: true })
    if (error) { toast.error(`Error al subir la imagen: ${error.message}`); return null }
    const { data: { publicUrl } } = db.storage.from('edition-covers').getPublicUrl(path)
    return publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    if (new Date(form.start_date) >= new Date(form.end_date)) {
      toast.error('La fecha de inicio debe ser anterior a la fecha de fin.')
      setLoading(false)
      return
    }

    // Free plan: only 1 active edition allowed
    if (form.status === 'active' && plan === 'free') {
      const { count } = await db
        .from('editions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .neq('id', id)
      if (count && count >= 1) {
        toast.error('El plan gratuito solo permite 1 edición activa. Finalizá la edición actual antes de activar otra.')
        setLoading(false)
        return
      }
    }

    let imageUrl: string | null | undefined = undefined
    if (imageFile) {
      imageUrl = await uploadImage()
    } else if (imagePreview === '') {
      imageUrl = null
    }

    const payload: Record<string, unknown> = {
      name: form.name, year: form.year, start_date: form.start_date, end_date: form.end_date, status: form.status,
    }
    if (imageUrl !== undefined) payload.image_url = imageUrl

    const { error } = await db.from('editions').update(payload).eq('id', id)
    if (error) { toast.error(`Error al guardar: ${error.message}`); setLoading(false); return }

    toast.success('Edición actualizada correctamente')
    router.push(`/t/${slug}/admin/editions/${id}`)
    router.refresh()
  }

  if (fetching) return <div className="p-8"><p className="text-gray-500">Cargando...</p></div>

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <a href={`/t/${slug}/admin/editions/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Volver a la edición
        </a>
      </div>
      <Card>
        <CardHeader><CardTitle>Editar Edición</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la edición</Label>
              <Input id="name" name="name" value={form.name} onChange={handleChange} required placeholder="Ej: Competencias Deportivas 2026" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Año</Label>
              <Input id="year" name="year" type="number" value={form.year} onChange={handleChange} required min={2020} max={2100} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Fecha de inicio</Label>
                <Input id="start_date" name="start_date" type="date" value={form.start_date} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Fecha de fin</Label>
                <Input id="end_date" name="end_date" type="date" value={form.end_date} onChange={handleChange} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={form.status} onValueChange={(val) => setForm((prev) => ({ ...prev, status: val as EditionStatus }))}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="finished">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Imagen de portada</Label>
              {imagePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg border mb-2" />
              )}
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  {imagePreview ? 'Cambiar imagen' : 'Subir imagen'}
                </Button>
                {imagePreview && (
                  <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => { setImageFile(null); setImagePreview('') }}>Quitar</button>
                )}
                <span className="text-xs text-gray-400">JPG, PNG o WebP</span>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) } }} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar cambios'}</Button>
              <Button type="button" variant="outline" onClick={() => router.push(`/t/${slug}/admin/editions/${id}`)}>Cancelar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
