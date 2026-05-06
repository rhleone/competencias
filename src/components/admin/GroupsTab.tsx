'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Shuffle } from 'lucide-react'
import type { Database, DisciplineType, GenderType } from '@/types/database'
import DrawGroupsDialog from './DrawGroupsDialog'

type Discipline = Database['public']['Tables']['disciplines']['Row']
type Team = Database['public']['Tables']['teams']['Row']
type Group = Database['public']['Tables']['groups']['Row']
type Phase = Database['public']['Tables']['phases']['Row']
type GroupTeam = Database['public']['Tables']['group_teams']['Row']

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

interface GroupWithTeams extends Group {
  teamNames: string[]
  teamIds: string[]
}

interface Props {
  editionId: string
}

export default function GroupsTab({ editionId }: Props) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [phases, setPhases] = useState<Phase[]>([])
  const [groups, setGroups] = useState<GroupWithTeams[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [teamDisciplines, setTeamDisciplines] = useState<{ team_id: string; discipline_id: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Create group dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    discipline_id: '',
    phase_id: '',
  })

  // Assign teams dialog
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignGroup, setAssignGroup] = useState<GroupWithTeams | null>(null)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])

  // Edit name dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<GroupWithTeams | null>(null)
  const [editName, setEditName] = useState('')

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteGroup, setDeleteGroup] = useState<GroupWithTeams | null>(null)

  // Draw dialog
  const [drawOpen, setDrawOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const [discRes, phaseRes, groupRes, teamsRes, groupTeamsRes, tdRes] = await Promise.all([
      supabase.from('disciplines').select('*').eq('edition_id', editionId).order('created_at'),
      supabase.from('phases').select('*').eq('edition_id', editionId).order('order_index'),
      supabase.from('groups').select('*').eq('edition_id', editionId).order('created_at'),
      db.from('teams').select('id, name, color, grade').eq('edition_id', editionId),
      supabase.from('group_teams').select('*'),
      db.from('team_disciplines').select('team_id, discipline_id'),
    ])

    const discList = (discRes.data as Discipline[]) ?? []
    const phaseList = (phaseRes.data as Phase[]) ?? []
    const groupList = (groupRes.data as Group[]) ?? []
    const teamList = (teamsRes.data ?? []) as Team[]
    const groupTeamList = (groupTeamsRes.data as GroupTeam[]) ?? []
    const tdList = (tdRes.data ?? []) as { team_id: string; discipline_id: string }[]

    setDisciplines(discList)
    setPhases(phaseList)
    setAllTeams(teamList)
    setTeamDisciplines(tdList)

    const enriched: GroupWithTeams[] = groupList.map((g) => {
      const memberIds = groupTeamList
        .filter((gt) => gt.group_id === g.id)
        .map((gt) => gt.team_id)
      const memberNames = memberIds.map(
        (tid) => teamList.find((t) => t.id === tid)?.name ?? tid
      )
      return { ...g, teamIds: memberIds, teamNames: memberNames }
    })

    setGroups(enriched)
    setLoading(false)
  }, [editionId])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!createForm.name.trim() || !createForm.discipline_id) {
      toast.error('Nombre y disciplina son requeridos.')
      return
    }
    setSaving(true)
    const { error } = await db.from('groups').insert({
      name: createForm.name.trim(),
      edition_id: editionId,
      discipline_id: createForm.discipline_id,
      phase_id: createForm.phase_id || null,
    })
    if (error) {
      toast.error(`Error al crear grupo: ${error.message}`)
    } else {
      toast.success('Grupo creado')
      setCreateOpen(false)
      setCreateForm({ name: '', discipline_id: '', phase_id: '' })
      load()
    }
    setSaving(false)
  }

  function openAssign(g: GroupWithTeams) {
    setAssignGroup(g)
    setSelectedTeamIds(g.teamIds)
    setAssignOpen(true)
  }

  async function handleAssignSave() {
    if (!assignGroup) return
    setSaving(true)

    // Delete existing group_teams for this group
    await db.from('group_teams').delete().eq('group_id', assignGroup.id)

    // Insert new assignments
    if (selectedTeamIds.length > 0) {
      const inserts = selectedTeamIds.map((tid) => ({
        group_id: assignGroup.id,
        team_id: tid,
        seed: null,
      }))
      const { error } = await db.from('group_teams').insert(inserts)
      if (error) {
        toast.error(`Error al asignar equipos: ${error.message}`)
        setSaving(false)
        return
      }
    }

    toast.success('Equipos asignados')
    setSaving(false)
    setAssignOpen(false)
    setAssignGroup(null)
    load()
  }

  function openEdit(g: GroupWithTeams) {
    setEditGroup(g)
    setEditName(g.name)
    setEditOpen(true)
  }

  async function handleEditSave() {
    if (!editGroup || !editName.trim()) return
    setSaving(true)
    const { error } = await db
      .from('groups')
      .update({ name: editName.trim() })
      .eq('id', editGroup.id)
    if (error) {
      toast.error(`Error al actualizar: ${error.message}`)
    } else {
      toast.success('Grupo actualizado')
      setEditOpen(false)
      load()
    }
    setSaving(false)
  }

  function openDelete(g: GroupWithTeams) {
    setDeleteGroup(g)
    setDeleteOpen(true)
  }

  async function handleDelete() {
    if (!deleteGroup) return
    setSaving(true)
    await db.from('group_teams').delete().eq('group_id', deleteGroup.id)
    const { error } = await db.from('groups').delete().eq('id', deleteGroup.id)
    if (error) {
      toast.error(`Error al eliminar: ${error.message}`)
    } else {
      toast.success('Grupo eliminado')
      setDeleteOpen(false)
      setDeleteGroup(null)
      load()
    }
    setSaving(false)
  }

  function toggleTeam(teamId: string) {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    )
  }

  if (loading) return <p className="text-gray-500">Cargando...</p>

  // Group by discipline
  const groupsByDiscipline = disciplines.map((d) => ({
    discipline: d,
    groups: groups.filter((g) => g.discipline_id === d.id),
  }))

  const disciplinePhases = (disciplineId: string) =>
    phases.filter((p) => p.discipline_id === disciplineId)

  const disciplineTeams = (disciplineId: string) => {
    const teamIds = teamDisciplines
      .filter((td) => td.discipline_id === disciplineId)
      .map((td) => td.team_id)
    return allTeams.filter((t) => teamIds.includes(t.id))
  }

  // Teams in a discipline that are NOT yet assigned to another group
  // (teams already in `currentGroupId` are kept so they stay selectable)
  const availableTeamsForGroup = (disciplineId: string, currentGroupId: string) => {
    const takenTeamIds = new Set(
      groups
        .filter((g) => g.discipline_id === disciplineId && g.id !== currentGroupId)
        .flatMap((g) => g.teamIds)
    )
    return disciplineTeams(disciplineId).filter((t) => !takenTeamIds.has(t.id))
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold">Grupos</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setDrawOpen(true)}
            disabled={disciplines.length === 0}
            className="gap-2"
          >
            <Shuffle className="w-4 h-4" />
            Sorteo Aleatorio
          </Button>
          <Button
            onClick={() => {
              setCreateForm({ name: '', discipline_id: disciplines[0]?.id ?? '', phase_id: '' })
              setCreateOpen(true)
            }}
            disabled={disciplines.length === 0}
          >
            + Crear Grupo
          </Button>
        </div>
      </div>

      {disciplines.length === 0 && (
        <p className="text-gray-500">Agrega disciplinas primero.</p>
      )}

      <div className="space-y-8">
        {groupsByDiscipline.map(({ discipline, groups: dGroups }) => (
          <div key={discipline.id}>
            <h3 className="font-semibold text-gray-700 mb-3">
              {SPORT_LABELS[discipline.name]} {GENDER_LABELS[discipline.gender]}
            </h3>
            {dGroups.length === 0 ? (
              <p className="text-sm text-gray-400 ml-2">Sin grupos creados.</p>
            ) : (
              <div className="space-y-3">
                {dGroups.map((g) => (
                  <div key={g.id} className="border rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{g.name}</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openAssign(g)}>
                          Asignar equipos
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(g)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => openDelete(g)}>
                          Eliminar
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {g.teamNames.length === 0 ? (
                        <span className="text-sm text-gray-400">Sin equipos asignados</span>
                      ) : (
                        g.teamNames.map((name, i) => (
                          <Badge key={i} variant="secondary">{name}</Badge>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Group Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Grupo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre del grupo</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Grupo A"
              />
            </div>
            <div className="space-y-2">
              <Label>Disciplina</Label>
              <Select
                value={createForm.discipline_id}
                onValueChange={(v) => setCreateForm((p) => ({ ...p, discipline_id: v ?? '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar disciplina" />
                </SelectTrigger>
                <SelectContent>
                  {disciplines.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {SPORT_LABELS[d.name]} {GENDER_LABELS[d.gender]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fase (opcional)</Label>
              <Select
                value={createForm.phase_id}
                onValueChange={(v) => setCreateForm((p) => ({ ...p, phase_id: v ?? '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin fase asignada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin fase</SelectItem>
                  {disciplinePhases(createForm.discipline_id).map((ph) => (
                    <SelectItem key={ph.id} value={ph.id}>
                      {ph.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Teams Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar equipos a {assignGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2 max-h-72 overflow-y-auto">
            {assignGroup && availableTeamsForGroup(assignGroup.discipline_id, assignGroup.id).length === 0 ? (
              <p className="text-sm text-gray-500">No hay equipos disponibles para asignar.</p>
            ) : (
              availableTeamsForGroup(assignGroup?.discipline_id ?? '', assignGroup?.id ?? '').map((t) => (
                <label key={t.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTeamIds.includes(t.id)}
                    onChange={() => toggleTeam(t.id)}
                    className="w-4 h-4"
                  />
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{ backgroundColor: t.color ?? '#3B82F6' }}
                  />
                  <span className="text-sm">{t.name}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAssignSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Name Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar nombre del grupo</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label>Nombre</Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            ¿Estás seguro de que deseas eliminar el grupo <strong>{deleteGroup?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Draw Groups Dialog */}
      <DrawGroupsDialog
        open={drawOpen}
        onClose={() => setDrawOpen(false)}
        onSaved={() => { setDrawOpen(false); load() }}
        editionId={editionId}
        disciplines={disciplines}
        phases={phases}
        allTeams={allTeams}
        teamDisciplines={teamDisciplines}
        existingGroups={groups}
        db={db}
      />
    </div>
  )
}
