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

interface DiscMatchStats {
  finished: number
  live: number
  pastScheduled: number
  futureScheduled: number
}

interface FieldName {
  id: string
  discipline_id: string
  field_number: number
  name: string
}

type ViewMode = 'jornada' | 'fecha' | 'disciplina'
type ConfirmedView = 'fecha' | 'cancha'
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
function resolveFieldName(fieldNames: FieldName[], disciplineId: string, fieldNumber: number | null): string {
  if (!fieldNumber) return '—'
  return fieldNames.find((fn) => fn.discipline_id === disciplineId && fn.field_number === fieldNumber)?.name ?? `C${fieldNumber}`
}

export default function ScheduleTab({ editionId, startDate, endDate }: { editionId: string; startDate: string; endDate: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const { plan, id: tenantId } = useTenant()
  const [state, setState] = useState<TabState>('config')
  const [localStart, setLocalStart] = useState(startDate)
  const [localEnd, setLocalEnd] = useState(endDate)
  const [allowedDays, setAllowedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [discLoading, setDiscLoading] = useState(true)
  const [groupTeamCounts, setGroupTeamCounts] = useState<Map<string, number>>(new Map())
  const [discMatchStats, setDiscMatchStats] = useState<Map<string, DiscMatchStats>>(new Map())
  const [selectedDiscIds, setSelectedDiscIds] = useState<Set<string>>(new Set())
  const [pendingDiscIds, setPendingDiscIds] = useState<string[]>([])

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

  // Postponed match deletion
  const [deletingPostponedId, setDeletingPostponedId] = useState<string | null>(null)

  // Manual match creation
  const [addMatchOpen, setAddMatchOpen] = useState(false)

  // Field names (court naming)
  const [fieldNames, setFieldNames] = useState<FieldName[]>([])
  const [fieldNamesOpen, setFieldNamesOpen] = useState(false)
  const [fieldNamesForm, setFieldNamesForm] = useState<Record<string, string>>({})
  const [savingFieldNames, setSavingFieldNames] = useState(false)
  const [confirmedView, setConfirmedView] = useState<ConfirmedView>('fecha')
  const [addMatchForm, setAddMatchForm] = useState({ disciplineId: '', homeTeamId: '', awayTeamId: '', date: '', time: '', fieldNumber: 1, notes: '' })
  const [addMatchTeams, setAddMatchTeams] = useState<{ id: string; name: string }[]>([])
  const [loadingAddTeams, setLoadingAddTeams] = useState(false)
  const [savingAddMatch, setSavingAddMatch] = useState(false)

  const load = useCallback(async () => {
    setDiscLoading(true)
    const [{ data: discData }, { data: gd }, { data: bd }, { data: matchStatsRaw }] = await Promise.all([
      db.from('disciplines').select('*').eq('edition_id', editionId).order('created_at'),
      db.from('groups').select('id, discipline_id, group_teams(team_id)').eq('edition_id', editionId),
      db.from('blocked_dates').select('id, date, reason').eq('edition_id', editionId).order('date'),
      db.from('matches').select('discipline_id, status, scheduled_at').eq('edition_id', editionId).neq('status', 'postponed'),
    ])
    const discs = (discData as Discipline[]) ?? []
    setDisciplines(discs)
    const c = new Map<string, number>()
    if (gd) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(gd as any[]).forEach((g: any) => c.set(g.discipline_id, (c.get(g.discipline_id) ?? 0) + (g.group_teams ?? []).length))
      setGroupTeamCounts(c)
    }
    // Pre-select disciplines that are ready (≥2 teams in groups)
    setSelectedDiscIds(new Set(discs.filter((d) => (c.get(d.id) ?? 0) >= 2).map((d) => d.id)))
    setBlockedDates((bd as BlockedDate[]) ?? [])
    // Compute per-discipline match stats to show context in the checklist
    const todayStr = new Date().toISOString().split('T')[0]
    const mStats = new Map<string, DiscMatchStats>()
    if (matchStatsRaw) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(matchStatsRaw as any[]).forEach((m: any) => {
        const s = mStats.get(m.discipline_id) ?? { finished: 0, live: 0, pastScheduled: 0, futureScheduled: 0 }
        if (m.status === 'finished') s.finished++
        else if (m.status === 'live') s.live++
        else if (m.status === 'scheduled') {
          if ((m.scheduled_at ?? '') <= `${todayStr}T23:59:59`) s.pastScheduled++
          else s.futureScheduled++
        }
        mStats.set(m.discipline_id, s)
      })
    }
    setDiscMatchStats(mStats)
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

  const loadFieldNames = useCallback(async () => {
    const r = await fetch(`/api/editions/${editionId}/field-names`, { credentials: 'include' })
    if (!r.ok) return
    const { fieldNames: data } = await r.json()
    setFieldNames(data ?? [])
  }, [editionId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (state === 'confirmed') { loadConfirmed(); loadFieldNames() }
  }, [state, loadConfirmed, loadFieldNames])

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
    if (selectedDiscIds.size === 0) { toast.error('Seleccioná al menos una disciplina.'); return }
    const discIds = [...selectedDiscIds]
    setPendingDiscIds(discIds)
    setGenerating(true)
    try {
      const r = await fetch(`/api/editions/${editionId}/schedule/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ startDate: localStart, endDate: localEnd, allowedDays, disciplineIds: discIds }),
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
        body: JSON.stringify({ assignments: result.assignments, disciplineIds: pendingDiscIds }),
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

  async function deletePostponedMatch(matchId: string) {
    if (!window.confirm('¿Anular este partido suspendido? Esta acción no se puede deshacer.')) return
    setDeletingPostponedId(matchId)
    const r = await fetch(`/api/editions/${editionId}/matches/${matchId}`, {
      method: 'DELETE', credentials: 'include',
    })
    setDeletingPostponedId(null)
    if (!r.ok) { toast.error((await r.json()).error ?? 'Error al anular el partido'); return }
    toast.success('Partido anulado')
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

  async function loadTeamsForDisc(discId: string) {
    if (!discId) { setAddMatchTeams([]); return }
    setLoadingAddTeams(true)
    const { data: groupsData } = await db
      .from('groups')
      .select('group_teams(team_id, teams(id, name))')
      .eq('edition_id', editionId)
      .eq('discipline_id', discId)
    const seen = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teams: { id: string; name: string }[] = (groupsData ?? []).flatMap((g: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (g.group_teams ?? []).map((gt: any) => gt.teams).filter(Boolean)
    ).filter((t: { id: string; name: string }) => {
      if (seen.has(t.id)) return false
      seen.add(t.id); return true
    })
    teams.sort((a, b) => a.name.localeCompare(b.name))
    setAddMatchTeams(teams)
    setLoadingAddTeams(false)
  }

  async function saveManualMatch() {
    const { disciplineId, homeTeamId, awayTeamId, date, time, fieldNumber, notes } = addMatchForm
    if (!disciplineId || !homeTeamId || !awayTeamId || !date || !time) return
    setSavingAddMatch(true)
    try {
      const r = await fetch(`/api/editions/${editionId}/matches`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          disciplineId,
          homeTeamId,
          awayTeamId,
          scheduledAt: `${date}T${time}:00`,
          fieldNumber,
          notes: notes || null,
        }),
      })
      if (!r.ok) { toast.error((await r.json()).error ?? 'Error al crear partido'); return }
      toast.success('Partido creado correctamente')
      setAddMatchOpen(false)
      setAddMatchForm({ disciplineId: '', homeTeamId: '', awayTeamId: '', date: '', time: '', fieldNumber: 1, notes: '' })
      setAddMatchTeams([])
      loadConfirmed()
    } catch { toast.error('Error de conexión') } finally { setSavingAddMatch(false) }
  }

  async function saveFieldNames() {
    setSavingFieldNames(true)
    const items = Object.entries(fieldNamesForm)
      .filter(([, name]) => name.trim().length > 0)
      .map(([key, name]) => {
        const [disciplineId, fieldNumberStr] = key.split('_')
        return { disciplineId, fieldNumber: parseInt(fieldNumberStr), name: name.trim() }
      })
    try {
      const r = await fetch(`/api/editions/${editionId}/field-names`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ items, tenantId }),
      })
      if (!r.ok) { toast.error('Error al guardar canchas'); return }
      const data = await r.json()
      toast.success(`${data.saved} cancha${data.saved !== 1 ? 's' : ''} guardada${data.saved !== 1 ? 's' : ''}`)
      setFieldNamesOpen(false)
      await loadFieldNames()
    } catch { toast.error('Error de conexión') } finally { setSavingFieldNames(false) }
  }

  function printSchedule() {
    const scheduled = confirmedMatches.filter((m) => m.status === 'scheduled' && m.field_number)
    const byCourt = new Map<string, ConfirmedMatch[]>()
    scheduled.forEach((m) => {
      const key = `${m.discipline_id}:${m.field_number}`
      const arr = byCourt.get(key) ?? []; arr.push(m); byCourt.set(key, arr)
    })
    const courtKeys = [...byCourt.keys()].sort((a, b) => {
      const [dA, nA] = a.split(':'); const [dB, nB] = b.split(':')
      return dA.localeCompare(dB) || parseInt(nA) - parseInt(nB)
    })

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Calendario por Cancha</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#222;margin:20px}
      h1{font-size:16px;margin-bottom:16px;color:#334155}
      .court{margin-bottom:36px;page-break-inside:avoid}
      .court-title{font-size:22px;font-weight:bold;background:#1e293b;color:#fff;padding:10px 16px;margin:0;border-radius:6px 6px 0 0}
      .court-sub{font-size:11px;color:#64748b;background:#f8fafc;padding:4px 16px;border:1px solid #e2e8f0;border-top:none;margin:0 0 4px}
      .date-hdr{font-size:12px;font-weight:bold;background:#f1f5f9;padding:5px 12px;border:1px solid #e2e8f0;text-transform:capitalize;margin:0}
      table{width:100%;border-collapse:collapse;margin-bottom:4px}
      th{background:#f8fafc;text-align:left;padding:5px 10px;font-size:10px;color:#64748b;border-bottom:1px solid #e2e8f0}
      td{padding:5px 10px;border-bottom:1px solid #f1f5f9}
      .mono{font-family:monospace;font-weight:bold}
      @media print{.court{page-break-after:always}.court:last-child{page-break-after:avoid}}
    </style></head><body>`
    html += `<h1>Calendario de Partidos por Cancha</h1>`

    courtKeys.forEach((key) => {
      const [discId, fnStr] = key.split(':')
      const fieldNumber = parseInt(fnStr)
      const courtMatches = [...(byCourt.get(key) ?? [])].sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
      const disc = disciplines.find((d) => d.id === discId)
      const courtName = resolveFieldName(fieldNames, discId, fieldNumber)
      const byDateMap = new Map<string, ConfirmedMatch[]>()
      courtMatches.forEach((m) => {
        if (!m.scheduled_at) return
        const d = toDate(m.scheduled_at); const arr = byDateMap.get(d) ?? []; arr.push(m); byDateMap.set(d, arr)
      })
      html += `<div class="court"><h2 class="court-title">${courtName}</h2>`
      if (disc) html += `<p class="court-sub">${SPORT_LABELS[disc.name]} ${GENDER_LABELS[disc.gender]}</p>`
      ;[...byDateMap.keys()].sort().forEach((date) => {
        html += `<p class="date-hdr">${fmtDate(date)}</p><table><thead><tr><th>Hora</th><th>J</th><th>Local</th><th>Visitante</th></tr></thead><tbody>`
        ;(byDateMap.get(date) ?? []).sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')).forEach((m) => {
          html += `<tr><td class="mono">${m.scheduled_at ? toTime(m.scheduled_at) : '—'}</td><td>${m.match_day != null ? `J${m.match_day}` : '—'}</td><td>${m.home_team?.name ?? '—'}</td><td>${m.away_team?.name ?? '—'}</td></tr>`
        })
        html += `</tbody></table>`
      })
      html += `</div>`
    })
    html += `</body></html>`

    const win = window.open('', '_blank')
    if (!win) { toast.error('El navegador bloqueó la ventana. Permití pop-ups para este sitio.'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  // ============= CONFIG =============
  if (state === 'config') {
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

        {/* Discipline selector */}
        {discLoading ? (
          <p className="text-sm text-gray-500">Cargando disciplinas...</p>
        ) : disciplines.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Disciplinas a programar</Label>
              <div className="flex gap-3 text-xs">
                <button
                  onClick={() => setSelectedDiscIds(new Set(disciplines.filter((d) => (groupTeamCounts.get(d.id) ?? 0) >= 2).map((d) => d.id)))}
                  className="text-blue-600 hover:underline"
                >
                  Solo listas
                </button>
                <button onClick={() => setSelectedDiscIds(new Set(disciplines.map((d) => d.id)))} className="text-blue-600 hover:underline">Todas</button>
                <button onClick={() => setSelectedDiscIds(new Set())} className="text-gray-400 hover:underline">Ninguna</button>
              </div>
            </div>
            <div className="border rounded-lg divide-y overflow-hidden">
              {disciplines.map((d) => {
                const teams = groupTeamCounts.get(d.id) ?? 0
                const ready = teams >= 2
                const checked = selectedDiscIds.has(d.id)
                return (
                  <label key={d.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition ${!ready ? 'opacity-70' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelectedDiscIds((prev) => {
                        const next = new Set(prev)
                        if (checked) next.delete(d.id); else next.add(d.id)
                        return next
                      })}
                      className="rounded border-gray-300 w-4 h-4 shrink-0"
                    />
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium shrink-0 ${gCls(d.gender)}`}>
                      {SPORT_LABELS[d.name]} {d.gender}
                    </span>
                    <span className="text-xs text-gray-500 flex-1">
                      {d.fields_available} cancha{d.fields_available !== 1 ? 's' : ''} · {d.match_duration_minutes} min
                    </span>
                    {ready ? (
                      <span className="text-xs text-green-600 font-medium shrink-0">{teams} equipos ✓</span>
                    ) : (
                      <span className="text-xs text-amber-600 font-medium shrink-0">
                        {teams === 0 ? 'Sin grupos/equipos' : `${teams} equipo${teams !== 1 ? 's' : ''} (mín. 2)`}
                      </span>
                    )}
                    {(() => {
                      const ms = discMatchStats.get(d.id)
                      if (!ms) return null
                      const immovable = ms.finished + ms.live + ms.pastScheduled
                      const future = ms.futureScheduled
                      if (immovable === 0 && future === 0) return null
                      return (
                        <span className="text-xs shrink-0 flex gap-2">
                          {immovable > 0 && <span className="text-gray-400">{immovable} jugados</span>}
                          {future > 0 && <span className="text-blue-500">{future} prog.</span>}
                        </span>
                      )
                    })()}
                  </label>
                )
              })}
            </div>
            {selectedDiscIds.size === 0 && (
              <p className="text-xs text-red-600">Seleccioná al menos una disciplina.</p>
            )}
            {selectedDiscIds.size > 0 && (
              <p className="text-xs text-gray-400">
                Solo se modificarán los partidos <strong>futuros</strong> de las disciplinas seleccionadas. Los partidos jugados o de fechas pasadas no se tocan.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No hay disciplinas creadas en esta edición.
          </p>
        )}

        {[...selectedDiscIds].some((id) => {
          const ms = discMatchStats.get(id)
          return ms && (ms.finished > 0 || ms.live > 0 || ms.pastScheduled > 0 || ms.futureScheduled > 0)
        }) && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-medium mb-1">Regeneración con partidos existentes</p>
            <ul className="text-xs space-y-0.5 text-blue-700">
              <li>· Partidos ya jugados: sus pares no se regeneran (se omiten automáticamente).</li>
              <li>· Partidos pasados sin resultado: quedan intactos, accesibles desde "Pendientes".</li>
              <li>· Partidos futuros sin resultado: se reprograman incluyendo al nuevo equipo.</li>
              <li>· Nuevos partidos del equipo añadido: se agendarán desde mañana en adelante.</li>
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={generate}
            disabled={generating || selectedDiscIds.size === 0 || !allowedDays.length}
          >
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

    // Build cancha groups
    const byCourt = new Map<string, ConfirmedMatch[]>()
    scheduled.forEach((m) => {
      if (!m.field_number) return
      const key = `${m.discipline_id}:${m.field_number}`
      const arr = byCourt.get(key) ?? []; arr.push(m); byCourt.set(key, arr)
    })
    const courtKeys = [...byCourt.keys()].sort((a, b) => {
      const [dA, nA] = a.split(':'); const [dB, nB] = b.split(':')
      return dA.localeCompare(dB) || parseInt(nA) - parseInt(nB)
    })

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Calendario Confirmado</h2>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddMatchForm({ disciplineId: '', homeTeamId: '', awayTeamId: '', date: '', time: '', fieldNumber: 1, notes: '' })
                setAddMatchTeams([])
                setAddMatchOpen(true)
              }}
            >
              + Partido manual
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const form: Record<string, string> = {}
                disciplines.forEach((d) => {
                  for (let f = 1; f <= d.fields_available; f++) {
                    const existing = fieldNames.find((fn) => fn.discipline_id === d.id && fn.field_number === f)
                    form[`${d.id}_${f}`] = existing?.name ?? ''
                  }
                })
                setFieldNamesForm(form)
                setFieldNamesOpen(true)
              }}
            >
              Canchas
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setResult(null); setState('config') }}>← Regenerar</Button>
          </div>
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
            <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border text-sm">
              <div className="flex flex-wrap gap-6 flex-1">
                <div><span className="font-semibold">{scheduled.length}</span> <span className="text-gray-500">programados</span></div>
                <div><span className="font-semibold">{dates.length}</span> <span className="text-gray-500">fechas</span></div>
                <div><span className="font-semibold">{courtKeys.length}</span> <span className="text-gray-500">canchas</span></div>
                {postponed.length > 0 && (
                  <div><span className="font-semibold text-amber-600">{postponed.length}</span> <span className="text-amber-600">suspendidos</span></div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border overflow-hidden text-xs">
                  {(['fecha', 'cancha'] as ConfirmedView[]).map((v) => (
                    <button key={v} onClick={() => setConfirmedView(v)}
                      className={`px-3 py-1.5 capitalize transition ${confirmedView === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      Por {v}
                    </button>
                  ))}
                </div>
                {confirmedView === 'cancha' && (
                  <Button size="sm" variant="outline" onClick={printSchedule} className="text-xs h-7">
                    Exportar PDF
                  </Button>
                )}
              </div>
            </div>

            {/* VIEW: Por fecha */}
            {confirmedView === 'fecha' && (<>
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
                          <td className="px-3 py-2 text-gray-500 text-xs">{resolveFieldName(fieldNames, m.discipline_id, m.field_number)}</td>
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

            </>)}

            {/* VIEW: Por cancha */}
            {confirmedView === 'cancha' && (
              <div className="space-y-6">
                {courtKeys.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay partidos programados.</p>
                ) : courtKeys.map((key) => {
                  const [discId, fnStr] = key.split(':')
                  const fieldNumber = parseInt(fnStr)
                  const courtMatches = [...(byCourt.get(key) ?? [])].sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
                  const disc = disciplines.find((d) => d.id === discId)
                  const courtName = resolveFieldName(fieldNames, discId, fieldNumber)
                  const byDateCourt = new Map<string, ConfirmedMatch[]>()
                  courtMatches.forEach((m) => {
                    if (!m.scheduled_at) return
                    const d = toDate(m.scheduled_at); const arr = byDateCourt.get(d) ?? []; arr.push(m); byDateCourt.set(d, arr)
                  })
                  return (
                    <div key={key} className="border rounded-lg overflow-hidden shadow-sm">
                      <div className="bg-slate-800 text-white px-4 py-3">
                        <div className="text-lg font-bold tracking-wide">{courtName}</div>
                        {disc && (
                          <div className={`inline-flex items-center mt-1 text-xs px-2 py-0.5 rounded-full border font-medium ${gCls(disc.gender)}`}>
                            {SPORT_LABELS[disc.name]} {GENDER_LABELS[disc.gender]}
                          </div>
                        )}
                      </div>
                      {[...byDateCourt.keys()].sort().map((date) => {
                        const dayMatches = (byDateCourt.get(date) ?? []).sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
                        return (
                          <div key={date}>
                            <div className="bg-slate-100 px-4 py-1.5 border-b flex items-center gap-3">
                              <span className="font-semibold text-sm capitalize">{fmtDate(date)}</span>
                              <span className="text-xs text-gray-500">{dayMatches.length} partidos</span>
                            </div>
                            <table className="w-full text-sm">
                              <thead className="text-xs text-gray-500 border-b bg-gray-50">
                                <tr>
                                  <th className="text-left px-4 py-2">Hora</th>
                                  <th className="text-left px-4 py-2">J</th>
                                  <th className="text-left px-4 py-2">Local</th>
                                  <th className="text-left px-4 py-2 text-gray-300">vs</th>
                                  <th className="text-left px-4 py-2">Visitante</th>
                                  <th className="px-4 py-2"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {dayMatches.map((m) => (
                                  <tr key={m.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 font-mono font-semibold">{m.scheduled_at ? toTime(m.scheduled_at) : '—'}</td>
                                    <td className="px-4 py-2 text-gray-400 text-xs">J{m.match_day}</td>
                                    <td className="px-4 py-2 font-medium">{m.home_team?.name ?? '—'}</td>
                                    <td className="px-4 py-2 text-gray-300 text-xs">vs</td>
                                    <td className="px-4 py-2 font-medium">{m.away_team?.name ?? '—'}</td>
                                    <td className="px-4 py-2 text-right">
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
                    </div>
                  )
                })}
              </div>
            )}

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
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" className="text-xs h-7" onClick={() => openReschedule(m)}>
                              Reprogramar
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="text-xs h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                              disabled={deletingPostponedId === m.id}
                              onClick={() => deletePostponedMatch(m.id)}
                            >
                              {deletingPostponedId === m.id ? '...' : 'Anular'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Manual match creation dialog */}
        <Dialog open={addMatchOpen} onOpenChange={(open) => { if (!open) setAddMatchOpen(false) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar partido manual</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-xs text-gray-500">Para partidos de desempate, reposición de suspendidos o partidos extra fuera del calendario automático.</p>

              {/* Discipline */}
              <div className="space-y-1.5">
                <Label>Disciplina</Label>
                <select
                  className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={addMatchForm.disciplineId}
                  onChange={(e) => {
                    const discId = e.target.value
                    setAddMatchForm((p) => ({ ...p, disciplineId: discId, homeTeamId: '', awayTeamId: '' }))
                    loadTeamsForDisc(discId)
                  }}
                >
                  <option value="">Seleccioná una disciplina</option>
                  {disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {SPORT_LABELS[d.name]} {d.gender === 'M' ? 'Masculino' : 'Femenino'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teams */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Equipo local</Label>
                  <select
                    className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                    value={addMatchForm.homeTeamId}
                    disabled={!addMatchForm.disciplineId || loadingAddTeams}
                    onChange={(e) => setAddMatchForm((p) => ({ ...p, homeTeamId: e.target.value }))}
                  >
                    <option value="">{loadingAddTeams ? 'Cargando...' : 'Seleccioná equipo'}</option>
                    {addMatchTeams
                      .filter((t) => t.id !== addMatchForm.awayTeamId)
                      .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Equipo visitante</Label>
                  <select
                    className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                    value={addMatchForm.awayTeamId}
                    disabled={!addMatchForm.disciplineId || loadingAddTeams}
                    onChange={(e) => setAddMatchForm((p) => ({ ...p, awayTeamId: e.target.value }))}
                  >
                    <option value="">{loadingAddTeams ? 'Cargando...' : 'Seleccioná equipo'}</option>
                    {addMatchTeams
                      .filter((t) => t.id !== addMatchForm.homeTeamId)
                      .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Date + time + field */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5 col-span-1">
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={addMatchForm.date}
                    onChange={(e) => setAddMatchForm((p) => ({ ...p, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Hora</Label>
                  <Input
                    type="time"
                    value={addMatchForm.time}
                    onChange={(e) => setAddMatchForm((p) => ({ ...p, time: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cancha N°</Label>
                  <Input
                    type="number"
                    min={1}
                    value={addMatchForm.fieldNumber}
                    onChange={(e) => setAddMatchForm((p) => ({ ...p, fieldNumber: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>Motivo / notas <span className="text-gray-400 font-normal">(opcional)</span></Label>
                <Input
                  value={addMatchForm.notes}
                  placeholder="Ej: Partido de desempate Grupo A, Reposición jornada 3…"
                  onChange={(e) => setAddMatchForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMatchOpen(false)}>Cancelar</Button>
              <Button
                onClick={saveManualMatch}
                disabled={
                  savingAddMatch ||
                  !addMatchForm.disciplineId ||
                  !addMatchForm.homeTeamId ||
                  !addMatchForm.awayTeamId ||
                  !addMatchForm.date ||
                  !addMatchForm.time
                }
              >
                {savingAddMatch ? 'Creando...' : 'Crear partido'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Field names dialog */}
        <Dialog open={fieldNamesOpen} onOpenChange={(open) => { if (!open) setFieldNamesOpen(false) }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nombrar canchas</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <p className="text-xs text-gray-500">Asigná un nombre a cada cancha por disciplina. Si se deja vacío se mostrará C1, C2, etc.</p>
              {disciplines.map((d) => (
                <div key={d.id} className="space-y-2">
                  <div className={`inline-flex items-center text-xs px-2.5 py-1 rounded border font-medium ${gCls(d.gender)}`}>
                    {SPORT_LABELS[d.name]} {GENDER_LABELS[d.gender]}
                  </div>
                  <div className="space-y-1.5">
                    {Array.from({ length: d.fields_available }, (_, i) => i + 1).map((f) => (
                      <div key={f} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-gray-400 w-6">C{f}</span>
                        <Input
                          className="flex-1 h-8 text-sm"
                          placeholder={`Nombre de la cancha ${f}`}
                          value={fieldNamesForm[`${d.id}_${f}`] ?? ''}
                          onChange={(e) => setFieldNamesForm((p) => ({ ...p, [`${d.id}_${f}`]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFieldNamesOpen(false)}>Cancelar</Button>
              <Button onClick={saveFieldNames} disabled={savingFieldNames}>
                {savingFieldNames ? 'Guardando...' : 'Guardar nombres'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
