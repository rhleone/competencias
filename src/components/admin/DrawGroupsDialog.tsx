'use client'

import { useState, useEffect, useRef } from 'react'
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
import { Shuffle, CheckCircle2, RotateCcw, Loader2, Users, AlertTriangle } from 'lucide-react'

type TeamForDraw = {
  id: string
  name: string
  color: string | null
  grade: string | null
}

type DisciplineForDraw = {
  id: string
  name: string
  gender: string
}

type PhaseForDraw = {
  id: string
  discipline_id: string
  name: string
}

type ExistingGroup = {
  id: string
  discipline_id: string
  teamIds: string[]
}

type DrawnGroup = {
  name: string
  teams: TeamForDraw[]
}

type DrawStep = 'config' | 'drawing' | 'preview' | 'saving'

const SPORT_LABELS: Record<string, string> = {
  football: 'Fútbol',
  basketball: 'Basketball',
  volleyball: 'Voleyball',
  futsal: 'Fútbol Sala',
}

const GENDER_LABELS: Record<string, string> = {
  M: 'Masculino',
  F: 'Femenino',
}

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function performDraw(
  teams: TeamForDraw[],
  teamsPerGroup: number,
  separateByGrade: boolean,
  prefix: string
): DrawnGroup[] {
  const numGroups = Math.ceil(teams.length / teamsPerGroup)
  const buckets: TeamForDraw[][] = Array.from({ length: numGroups }, () => [])

  if (separateByGrade && teams.some((t) => t.grade)) {
    // Group teams by grade, shuffle within each grade, then interleave
    const byGrade = new Map<string, TeamForDraw[]>()
    teams.forEach((t) => {
      const key = t.grade ?? '__none__'
      if (!byGrade.has(key)) byGrade.set(key, [])
      byGrade.get(key)!.push(t)
    })
    byGrade.forEach((gradeTeams) => {
      const shuffled = fisherYates(gradeTeams)
      gradeTeams.splice(0, gradeTeams.length, ...shuffled)
    })
    // Round-robin distribution: one team per grade per pass, cycling through groups
    const queues = Array.from(byGrade.values())
    let groupIdx = 0
    let hasMore = true
    while (hasMore) {
      hasMore = false
      for (const queue of queues) {
        if (queue.length > 0) {
          hasMore = true
          buckets[groupIdx % numGroups].push(queue.shift()!)
          groupIdx++
        }
      }
    }
  } else {
    fisherYates(teams).forEach((team, i) => buckets[i % numGroups].push(team))
  }

  return buckets.map((teamList, i) => ({
    name: `${prefix} ${GROUP_LETTERS[i] ?? i + 1}`,
    teams: teamList,
  }))
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editionId: string
  disciplines: DisciplineForDraw[]
  phases: PhaseForDraw[]
  allTeams: TeamForDraw[]
  teamDisciplines: { team_id: string; discipline_id: string }[]
  existingGroups: ExistingGroup[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
}

export default function DrawGroupsDialog({
  open,
  onClose,
  onSaved,
  editionId,
  disciplines,
  phases,
  allTeams,
  teamDisciplines,
  existingGroups,
  db,
}: Props) {
  const [step, setStep] = useState<DrawStep>('config')
  const [disciplineId, setDisciplineId] = useState(disciplines[0]?.id ?? '')
  const [phaseId, setPhaseId] = useState('')
  const [teamsPerGroup, setTeamsPerGroup] = useState(4)
  const [separateByGrade, setSeparateByGrade] = useState(true)
  const [groupPrefix, setGroupPrefix] = useState('Grupo')
  const [includeAssigned, setIncludeAssigned] = useState(false)
  const [drawnGroups, setDrawnGroups] = useState<DrawnGroup[]>([])
  const [revealedCount, setRevealedCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (open) {
      setStep('config')
      setDrawnGroups([])
      setRevealedCount(0)
      setIncludeAssigned(false)
      setDisciplineId(disciplines[0]?.id ?? '')
      setPhaseId('')
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [open, disciplines])

  const disciplineTeamIds = teamDisciplines
    .filter((td) => td.discipline_id === disciplineId)
    .map((td) => td.team_id)

  const assignedTeamIds = new Set(
    existingGroups
      .filter((g) => g.discipline_id === disciplineId)
      .flatMap((g) => g.teamIds)
  )

  const availableTeams = allTeams.filter(
    (t) =>
      disciplineTeamIds.includes(t.id) &&
      (includeAssigned || !assignedTeamIds.has(t.id))
  )

  const hasExistingGroups = existingGroups.some((g) => g.discipline_id === disciplineId)
  const numGroups = teamsPerGroup > 0 ? Math.ceil(availableTeams.length / teamsPerGroup) : 0
  const remainder = availableTeams.length % teamsPerGroup
  const disciplinePhases = phases.filter((p) => p.discipline_id === disciplineId)

  const hasGrades = availableTeams.some((t) => t.grade)
  const gradeCount = new Set(availableTeams.map((t) => t.grade ?? '__none__')).size

  const totalToReveal = drawnGroups.reduce((s, g) => s + g.teams.length, 0)
  const progress = totalToReveal > 0 ? Math.round((revealedCount / totalToReveal) * 100) : 0

  function startDraw() {
    if (availableTeams.length < 2) {
      toast.error('Se necesitan al menos 2 equipos para realizar el sorteo.')
      return
    }
    if (teamsPerGroup < 2) {
      toast.error('Mínimo 2 equipos por grupo.')
      return
    }
    if (!groupPrefix.trim()) {
      toast.error('El prefijo del grupo no puede estar vacío.')
      return
    }

    const result = performDraw(availableTeams, teamsPerGroup, separateByGrade, groupPrefix.trim())
    setDrawnGroups(result)
    setRevealedCount(0)
    setStep('drawing')

    const total = result.reduce((s, g) => s + g.teams.length, 0)
    const delayMs = Math.max(120, Math.min(350, Math.floor(2800 / total)))

    let count = 0
    intervalRef.current = setInterval(() => {
      count++
      setRevealedCount(count)
      if (count >= total) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setTimeout(() => setStep('preview'), 500)
      }
    }, delayMs)
  }

  function redoDraw() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setStep('config')
    setDrawnGroups([])
    setRevealedCount(0)
  }

  async function handleConfirm() {
    setStep('saving')
    try {
      for (const group of drawnGroups) {
        const { data: newGroup, error: groupError } = await db
          .from('groups')
          .insert({
            name: group.name,
            edition_id: editionId,
            discipline_id: disciplineId,
            phase_id: phaseId || null,
          })
          .select('id')
          .single()

        if (groupError || !newGroup) throw groupError ?? new Error('No group returned')

        if (group.teams.length > 0) {
          const { error: teamsError } = await db.from('group_teams').insert(
            group.teams.map((t, seedIdx) => ({
              group_id: newGroup.id,
              team_id: t.id,
              seed: seedIdx + 1,
            }))
          )
          if (teamsError) throw teamsError
        }
      }

      toast.success(`${drawnGroups.length} grupos creados correctamente.`)
      onSaved()
      onClose()
    } catch {
      toast.error('Error al guardar los grupos. Intentá de nuevo.')
      setStep('preview')
    }
  }

  function handleClose() {
    if (step === 'saving') return
    if (intervalRef.current) clearInterval(intervalRef.current)
    onClose()
  }

  // Flat list of teams for reveal tracking: index = global reveal order
  let flatOffset = 0
  const groupOffsets: number[] = []
  drawnGroups.forEach((g) => {
    groupOffsets.push(flatOffset)
    flatOffset += g.teams.length
  })

  const gridCols =
    drawnGroups.length <= 2
      ? 'grid-cols-2'
      : drawnGroups.length <= 4
      ? 'grid-cols-2'
      : drawnGroups.length <= 6
      ? 'grid-cols-2 sm:grid-cols-3'
      : 'grid-cols-2 sm:grid-cols-4'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Shuffle className="w-5 h-5 text-blue-600" />
            Sorteo de Grupos
          </DialogTitle>
        </DialogHeader>

        {/* ── CONFIG ── */}
        {step === 'config' && (
          <div className="space-y-5 py-2">
            {/* Discipline */}
            <div className="space-y-2">
              <Label>Disciplina</Label>
              <Select
                value={disciplineId}
                onValueChange={(v) => { setDisciplineId(v ?? ''); setPhaseId('') }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar disciplina" />
                </SelectTrigger>
                <SelectContent>
                  {disciplines.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {SPORT_LABELS[d.name] ?? d.name} — {GENDER_LABELS[d.gender] ?? d.gender}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Warning if teams already assigned */}
            {hasExistingGroups && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                <div className="flex-1">
                  Esta disciplina ya tiene grupos asignados.
                  {!includeAssigned ? (
                    <>
                      {' '}El sorteo usará solo los equipos <strong>sin grupo</strong>.{' '}
                      <button className="underline font-medium" onClick={() => setIncludeAssigned(true)}>
                        Incluir todos los equipos
                      </button>
                    </>
                  ) : (
                    <>
                      {' '}Se usarán <strong>todos</strong> los equipos (incluso los ya asignados).{' '}
                      <button className="underline font-medium" onClick={() => setIncludeAssigned(false)}>
                        Solo los sin grupo
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Teams per group + prefix */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Equipos por grupo</Label>
                <Input
                  type="number"
                  min={2}
                  max={20}
                  value={teamsPerGroup}
                  onChange={(e) => setTeamsPerGroup(Math.max(2, parseInt(e.target.value) || 2))}
                />
              </div>
              <div className="space-y-2">
                <Label>Prefijo del grupo</Label>
                <Input
                  value={groupPrefix}
                  onChange={(e) => setGroupPrefix(e.target.value)}
                  placeholder="Grupo, Pool, Zona…"
                />
              </div>
            </div>

            {/* Phase */}
            <div className="space-y-2">
              <Label>Fase <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Select
                value={phaseId}
                onValueChange={(v) => setPhaseId(v ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin fase asignada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin fase</SelectItem>
                  {disciplinePhases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Grade separation */}
            <div
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                separateByGrade ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
              } ${!hasGrades ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => hasGrades && setSeparateByGrade((v) => !v)}
            >
              <input
                type="checkbox"
                checked={separateByGrade}
                onChange={(e) => setSeparateByGrade(e.target.checked)}
                className="w-4 h-4 mt-0.5"
                disabled={!hasGrades}
              />
              <div>
                <p className="text-sm font-medium">Distribuir por grado/año</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {hasGrades
                    ? `Evita que equipos del mismo grado queden en el mismo grupo. Se detectaron ${gradeCount} grado${gradeCount !== 1 ? 's' : ''} distintos.`
                    : 'Los equipos no tienen grado asignado — activá esta opción editando los equipos.'}
                </p>
              </div>
            </div>

            {/* Summary card */}
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <Users className="w-5 h-5 text-gray-400 shrink-0" />
              <div className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">{availableTeams.length}</span> equipos disponibles
                {' → '}
                <span className="font-semibold text-gray-900">{numGroups > 0 ? numGroups : '—'}</span> grupos
                {remainder > 0 && numGroups > 0 && (
                  <span className="text-gray-500">
                    {' '}(último grupo con {remainder} equipo{remainder !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── DRAWING / PREVIEW ── */}
        {(step === 'drawing' || step === 'preview') && (
          <div className="space-y-4 py-2">
            {/* Progress bar */}
            {step === 'drawing' && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Sorteando equipos…</span>
                  <span>{revealedCount} / {totalToReveal}</span>
                </div>
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Preview header */}
            {step === 'preview' && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-sm font-medium text-green-800 flex-1">
                  Sorteo completado — {drawnGroups.length} grupo{drawnGroups.length !== 1 ? 's' : ''} generado{drawnGroups.length !== 1 ? 's' : ''}
                </span>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={redoDraw}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Rehacer
                </Button>
              </div>
            )}

            {/* Groups grid */}
            <div className={`grid gap-3 ${gridCols}`}>
              {drawnGroups.map((group, gi) => {
                const offset = groupOffsets[gi]
                return (
                  <div
                    key={gi}
                    className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                      <h4 className="font-semibold text-sm text-gray-800">{group.name}</h4>
                      <span className="text-xs text-gray-400">{group.teams.length} eq.</span>
                    </div>
                    <div className="space-y-1.5 min-h-[48px]">
                      {group.teams.map((team, ti) => {
                        const isRevealed = revealedCount > offset + ti
                        return (
                          <div
                            key={team.id}
                            className="flex items-center gap-2 text-sm"
                            style={{
                              opacity: isRevealed ? 1 : 0,
                              transform: isRevealed ? 'translateY(0)' : 'translateY(6px)',
                              transition: 'opacity 0.25s ease, transform 0.25s ease',
                            }}
                          >
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white shadow-sm"
                              style={{ backgroundColor: team.color ?? '#3B82F6' }}
                            />
                            <span className="truncate text-gray-700 flex-1">{team.name}</span>
                            {team.grade && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0">
                                {team.grade}
                              </Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── SAVING ── */}
        {step === 'saving' && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-600">Guardando grupos en la base de datos…</p>
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={handleClose} disabled={step === 'saving'}>
            Cancelar
          </Button>
          {step === 'config' && (
            <Button
              onClick={startDraw}
              disabled={availableTeams.length < 2 || teamsPerGroup < 2}
              className="gap-2"
            >
              <Shuffle className="w-4 h-4" />
              Realizar Sorteo
            </Button>
          )}
          {step === 'preview' && (
            <Button onClick={handleConfirm} className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Confirmar y Guardar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
