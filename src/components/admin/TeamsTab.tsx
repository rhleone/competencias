'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

const DISCIPLINE_LABELS: Record<string, string> = {
  football: 'Fútbol',
  basketball: 'Basketball',
  volleyball: 'Voleyball',
  futsal: 'Fútbol Sala',
}

type Discipline = { id: string; name: string; gender: string }
type Team = { id: string; name: string; color: string | null; disciplines: Discipline[] }

export default function TeamsTab({ editionId }: { editionId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any

  const [teams, setTeams] = useState<Team[]>([])
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', color: '#3B82F6', grade: '' })
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([])

  async function load() {
    setLoading(true)
    const [{ data: disciplinesData }, { data: teamsData }, { data: tdData }] = await Promise.all([
      db.from('disciplines').select('id, name, gender').eq('edition_id', editionId),
      db.from('teams').select('id, name, color').eq('edition_id', editionId).order('name'),
      db.from('team_disciplines').select('team_id, discipline_id'),
    ])

    const allDisciplines: Discipline[] = disciplinesData ?? []
    setDisciplines(allDisciplines)
    setTeams(
      (teamsData ?? []).map((t: { id: string; name: string; color: string | null }) => ({
        ...t,
        disciplines: allDisciplines.filter((d) =>
          (tdData ?? []).some(
            (td: { team_id: string; discipline_id: string }) =>
              td.team_id === t.id && td.discipline_id === d.id
          )
        ),
      }))
    )
    setLoading(false)
  }

  useEffect(() => { load() }, [editionId]) // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditingTeam(null)
    setForm({ name: '', color: '#3B82F6', grade: '' })
    setSelectedDisciplines([])
    setDialogOpen(true)
  }

  function openEdit(team: Team) {
    setEditingTeam(team)
    setForm({ name: team.name, color: team.color ?? '#3B82F6', grade: (team as Team & { grade?: string }).grade ?? '' })
    setSelectedDisciplines(team.disciplines.map((d) => d.id))
    setDialogOpen(true)
  }

  function toggleDiscipline(id: string) {
    setSelectedDisciplines((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('El nombre es requerido.'); return }
    if (selectedDisciplines.length === 0) { toast.error('Seleccioná al menos una disciplina.'); return }
    setSaving(true)

    if (editingTeam) {
      const { error } = await db.from('teams').update({ name: form.name, color: form.color, grade: form.grade || null }).eq('id', editingTeam.id)
      if (error) { toast.error('Error al actualizar.'); setSaving(false); return }
      await db.from('team_disciplines').delete().eq('team_id', editingTeam.id)
      await db.from('team_disciplines').insert(selectedDisciplines.map((discipline_id) => ({ team_id: editingTeam.id, discipline_id })))
      toast.success('Equipo actualizado.')
    } else {
      const { data: newTeam, error } = await db
        .from('teams')
        .insert({ edition_id: editionId, name: form.name, color: form.color, grade: form.grade || null })
        .select('id').single()
      if (error || !newTeam) { toast.error('Error al crear el equipo.'); setSaving(false); return }
      await db.from('team_disciplines').insert(selectedDisciplines.map((discipline_id) => ({ team_id: newTeam.id, discipline_id })))
      toast.success('Equipo creado.')
    }

    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete() {
    if (!deletingTeam) return
    const { error } = await db.from('teams').delete().eq('id', deletingTeam.id)
    if (error) { toast.error('Error al eliminar.'); return }
    toast.success('Equipo eliminado.')
    setDeleteDialogOpen(false)
    setDeletingTeam(null)
    load()
  }

  if (loading) return <p className="text-sm text-gray-500">Cargando equipos...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{teams.length} equipo{teams.length !== 1 ? 's' : ''} registrado{teams.length !== 1 ? 's' : ''}</p>
        <Button onClick={openCreate} size="sm">+ Agregar Equipo</Button>
      </div>

      {disciplines.length === 0 && (
        <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-md mb-4">
          Primero creá al menos una disciplina en el tab "Disciplinas".
        </p>
      )}

      {teams.length === 0 ? (
        <p className="text-sm text-gray-500">No hay equipos registrados aún.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Equipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Disciplinas</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {teams.map((team) => (
                <tr key={team.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color ?? '#3B82F6' }} />
                      <span className="font-medium">{team.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {team.disciplines.length === 0 ? (
                        <span className="text-gray-400 text-xs">Sin disciplinas</span>
                      ) : (
                        team.disciplines.map((d) => (
                          <Badge key={d.id} variant="secondary" className="text-xs">
                            {DISCIPLINE_LABELS[d.name] ?? d.name} {d.gender}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(team)}>Editar</Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700"
                        onClick={() => { setDeletingTeam(team); setDeleteDialogOpen(true) }}>
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTeam ? 'Editar Equipo' : 'Nuevo Equipo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre del equipo</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: 2° A" />
            </div>
            <div className="space-y-2">
              <Label>Grado / Año <span className="text-gray-400 font-normal">(para partidos inter-grupos)</span></Label>
              <Input value={form.grade} onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))} placeholder="Ej: 1°, 2°, 3°" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  className="w-10 h-10 rounded cursor-pointer border" />
                <span className="text-sm text-gray-500">{form.color}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Disciplinas en las que participa</Label>
              {disciplines.length === 0 ? (
                <p className="text-sm text-gray-400">No hay disciplinas configuradas.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {disciplines.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 cursor-pointer p-2 border rounded-lg hover:bg-gray-50">
                      <input type="checkbox" checked={selectedDisciplines.includes(d.id)}
                        onChange={() => toggleDiscipline(d.id)} className="rounded" />
                      <span className="text-sm">
                        {DISCIPLINE_LABELS[d.name] ?? d.name} {d.gender === 'M' ? 'Masculino' : 'Femenino'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar equipo</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">
            ¿Confirmás que querés eliminar <strong>{deletingTeam?.name}</strong>? Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
