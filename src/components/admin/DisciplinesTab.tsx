'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import type { Database, DisciplineType, GenderType, MatchLegs } from '@/types/database'

type Discipline = Database['public']['Tables']['disciplines']['Row']

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol',
  basketball: 'Basketball',
  volleyball: 'Voleyball',
  futsal: 'Fútbol Sala',
}

const GENDER_LABELS: Record<GenderType, string> = {
  M: 'Masculino',
  F: 'Femenino',
}

const defaultForm = {
  name: 'football' as DisciplineType,
  gender: 'M' as GenderType,
  fields_available: 1,
  match_duration_minutes: 40,
  interval_minutes: 15,
  min_matchdays: 1,
  max_matchdays: 10,
  daily_start_time: '08:00',
  daily_end_time: '18:00',
  match_legs: 'single' as MatchLegs,
  enable_cross_group: false,
  qualifying_per_group: 2,
  best_thirds_count: 0,
  max_matches_per_day: 1,
}

interface Props {
  editionId: string
}

export default function DisciplinesTab({ editionId }: Props) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Discipline | null>(null)
  const [deleting, setDeleting] = useState<Discipline | null>(null)
  const [form, setForm] = useState(defaultForm)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('disciplines')
      .select('*')
      .eq('edition_id', editionId)
      .order('created_at', { ascending: true })
    setDisciplines((data as Discipline[]) ?? [])
    setLoading(false)
  }, [editionId])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditing(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  function openEdit(d: Discipline) {
    setEditing(d)
    setForm({
      name: d.name,
      gender: d.gender,
      fields_available: d.fields_available,
      match_duration_minutes: d.match_duration_minutes,
      interval_minutes: d.interval_minutes,
      min_matchdays: d.min_matchdays,
      max_matchdays: d.max_matchdays,
      daily_start_time: d.daily_start_time,
      daily_end_time: d.daily_end_time,
      match_legs: (d.match_legs as MatchLegs) ?? 'single',
      enable_cross_group: d.enable_cross_group ?? false,
      qualifying_per_group: d.qualifying_per_group ?? 2,
      best_thirds_count: d.best_thirds_count ?? 0,
      max_matches_per_day: d.max_matches_per_day ?? 1,
    })
    setDialogOpen(true)
  }

  function openDelete(d: Discipline) {
    setDeleting(d)
    setDeleteDialogOpen(true)
  }

  function handleNumericChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: parseInt(value) || 0 }))
  }

  async function handleSave() {
    setSaving(true)

    // Check duplicate (only when adding or changing name/gender)
    const isDuplicate = disciplines.some(
      (d) =>
        d.name === form.name &&
        d.gender === form.gender &&
        d.id !== editing?.id
    )
    if (isDuplicate) {
      toast.error(`Ya existe ${SPORT_LABELS[form.name]} ${GENDER_LABELS[form.gender]} en esta edición.`)
      setSaving(false)
      return
    }

    if (editing) {
      const { error } = await db
        .from('disciplines')
        .update({ ...form })
        .eq('id', editing.id)
      if (error) {
        toast.error(`Error al actualizar: ${error.message}`)
        setSaving(false)
        return
      }
      toast.success('Disciplina actualizada')
    } else {
      const { error } = await db.from('disciplines').insert({
        ...form,
        edition_id: editionId,
      })
      if (error) {
        toast.error(`Error al crear: ${error.message}`)
        setSaving(false)
        return
      }
      toast.success('Disciplina creada')
    }

    setDialogOpen(false)
    setSaving(false)
    load()
  }

  async function handleDelete() {
    if (!deleting) return
    setSaving(true)
    const { error } = await db.from('disciplines').delete().eq('id', deleting.id)
    if (error) {
      toast.error(`Error al eliminar: ${error.message}`)
    } else {
      toast.success('Disciplina eliminada')
    }
    setSaving(false)
    setDeleteDialogOpen(false)
    setDeleting(null)
    load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Disciplinas</h2>
        <Button onClick={openAdd}>+ Agregar Disciplina</Button>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : disciplines.length === 0 ? (
        <p className="text-gray-500">No hay disciplinas aún.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deporte</TableHead>
                <TableHead>Género</TableHead>
                <TableHead>Canchas</TableHead>
                <TableHead>Duración (min)</TableHead>
                <TableHead>Intervalo (min)</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disciplines.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{SPORT_LABELS[d.name]}</TableCell>
                  <TableCell>{GENDER_LABELS[d.gender]}</TableCell>
                  <TableCell>{d.fields_available}</TableCell>
                  <TableCell>{d.match_duration_minutes}</TableCell>
                  <TableCell>{d.interval_minutes}</TableCell>
                  <TableCell>{d.daily_start_time} - {d.daily_end_time}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => openDelete(d)}>
                        Eliminar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Disciplina' : 'Agregar Disciplina'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deporte</Label>
                <Select
                  value={form.name}
                  onValueChange={(v) => setForm((p) => ({ ...p, name: v as DisciplineType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="football">Fútbol</SelectItem>
                    <SelectItem value="basketball">Basketball</SelectItem>
                    <SelectItem value="volleyball">Voleyball</SelectItem>
                    <SelectItem value="futsal">Fútbol Sala</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Género</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => setForm((p) => ({ ...p, gender: v as GenderType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Femenino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Canchas disponibles</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.fields_available}
                  onChange={(e) => handleNumericChange('fields_available', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Duración partido (min)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.match_duration_minutes}
                  onChange={(e) => handleNumericChange('match_duration_minutes', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Intervalo (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.interval_minutes}
                  onChange={(e) => handleNumericChange('interval_minutes', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mín. jornadas</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.min_matchdays}
                  onChange={(e) => handleNumericChange('min_matchdays', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Máx. jornadas</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.max_matchdays}
                  onChange={(e) => handleNumericChange('max_matchdays', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora inicio</Label>
                <Input
                  type="time"
                  value={form.daily_start_time}
                  onChange={(e) => setForm((p) => ({ ...p, daily_start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora fin</Label>
                <Input
                  type="time"
                  value={form.daily_end_time}
                  onChange={(e) => setForm((p) => ({ ...p, daily_end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Formato de partidos</Label>
              <Select
                value={form.match_legs}
                onValueChange={(v) => setForm((p) => ({ ...p, match_legs: v as MatchLegs }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Solo ida</SelectItem>
                  <SelectItem value="home_away">Ida y vuelta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                checked={form.enable_cross_group}
                onChange={(e) => setForm((p) => ({ ...p, enable_cross_group: e.target.checked }))}
                className="rounded w-4 h-4"
              />
              <div>
                <p className="text-sm font-medium">Habilitar partidos inter-grupos</p>
                <p className="text-xs text-gray-500">Genera partidos entre equipos del mismo grado en distintos grupos (ej: 1°A vs 1°B)</p>
              </div>
            </label>

            <div className="space-y-2">
              <Label>Partidos por equipo por día</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.max_matches_per_day}
                onChange={(e) => handleNumericChange('max_matches_per_day', e.target.value)}
              />
              <p className="text-xs text-gray-400">Máximo de partidos que un equipo puede jugar en el mismo día en esta disciplina</p>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Clasificación a fase eliminatoria</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Clasifican por grupo</Label>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={form.qualifying_per_group}
                    onChange={(e) => handleNumericChange('qualifying_per_group', e.target.value)}
                  />
                  <p className="text-xs text-gray-400">Primeros N de cada grupo que avanzan al bracket</p>
                </div>
                <div className="space-y-2">
                  <Label>Mejores terceros</Label>
                  <Input
                    type="number"
                    min={0}
                    max={8}
                    value={form.best_thirds_count}
                    onChange={(e) => handleNumericChange('best_thirds_count', e.target.value)}
                  />
                  <p className="text-xs text-gray-400">Mejores (N+1)ros clasificados entre todos los grupos</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            ¿Estás seguro de que deseas eliminar{' '}
            <strong>
              {deleting ? `${SPORT_LABELS[deleting.name]} ${GENDER_LABELS[deleting.gender]}` : ''}
            </strong>
            ? Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
