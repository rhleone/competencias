'use client'

import { useState, useEffect, useCallback } from 'react'
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
import type { Database, DisciplineType, GenderType, MatchStatus } from '@/types/database'
import { useTenant } from '@/lib/tenant-context'

type Discipline = Database['public']['Tables']['disciplines']['Row']

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol',
  basketball: 'Basketball',
  volleyball: 'Voleyball',
  futsal: 'Fútbol Sala',
}
const GENDER_LABELS: Record<GenderType, string> = { M: 'Masculino', F: 'Femenino' }
const DAYS = [
  { label: 'Dom', value: 0 }, { label: 'Lun', value: 1 }, { label: 'Mar', value: 2 },
  { label: 'Mié', value: 3 }, { label: 'Jue', value: 4 }, { label: 'Vie', value: 5 }, { label: 'Sáb', value: 6 },
]

interface BlockedDate { id: string; date: string; reason: string | null }

interface AssignmentItem {
  matchPair: {
    homeTeamId: string; homeTeamName: string; awayTeamId: string; awayTeamName: string
    disciplineId: string; disciplineName: string; disciplineGender: string
    groupId: string; groupName: string; phaseId: string | null; matchDay: number
  }
  slot: { date: string; fieldNumber: number; startTime: string; endTime: string; disciplineId: string; gender: string }
}
interface Stats {
  total: number; scheduled: number; unscheduled: number
  byDiscipline: Record<string, { name: string; gender: string; scheduled: number; unscheduled: number }>
}
interface GenerateResult {
  assignments: AssignmentItem[]
  unscheduled: { homeTeamId: string; awayTeamId: string; disciplineId: string; groupId: string; phaseId: string | null; matchDay: number }[]
  stats: Stats
}
interface ConfirmedMatch {
  id: string
  scheduled_at: string | null
  field_number: number | null
  match_day: number | null
  status: MatchStatus
  home_team_id: string | null
  away_team_id: string | null
  discipline_id: string
  group_id: string | null
  home_team: { name: string } | null
  away_team: { name: string } | null
  discipline: { name: DisciplineType; gender: GenderType; match_duration_minutes: number } | null
}

