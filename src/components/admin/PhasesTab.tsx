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
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Database, DisciplineType, GenderType, PhaseType, ChampionshipFormat } from '@/types/database'

type Discipline = Database['public']['Tables']['disciplines']['Row']
type Phase = Database['public']['Tables']['phases']['Row']

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

const PHASE_TYPE_LABELS: Record<PhaseType, string> = {
  group_stage: 'Fase de grupos',
  round_of_16: 'Octavos de final',
  quarterfinal: 'Cuartos de final',
  semifinal: 'Semifinal',
  final: 'Final',
}

const FORMAT_LABELS: Record<ChampionshipFormat, string> = {
  round_robin: 'Todos contra todos',
  series: 'Seriado',
  phase_based: 'Por fases',
}

const defaultForm = {
  discipline_id: '',
  name: '',
  phase_type: 'group_stage' as PhaseType,
  format: 'round_robin' as ChampionshipFormat,
  is_knockout: false,
  order_index: 1,
}

interface Props {
  editionId: string
}

export default function PhasesTab({ editionId }: Props) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [phases, setPhases] = useState<Phase[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<Phase | null>(null)
  const [form, setForm] = useState(defaultForm)

  const load = useCallback(async () => {
    setLoading(true)
    const [discRes, phaseRes] = await Promise.all([
      supabase.from('disciplines').select('*').eq('edition_id', editionId).order('created_at'),
      supabase.from('phases').select('*').eq('edition_id', editionId).order('order_index'),
    ])
    const discList = (discRes.data as Discipline[]) ?? []
    setDisciplines(discList)
    setPhases((phaseRes.data as Phase[]) ?? [])
    if (discList.length > 0) {
      setForm((prev) => ({ ...prev, discipline_id: discList[0].id }))
    }
    setLoading(false)
  }, [editionId])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setForm({ ...defaultForm, discipline_id: disciplines[0]?.id ?? '' })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.discipline_id) {
      toast.error('Nombre y disciplina son requeridos.')
      return
    }
    setSaving(true)
    const { error } = await db.from('phases').insert({
      name: form.name.trim(),
      edition_id: editionId,
      discipline_id: form.discipline_id,
      phase_type: form.phase_type,
      format: form.format,
      is_knockout: form.is_knockout,
      order_index: form.order_index,
    })
    if (error) {
      toast.error(`Error al crear fase: ${error.message}`)
    } else {
      toast.success('Fase creada')
      setDialogOpen(false)
      load()
    }
    setSaving(false)
  }

  function openDelete(p: Phase) {
    setDeleting(p)
    setDeleteOpen(true)
  }

  async function handleDelete() {
    if (!deleting) return
    setSaving(true)
    const { error } = await db.from('phases').delete().eq('id', deleting.id)
    if (error) {
      toast.error(`Error al eliminar: ${error.message}`)
    } else {
      toast.success('Fase eliminada')
      setDeleteOpen(false)
      setDeleting(null)
      load()
    }
    setSaving(false)
  }

  if (loading) return <p className="text-gray-500">Cargando...</p>

  // Group phases by discipline
  const phasesByDiscipline = disciplines.map((d) => ({
    discipline: d,
    phases: phases.filter((p) => p.discipline_id === d.id),
  }))

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Fases</h2>
        <Button onClick={openAdd} disabled={disciplines.length === 0}>
          + Agregar Fase
        </Button>
      </div>

      <div className="mb-5 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-800">
        <strong>Nota:</strong> Las fases de la <strong>fase regular</strong> (grupos) no requieren configuración aquí — se gestionan desde la pestaña Grupos y Calendario.
        Las fases eliminatorias (Cuartos, Semifinal, Final) son <strong>creadas automáticamente</strong> al generar el bracket en la pestaña Bracket.
        Esta vista muestra las fases registradas y permite ajustes manuales si es necesario.
      </div>

      {disciplines.length === 0 && (
        <p className="text-gray-500">Agrega disciplinas primero.</p>
      )}

      <div className="space-y-8">
        {phasesByDiscipline.map(({ discipline, phases: dPhases }) => (
          <div key={discipline.id}>
            <h3 className="font-semibold text-gray-700 mb-3">
              {SPORT_LABELS[discipline.name]} {GENDER_LABELS[discipline.gender]}
            </h3>
            {dPhases.length === 0 ? (
              <p className="text-sm text-gray-400 ml-2">Sin fases creadas.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orden</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Formato</TableHead>
                      <TableHead>Eliminación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dPhases.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.order_index}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{PHASE_TYPE_LABELS[p.phase_type]}</TableCell>
                        <TableCell>{FORMAT_LABELS[p.format]}</TableCell>
                        <TableCell>
                          {p.is_knockout ? (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Sí</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openDelete(p)}
                          >
                            Eliminar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Phase Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar Fase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Disciplina</Label>
              <Select
                value={form.discipline_id}
                onValueChange={(v) => setForm((p) => ({ ...p, discipline_id: v ?? '' }))}
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
              <Label>Nombre de la fase</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Fase de Grupos"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de fase</Label>
              <Select
                value={form.phase_type}
                onValueChange={(v) => setForm((p) => ({ ...p, phase_type: v as PhaseType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group_stage">Fase de grupos</SelectItem>
                  <SelectItem value="round_of_16">Octavos de final</SelectItem>
                  <SelectItem value="quarterfinal">Cuartos de final</SelectItem>
                  <SelectItem value="semifinal">Semifinal</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Formato</Label>
              <Select
                value={form.format}
                onValueChange={(v) => setForm((p) => ({ ...p, format: v as ChampionshipFormat }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round_robin">Todos contra todos</SelectItem>
                  <SelectItem value="series">Seriado</SelectItem>
                  <SelectItem value="phase_based">Por fases</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Orden</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.order_index}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, order_index: parseInt(e.target.value) || 1 }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>¿Fase de eliminación?</Label>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_knockout"
                    checked={form.is_knockout}
                    onChange={(e) => setForm((p) => ({ ...p, is_knockout: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <label htmlFor="is_knockout" className="text-sm">
                    Eliminación directa
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Crear fase'}
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
            ¿Estás seguro de que deseas eliminar la fase{' '}
            <strong>{deleting?.name}</strong>?
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
    </div>
  )
}
