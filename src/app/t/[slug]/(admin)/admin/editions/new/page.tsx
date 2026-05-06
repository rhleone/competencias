'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTenant } from '@/lib/tenant-context'

export default function NewEditionPage() {
  const { slug } = useTenant()
  const router = useRouter()
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function uploadImage(editionId: string): Promise<string | null> {
    if (!imageFile) return null
    const ext = imageFile.name.split('.').pop()
    const path = `${editionId}.${ext}`
    const { error } = await db.storage.from('edition-covers').upload(path, imageFile, { upsert: true })
    if (error) { toast.error(`Error al subir la imagen: ${error.message}`); return null }
    const { data: { publicUrl } } = db.storage.from('edition-covers').getPublicUrl(path)
    return publicUrl
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

    const { data: newEdition, error: insertError } = await db.from('editions').insert({
      name: form.name,
      year: form.year,
      start_date: form.start_date,
      end_date: form.end_date,
      status: 'draft',
    }).select('id').single()

    if (insertError) {
      setError(`Error al crear la edición: ${insertError.message}`)
      setLoading(false)
      return
    }

    if (imageFile && newEdition?.id) {
      const imageUrl = await uploadImage(newEdition.id)
      if (imageUrl) await db.from('editions').update({ image_url: imageUrl }).eq('id', newEdition.id)
    }

    router.push(`/t/${slug}/admin`)
    router.refresh()
  }

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <a href={`/t/${slug}/admin`} className="text-sm text-gray-500 hover:text-gray-700">← Volver al panel</a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva Edición del Campeonato</CardTitle>
        </CardHeader>
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
                  <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => { setImageFile(null); setImagePreview('') }}>
                    Quitar
                  </button>
                )}
                <span className="text-xs text-gray-400">JPG, PNG o WebP</span>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>{loading ? 'Creando...' : 'Crear Edición'}</Button>
              <Button type="button" variant="outline" onClick={() => router.push(`/t/${slug}/admin`)}>Cancelar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