type ViewMode = 'jornada' | 'fecha' | 'disciplina'
type TabState = 'config' | 'preview' | 'confirmed'

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return new Date(+y, +m - 1, +day).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' })
}
function gCls(gender: string, active = false) {
  return gender === 'M'
    ? active ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 text-blue-700 border-blue-200'
    : active ? 'bg-pink-600 text-white border-pink-600' : 'bg-pink-50 text-pink-700 border-pink-200'
}
function toDate(scheduledAt: string) { return scheduledAt.split('T')[0] }
function toTime(scheduledAt: string) { return scheduledAt.split('T')[1]?.slice(0, 5) ?? '' }
function addMins(time: string, mins: number) {
  const [h, m] = time.split(':').map(Number)
  const t = h * 60 + m + mins
  return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`
}

export default function ScheduleTab({ editionId, startDate, endDate }: { editionId: string; startDate: string; endDate: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const { plan } = useTenant()
  const [state, setState] = useState<TabState>('config')
  const [localStart, setLocalStart] = useState(startDate)
  const [localEnd, setLocalEnd] = useState(endDate)
  const [allowedDays, setAllowedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [discLoading, setDiscLoading] = useState(true)
  const [groupTeamCounts, setGroupTeamCounts] = useState<Map<string, number>>(new Map())

  // Blocked dates
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [newBlockedDate, setNewBlockedDate] = useState('')
  const [newBlockedReason, setNewBlockedReason] = useState('')
  const [savingBlocked, setSavingBlocked] = useState(false)

  // Generate / preview
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('jornada')
  const [filterDisc, setFilterDisc] = useState('all')

  // Confirmed schedule
  const [confirmedMatches, setConfirmedMatches] = useState<ConfirmedMatch[]>([])
  const [loadingConfirmed, setLoadingConfirmed] = useState(false)
  const [suspendingId, setSuspendingId] = useState<string | null>(null)
  const [reschedulingMatch, setReschedulingMatch] = useState<ConfirmedMatch | null>(null)
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', startTime: '', fieldNumber: 1 })
  const [savingReschedule, setSavingReschedule] = useState(false)

  const load = useCallback(async () => {
    setDiscLoading(true)
    const [{ data: discData }, { data: gd }, { data: bd }] = await Promise.all([
      db.from('disciplines').select('*').eq('edition_id', editionId).order('created_at'),
      db.from('groups').select('id, discipline_id, group_teams(team_id)').eq('edition_id', editionId),
      db.from('blocked_dates').select('id, date, reason').eq('edition_id', editionId).order('date'),
    ])
    setDisciplines((discData as Discipline[]) ?? [])
    if (gd) {
      const c = new Map<string, number>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(gd as any[]).forEach((g: any) => c.set(g.discipline_id, (c.get(g.discipline_id) ?? 0) + (g.group_teams ?? []).length))
      setGroupTeamCounts(c)
    }
    setBlockedDates((bd as BlockedDate[]) ?? [])
    setDiscLoading(false)
  }, [editionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadConfirmed = useCallback(async () => {
    setLoadingConfirmed(true)
    const { data } = await db
      .from('matches')
      .select('id, scheduled_at, field_number, match_day, status, home_team_id, away_team_id, discipline_id, group_id, home_team:home_team_id(name), away_team:away_team_id(name), discipline:discipline_id(name, gender, match_duration_minutes)')
      .eq('edition_id', editionId)
      .in('status', ['scheduled', 'postponed'])
      .order('scheduled_at')
    setConfirmedMatches((data as ConfirmedMatch[]) ?? [])
    setLoadingConfirmed(false)
  }, [editionId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useEffect(() => { if (state === 'confirmed') loadConfirmed() }, [state, loadConfirmed])

  function toggleDay(v: number) { setAllowedDays((p) => p.includes(v) ? p.filter((d) => d !== v) : [...p, v].sort()) }

  async function addBlockedDate() {
    if (!newBlockedDate) return
    setSavingBlocked(true)
    const { error } = await db.from('blocked_dates').insert({
      edition_id: editionId, date: newBlockedDate, reason: newBlockedReason || null,
    })
    setSavingBlocked(false)
    if (error) { toast.error('Error al agregar fecha bloqueada'); return }
    setNewBlockedDate(''); setNewBlockedReason('')
    const { data } = await db.from('blocked_dates').select('id, date, reason').eq('edition_id', editionId).order('date')
    setBlockedDates((data as BlockedDate[]) ?? [])
    toast.success('Fecha bloqueada agregada')
  }

  async function removeBlockedDate(id: string) {
    const { error } = await db.from('blocked_dates').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    setBlockedDates((p) => p.filter((b) => b.id !== id))
  }

  async function generate() {
    if (plan === 'free') {
      toast.error('La generación automática de calendario requiere plan Básico o superior.')
      return
    }
    if (!allowedDays.length) { toast.error('Seleccioná al menos un día.'); return }
    setGenerating(true)
    try {
      const r = await fetch(`/api/editions/${editionId}/schedule/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ startDate: localStart, endDate: localEnd, allowedDays }),
      })
      if (!r.ok) { toast.error((await r.json()).error ?? 'Error'); return }
      const data: GenerateResult = await r.json()
      setResult(data); setState('preview'); setViewMode('jornada'); setFilterDisc('all')
      toast.success(`${data.stats.scheduled} partidos generados`)
    } catch { toast.error('Error de conexión') } finally { setGenerating(false) }
  }

  async function confirm() {
    if (!result) return
    setConfirming(true)
    try {
      const r = await fetch(`/api/editions/${editionId}/schedule/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ assignments: result.assignments }),
      })
      if (!r.ok) { toast.error((await r.json()).error ?? 'Error'); return }
      const data = await r.json()
      toast.success(`${data.matchesCreated} partidos guardados`)
      setState('confirmed')
    } catch { toast.error('Error de conexión') } finally { setConfirming(false) }
  }

  async function suspendMatch(matchId: string) {
    setSuspendingId(matchId)
    const { error } = await db.from('matches').update({ status: 'postponed' }).eq('id', matchId)
    setSuspendingId(null)
    if (error) { toast.error('Error al suspender'); return }
    toast.success('Partido suspendido')
    loadConfirmed()
  }

  function openReschedule(match: ConfirmedMatch) {
    setReschedulingMatch(match)
    setRescheduleForm({
      date: match.scheduled_at ? toDate(match.scheduled_at) : '',
      startTime: match.scheduled_at ? toTime(match.scheduled_at) : '',
      fieldNumber: match.field_number ?? 1,
    })
  }

  async function handleReschedule() {
    if (!reschedulingMatch || !rescheduleForm.date || !rescheduleForm.startTime) return
    setSavingReschedule(true)
    const r = await fetch(`/api/editions/${editionId}/matches/${reschedulingMatch.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        scheduledAt: `${rescheduleForm.date}T${rescheduleForm.startTime}:00`,
        fieldNumber: rescheduleForm.fieldNumber,
        status: 'scheduled',
      }),
    })
    setSavingReschedule(false)
    if (!r.ok) { toast.error('Error al reprogramar'); return }
    toast.success('Partido reprogramado')
    setReschedulingMatch(null)
    loadConfirmed()
  }

  // ============= CONFIG =============
  if (state === 'config') {
    const noTeams = disciplines.filter((d) => (groupTeamCounts.get(d.id) ?? 0) < 2)
    return (
      <div className="space-y-6 max-w-2xl">
        <h2 className="text-lg font-semibold">Generar Calendario de Partidos</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Fecha de inicio</Label><Input type="date" value={localStart} onChange={(e) => setLocalStart(e.target.value)} /></div>
          <div className="space-y-2"><Label>Fecha de fin</Label><Input type="date" value={localEnd} onChange={(e) => setLocalEnd(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          <Label>Días disponibles para jugar</Label>
          <div className="flex gap-2">
            {DAYS.map((d) => (
              <button key={d.value} onClick={() => toggleDay(d.value)}
                className={`w-12 h-10 rounded-lg border text-sm font-medium transition ${allowedDays.includes(d.value) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}>
                {d.label}
              </button>
            ))}
          </div>
          {!allowedDays.length && <p className="text-xs text-red-600">Seleccioná al menos un día.</p>}
        </div>

        {/* Blocked dates */}
        <div className="space-y-3">
          <Label>Fechas no disponibles <span className="text-gray-400 font-normal">(feriados, descanso, etc.)</span></Label>
          <div className="flex gap-2">
            <Input type="date" value={newBlockedDate} onChange={(e) => setNewBlockedDate(e.target.value)} className="w-44" />
            <Input value={newBlockedReason} onChange={(e) => setNewBlockedReason(e.target.value)} placeholder="Motivo (opcional)" className="flex-1" />
            <Button onClick={addBlockedDate} disabled={!newBlockedDate || savingBlocked} variant="outline" size="sm">
              {savingBlocked ? '...' : '+ Agregar'}
            </Button>
          </div>
          {blockedDates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {blockedDates.map((b) => (
                <div key={b.id} className="flex items-center gap-1.5 bg-gray-100 border rounded-full px-3 py-1 text-sm">
                  <span className="text-gray-700 font-medium capitalize">{fmtDate(b.date)}</span>
                  {b.reason && <span className="text-gray-500 text-xs">— {b.reason}</span>}
                  <button onClick={() => removeBlockedDate(b.id)} className="text-gray-400 hover:text-red-500 ml-1 text-xs font-bold leading-none">✕</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin fechas bloqueadas.</p>
          )}
        </div>

        {discLoading ? <p className="text-sm text-gray-500">Cargando...</p> : disciplines.length > 0 && (
          <div className="rounded-md border p-4 space-y-2">
            <p className="text-sm font-medium text-gray-700 mb-3">Parámetros por disciplina</p>
            {disciplines.map((d) => (
              <div key={d.id} className="flex items-center gap-3 text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${gCls(d.gender)}`}>{SPORT_LABELS[d.name]} {d.gender}</span>
                <span className="text-gray-500">{d.fields_available} cancha{d.fields_available !== 1 ? 's' : ''} · {d.match_duration_minutes} min · intervalo {d.interval_minutes} min · {d.daily_start_time}–{d.daily_end_time}</span>
              </div>
            ))}
          </div>
        )}
        {noTeams.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Disciplinas con menos de 2 equipos en grupos:</p>
            <ul className="list-disc list-inside">{noTeams.map((d) => <li key={d.id}>{SPORT_LABELS[d.name]} {GENDER_LABELS[d.gender]}</li>)}</ul>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={generate} disabled={generating || !disciplines.length || !allowedDays.length}>
            {generating ? 'Generando...' : 'Generar Calendario'}
          </Button>
          <Button variant="outline" onClick={() => setState('confirmed')}>Ver calendario actual →</Button>
        </div>
      </div>
    )
  }

  // ============= CONFIRMED =============
  if (state === 'confirmed') {
    const scheduled = confirmedMatches.filter((m) => m.status === 'scheduled')
    const postponed = confirmedMatches.filter((m) => m.status === 'postponed')
    const byDate = new Map<string, ConfirmedMatch[]>()
    scheduled.forEach((m) => {
      if (!m.scheduled_at) return
      const d = toDate(m.scheduled_at)
      const arr = byDate.get(d) ?? []; arr.push(m); byDate.set(d, arr)
    })
    const dates = [...byDate.keys()].sort()

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Calendario Confirmado</h2>
          <Button variant="outline" size="sm" onClick={() => { setResult(null); setState('config') }}>← Regenerar</Button>
        </div>

        {loadingConfirmed ? (
          <p className="text-sm text-gray-500">Cargando partidos...</p>
        ) : confirmedMatches.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            <p>No hay partidos programados aún.</p>
            <Button variant="outline" className="mt-3" onClick={() => setState('config')}>Generar calendario</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-6 p-4 bg-gray-50 rounded-lg border text-sm">
              <div><span className="font-semibold">{scheduled.length}</span> <span className="text-gray-500">programados</span></div>
              <div><span className="font-semibold">{dates.length}</span> <span className="text-gray-500">fechas</span></div>
              {postponed.length > 0 && (
                <div><span className="font-semibold text-amber-600">{postponed.length}</span> <span className="text-amber-600">suspendidos</span></div>
              )}
            </div>

            {/* Scheduled matches grouped by date */}
            {dates.map((date) => {
              const matches = (byDate.get(date) ?? []).sort((a, b) =>
                (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '') || (a.field_number ?? 0) - (b.field_number ?? 0)
              )
              return (
                <div key={date} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 border-b flex items-center gap-3">
                    <span className="font-semibold text-sm capitalize">{fmtDate(date)}</span>
                    <span className="text-xs text-gray-500">{matches.length} partidos</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 border-b bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2">Hora</th>
                        <th className="text-left px-3 py-2">C</th>
                        <th className="text-left px-3 py-2">Disciplina</th>
                        <th className="text-left px-3 py-2">J</th>
                        <th className="text-left px-3 py-2">Local</th>
                        <th className="text-left px-3 py-2">Visitante</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {matches.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono font-medium">{m.scheduled_at ? toTime(m.scheduled_at) : '—'}</td>
                          <td className="px-3 py-2 text-gray-400">{m.field_number}</td>
                          <td className="px-3 py-2">
                            {m.discipline && (
                              <Badge className={`text-xs border ${gCls(m.discipline.gender)}`}>
                                {SPORT_LABELS[m.discipline.name]} {m.discipline.gender}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-xs">J{m.match_day}</td>
                          <td className="px-3 py-2">{m.home_team?.name ?? '—'}</td>
                          <td className="px-3 py-2">{m.away_team?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-right">
                            <Button variant="ghost" size="sm"
                              className="text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-7 px-2"
                              disabled={suspendingId === m.id}
                              onClick={() => suspendMatch(m.id)}>
                              {suspendingId === m.id ? '...' : 'Suspender'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}

            {/* Postponed panel */}
            {postponed.length > 0 && (
              <div className="border border-amber-200 rounded-lg overflow-hidden">
                <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-200">
                  <span className="font-semibold text-sm text-amber-800">
                    Pendientes de reprogramar — {postponed.length} partido{postponed.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 border-b bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">Disciplina</th>
                      <th className="text-left px-3 py-2">J</th>
                      <th className="text-left px-3 py-2">Local</th>
                      <th className="text-left px-3 py-2">Visitante</th>
                      <th className="text-left px-3 py-2">Fecha original</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {postponed.map((m) => (
                      <tr key={m.id} className="hover:bg-amber-50">
                        <td className="px-3 py-2">
                          {m.discipline && (
                            <Badge className={`text-xs border ${gCls(m.discipline.gender)}`}>
                              {SPORT_LABELS[m.discipline.name]} {m.discipline.gender}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-400 text-xs">J{m.match_day}</td>
                        <td className="px-3 py-2">{m.home_team?.name ?? '—'}</td>
                        <td className="px-3 py-2">{m.away_team?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs capitalize">
                          {m.scheduled_at ? `${fmtDate(toDate(m.scheduled_at))} ${toTime(m.scheduled_at)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" className="text-xs h-7" onClick={() => openReschedule(m)}>
                            Reprogramar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Reschedule dialog */}
        <Dialog open={!!reschedulingMatch} onOpenChange={(open) => { if (!open) setReschedulingMatch(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reprogramar partido</DialogTitle>
            </DialogHeader>
            {reschedulingMatch && (
              <div className="space-y-4 py-2">
                <p className="text-sm text-gray-600">
                  <strong>{reschedulingMatch.home_team?.name}</strong>
                  <span className="text-gray-400 mx-1">vs</span>
                  <strong>{reschedulingMatch.away_team?.name}</strong>
                  {reschedulingMatch.discipline && (
                    <span className="ml-2 text-xs text-gray-400">
                      — {SPORT_LABELS[reschedulingMatch.discipline.name]} {reschedulingMatch.discipline.gender}
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nueva fecha</Label>
                    <Input type="date" value={rescheduleForm.date}
                      onChange={(e) => setRescheduleForm((p) => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Hora inicio</Label>
                    <Input type="time" value={rescheduleForm.startTime}
                      onChange={(e) => setRescheduleForm((p) => ({ ...p, startTime: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cancha N°</Label>
                  <Input type="number" min={1} value={rescheduleForm.fieldNumber}
                    onChange={(e) => setRescheduleForm((p) => ({ ...p, fieldNumber: parseInt(e.target.value) || 1 }))}
                    className="w-24" />
                </div>
                {rescheduleForm.date && rescheduleForm.startTime && reschedulingMatch.discipline && (
                  <p className="text-xs text-gray-400">
                    Finaliza a las {addMins(rescheduleForm.startTime, reschedulingMatch.discipline.match_duration_minutes)}
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setReschedulingMatch(null)}>Cancelar</Button>
              <Button onClick={handleReschedule} disabled={savingReschedule || !rescheduleForm.date || !rescheduleForm.startTime}>
                {savingReschedule ? 'Guardando...' : 'Guardar nueva fecha'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ============= PREVIEW =============
  if (!result) return null
  const { stats } = result

  // Conflict detection: same team + same time + SAME GENDER = conflict
  // Different genders (M vs F) never conflict — different players
  const teamSlotMap = new Map<string, string[]>()
  result.assignments.forEach((a) => {
    const key = `${a.slot.date}|${a.slot.startTime}|${a.matchPair.disciplineGender}`
    for (const id of [a.matchPair.homeTeamId, a.matchPair.awayTeamId]) {
      const arr = teamSlotMap.get(id) ?? []; arr.push(key); teamSlotMap.set(id, arr)
    }
  })
  const conflictSet = new Set<string>()
  teamSlotMap.forEach((slots, tid) => {
    const seen = new Set<string>()
    slots.forEach((s) => { if (seen.has(s)) conflictSet.add(`${tid}|${s}`); seen.add(s) })
  })
  const isConflict = (a: AssignmentItem) => {
    const key = `${a.slot.date}|${a.slot.startTime}|${a.matchPair.disciplineGender}`
    return conflictSet.has(`${a.matchPair.homeTeamId}|${key}`) || conflictSet.has(`${a.matchPair.awayTeamId}|${key}`)
  }
  const totalConflicts = result.assignments.filter(isConflict).length

  const filtered = result.assignments.filter((a) => filterDisc === 'all' || a.matchPair.disciplineId === filterDisc)

  const byJornada = new Map<number, AssignmentItem[]>()
  filtered.forEach((a) => { const arr = byJornada.get(a.matchPair.matchDay) ?? []; arr.push(a); byJornada.set(a.matchPair.matchDay, arr) })
  const jornadas = [...byJornada.keys()].sort((a, b) => a - b)

  const byFecha = new Map<string, AssignmentItem[]>()
  filtered.forEach((a) => { const arr = byFecha.get(a.slot.date) ?? []; arr.push(a); byFecha.set(a.slot.date, arr) })
  const fechas = [...byFecha.keys()].sort()

  const byDisc = new Map<string, AssignmentItem[]>()
  filtered.forEach((a) => { const arr = byDisc.get(a.matchPair.disciplineId) ?? []; arr.push(a); byDisc.set(a.matchPair.disciplineId, arr) })

  const activeDisciplines = disciplines.filter((d) => result.assignments.some((a) => a.matchPair.disciplineId === d.id))

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex flex-wrap gap-6 p-4 bg-gray-50 rounded-lg border text-sm">
        <div><span className="font-semibold">{stats.scheduled}</span> <span className="text-gray-500">partidos</span></div>
        <div><span className="font-semibold">{[...new Set(result.assignments.map(a => a.slot.date))].length}</span> <span className="text-gray-500">fechas</span></div>
        <div><span className="font-semibold">{jornadas.length ? Math.max(...jornadas) : 0}</span> <span className="text-gray-500">jornadas</span></div>
        {stats.unscheduled > 0 && <div><span className="font-semibold text-amber-600">{stats.unscheduled}</span> <span className="text-amber-600">sin programar</span></div>}
        {totalConflicts > 0 && <div><span className="font-semibold text-red-600">{totalConflicts}</span> <span className="text-red-600">con conflicto</span></div>}
      </div>

      {totalConflicts > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">⚠ {totalConflicts} partido{totalConflicts !== 1 ? 's tienen' : ' tiene'} equipos jugando simultáneamente en otra disciplina.</p>
          <p className="text-xs mt-1">Las filas marcadas en rojo indican el conflicto. Regenerá ajustando horarios o días.</p>
        </div>
      )}
      {stats.unscheduled > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">{stats.unscheduled} partido{stats.unscheduled !== 1 ? 's' : ''} sin programar — ampliá fechas, agregá canchas o reducí el intervalo.</p>
          {Object.entries(stats.byDiscipline).filter(([, v]) => v.unscheduled > 0).map(([id, v]) => {
            const d = disciplines.find((d) => d.id === id)
            return <p key={id} className="text-xs mt-0.5">· {d ? `${SPORT_LABELS[d.name]} ${GENDER_LABELS[d.gender]}` : v.name}: {v.unscheduled} sin programar</p>
          })}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterDisc('all')} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${filterDisc === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
            Todas ({stats.scheduled})
          </button>
          {activeDisciplines.map((d) => (
            <button key={d.id} onClick={() => setFilterDisc(d.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${gCls(d.gender, filterDisc === d.id)}`}>
              {SPORT_LABELS[d.name]} {d.gender} ({stats.byDiscipline[d.id]?.scheduled ?? 0})
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border overflow-hidden text-xs">
          {(['jornada', 'fecha', 'disciplina'] as ViewMode[]).map((m) => (
            <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 capitalize transition ${viewMode === m ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Por {m}
            </button>
          ))}
        </div>
      </div>

      {/* VIEW: Jornada */}
      {viewMode === 'jornada' && (
        <div className="space-y-5">
          {jornadas.map((jornada) => {
            const matches = (byJornada.get(jornada) ?? []).sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.startTime.localeCompare(b.slot.startTime))
            const bySlot = new Map<string, AssignmentItem[]>()
            matches.forEach((a) => { const k = `${a.slot.date}|${a.slot.startTime}`; const arr = bySlot.get(k) ?? []; arr.push(a); bySlot.set(k, arr) })
            const slotKeys = [...bySlot.keys()].sort()
            const jornadaConflicts = matches.filter(isConflict).length
            return (
              <div key={jornada} className="border rounded-lg overflow-hidden shadow-sm">
                <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center justify-between">
                  <span className="font-semibold">Jornada {jornada}</span>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{matches.length} partidos</span>
                    {jornadaConflicts > 0 && <span className="text-red-400 font-medium">⚠ {jornadaConflicts} conflicto{jornadaConflicts !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <div className="divide-y">
                  {slotKeys.map((sk) => {
                    const [date, time] = sk.split('|')
                    const slotMatches = (bySlot.get(sk) ?? []).sort((a, b) => a.slot.fieldNumber - b.slot.fieldNumber)
                    const slotConflict = slotMatches.some(isConflict)
                    return (
                      <div key={sk} className={`p-3 ${slotConflict ? 'bg-red-50' : ''}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-semibold text-gray-500 capitalize w-44">{fmtDate(date)}</span>
                          <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{time}</span>
                          {slotConflict && <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">⚠ Conflicto de jugadores</span>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 ml-1">
                          {slotMatches.map((a, i) => {
                            const c = isConflict(a)
                            return (
                              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm bg-white ${c ? 'border-red-300' : 'border-gray-200'}`}>
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0 ${gCls(a.matchPair.disciplineGender)}`}>
                                  {SPORT_LABELS[a.matchPair.disciplineName as DisciplineType] ?? a.matchPair.disciplineName} {a.matchPair.disciplineGender}
                                </span>
                                <span className="text-gray-400 text-xs flex-shrink-0">C{a.slot.fieldNumber}</span>
                                <span className={`truncate text-xs ${c ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
                                  {a.matchPair.homeTeamName} <span className="text-gray-400 font-normal">vs</span> {a.matchPair.awayTeamName}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* VIEW: Fecha */}
      {viewMode === 'fecha' && (
        <div className="space-y-4">
          {fechas.map((date) => {
            const matches = (byFecha.get(date) ?? []).sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime))
            return (
              <div key={date} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 border-b flex items-center gap-3">
                  <span className="font-semibold text-sm capitalize">{fmtDate(date)}</span>
                  <span className="text-xs text-gray-500">{matches.length} partidos</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 border-b bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">Hora</th><th className="text-left px-3 py-2">Campo</th>
                      <th className="text-left px-3 py-2">Disciplina</th><th className="text-left px-3 py-2">J</th>
                      <th className="text-left px-3 py-2">Local</th><th className="text-left px-3 py-2">Visitante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {matches.map((a, i) => {
                      const c = isConflict(a)
                      return (
                        <tr key={i} className={c ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2 font-mono font-medium">{a.slot.startTime}</td>
                          <td className="px-3 py-2 text-gray-400">C{a.slot.fieldNumber}</td>
                          <td className="px-3 py-2"><Badge className={`text-xs border ${gCls(a.matchPair.disciplineGender)}`}>{SPORT_LABELS[a.matchPair.disciplineName as DisciplineType] ?? a.matchPair.disciplineName} {a.matchPair.disciplineGender}</Badge></td>
                          <td className="px-3 py-2 text-gray-400 text-xs">J{a.matchPair.matchDay}</td>
                          <td className={`px-3 py-2 ${c ? 'text-red-700 font-semibold' : ''}`}>{a.matchPair.homeTeamName}</td>
                          <td className={`px-3 py-2 ${c ? 'text-red-700 font-semibold' : ''}`}>{a.matchPair.awayTeamName}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* VIEW: Disciplina */}
      {viewMode === 'disciplina' && (
        <div className="space-y-5">
          {[...byDisc.entries()].map(([discId, matches]) => {
            const disc = disciplines.find((d) => d.id === discId)
            const sorted = [...matches].sort((a, b) => a.matchPair.matchDay - b.matchPair.matchDay || a.slot.date.localeCompare(b.slot.date) || a.slot.startTime.localeCompare(b.slot.startTime))
            return (
              <div key={discId} className="border rounded-lg overflow-hidden">
                <div className={`px-4 py-2.5 border-b flex items-center justify-between ${disc?.gender === 'M' ? 'bg-blue-50' : 'bg-pink-50'}`}>
                  <span className="font-semibold text-sm">{disc ? `${SPORT_LABELS[disc.name]} ${GENDER_LABELS[disc.gender]}` : discId}</span>
                  <span className="text-xs text-gray-500">{matches.length} partidos</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 border-b bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">J</th><th className="text-left px-3 py-2">Fecha</th>
                      <th className="text-left px-3 py-2">Hora</th><th className="text-left px-3 py-2">Campo</th>
                      <th className="text-left px-3 py-2">Grupo</th><th className="text-left px-3 py-2">Local</th><th className="text-left px-3 py-2">Visitante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sorted.map((a, i) => {
                      const c = isConflict(a)
                      return (
                        <tr key={i} className={c ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2 font-medium text-gray-600">{a.matchPair.matchDay}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs capitalize">{fmtDate(a.slot.date)}</td>
                          <td className="px-3 py-2 font-mono">{a.slot.startTime}</td>
                          <td className="px-3 py-2 text-gray-400">C{a.slot.fieldNumber}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{a.matchPair.groupName}</td>
                          <td className={`px-3 py-2 ${c ? 'text-red-700 font-semibold' : ''}`}>{a.matchPair.homeTeamName}</td>
                          <td className={`px-3 py-2 ${c ? 'text-red-700 font-semibold' : ''}`}>{a.matchPair.awayTeamName}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-3 pt-2 border-t">
        <Button variant="outline" onClick={() => { setResult(null); setState('config') }}>← Regenerar</Button>
        <Button onClick={confirm} disabled={confirming || !stats.scheduled}>
          {confirming ? 'Confirmando...' : `Confirmar ${stats.scheduled} partidos`}
        </Button>
      </div>
    </div>
  )
}
