'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Database, DisciplineType, GenderType, MatchStatus } from '@/types/database'

type Discipline = Database['public']['Tables']['disciplines']['Row']

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol', basketball: 'Basketball', volleyball: 'Voleyball', futsal: 'Fútbol Sala',
}
const GENDER_LABELS: Record<GenderType, string> = { M: 'Masculino', F: 'Femenino' }

// Round label and order for display
const ROUND_ORDER = ['Octavos de Final', 'Cuartos de Final', 'Semifinal', 'Final', '3er Puesto']
const POSITION_ROUND: Record<string, string> = {}
;['R16-1','R16-2','R16-3','R16-4','R16-5','R16-6','R16-7','R16-8'].forEach(p => { POSITION_ROUND[p] = 'Octavos de Final' })
;['QF1','QF2','QF3','QF4'].forEach(p => { POSITION_ROUND[p] = 'Cuartos de Final' })
POSITION_ROUND['SF1'] = 'Semifinal'; POSITION_ROUND['SF2'] = 'Semifinal'
POSITION_ROUND['F'] = 'Final'; POSITION_ROUND['3PO'] = '3er Puesto'

const STATUS_COLORS: Record<MatchStatus, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  live: 'bg-green-100 text-green-800',
  finished: 'bg-blue-100 text-blue-800',
  postponed: 'bg-yellow-100 text-yellow-800',
}
const STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Programado', live: 'En vivo', finished: 'Finalizado', postponed: 'Postergado',
}

interface QualifiedTeam {
  id: string
  name: string
  color: string | null
  groupName: string
  position: number
}

interface BracketMatch {
  id: string
  bracket_position: string
  winner_advances_to: string | null
  winner_slot: string | null
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  scheduled_at: string | null
  field_number: number | null
  home_team: { id: string; name: string; color: string | null } | null
  away_team: { id: string; name: string; color: string | null } | null
  phase: { id: string; name: string; phase_type: string } | null
}

interface BracketPreview {
  total: number
  bracketSize: number
  byes: number
  rounds: string[]
  message: string
  crossings?: { home: string; away: string }[]
}

interface Props { editionId: string }

function TeamDot({ color }: { color: string | null }) {
  return <span className="inline-block w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" style={{ background: color ?? '#ccc' }} />
}

function MatchCard({
  match, onSchedule, onAdvance,
}: {
  match: BracketMatch
  onSchedule: (m: BracketMatch) => void
  onAdvance: (m: BracketMatch) => void
}) {
  const isFinished = match.status === 'finished'
  const isBye = isFinished && (match.home_team === null || match.away_team === null)
  const homeWin = isFinished && (match.home_score ?? 0) > (match.away_score ?? 0)
  const awayWin = isFinished && (match.away_score ?? 0) > (match.home_score ?? 0)

  return (
    <div className={`bg-white border rounded-lg p-3 shadow-sm w-52 ${match.status === 'live' ? 'border-green-400' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-400">{match.bracket_position}</span>
        <div className="flex items-center gap-1">
          {isBye && <Badge className="text-xs bg-gray-100 text-gray-500">BYE</Badge>}
          <Badge className={`text-xs ${STATUS_COLORS[match.status]}`}>{STATUS_LABELS[match.status]}</Badge>
        </div>
      </div>

      {/* Home */}
      <div className={`flex items-center gap-1.5 py-1 px-1.5 rounded text-sm ${homeWin ? 'font-bold bg-yellow-50' : ''}`}>
        {match.home_team ? (
          <>
            <TeamDot color={match.home_team.color} />
            <span className="truncate flex-1">{match.home_team.name}</span>
            {isFinished && <span className="ml-auto font-mono font-bold text-xs">{match.home_score}</span>}
          </>
        ) : <span className="text-gray-400 italic text-xs">Por definir</span>}
      </div>

      {/* Away */}
      <div className={`flex items-center gap-1.5 py-1 px-1.5 rounded text-sm mt-0.5 ${awayWin ? 'font-bold bg-yellow-50' : ''}`}>
        {match.away_team ? (
          <>
            <TeamDot color={match.away_team.color} />
            <span className="truncate flex-1">{match.away_team.name}</span>
            {isFinished && <span className="ml-auto font-mono font-bold text-xs">{match.away_score}</span>}
          </>
        ) : <span className="text-gray-400 italic text-xs">{isBye ? 'BYE' : 'Por definir'}</span>}
      </div>

      {match.scheduled_at && (
        <p className="text-xs text-gray-400 mt-1.5">
          {new Date(match.scheduled_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
          {' '}{match.scheduled_at.split('T')[1]?.slice(0, 5)}
          {match.field_number ? ` · C${match.field_number}` : ''}
        </p>
      )}

      <div className="flex gap-1 mt-2">
        {!isBye && (
          <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => onSchedule(match)}>
            {match.scheduled_at ? 'Reprogramar' : 'Programar'}
          </Button>
        )}
        {isFinished && match.winner_advances_to && (
          <Button size="sm" className="text-xs h-7 px-2" onClick={() => onAdvance(match)}>
            Avanzar →
          </Button>
        )}
      </div>
    </div>
  )
}

export default function BracketTab({ editionId }: Props) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [disciplines, setDisciplines] = useState<Discipline[]>([])
  const [selectedDisc, setSelectedDisc] = useState<string>('')
  const [bracketMatches, setBracketMatches] = useState<BracketMatch[]>([])
  const [preview, setPreview] = useState<BracketPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [includeThirdPlace, setIncludeThirdPlace] = useState(true)

  // Manual seeding
  const [qualifiedTeams, setQualifiedTeams] = useState<QualifiedTeam[]>([])
  const [confirmingSeeds, setConfirmingSeeds] = useState(false)

  // Schedule dialog
  const [schedDialog, setSchedDialog] = useState(false)
  const [schedulingMatch, setSchedulingMatch] = useState<BracketMatch | null>(null)
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [schedField, setSchedField] = useState('')
  const [saving, setSaving] = useState(false)

  const loadDisciplines = useCallback(async () => {
    const { data } = await supabase.from('disciplines').select('*').eq('edition_id', editionId).order('created_at')
    const list = (data as Discipline[]) ?? []
    setDisciplines(list)
    if (list.length > 0) setSelectedDisc(list[0].id)
    setLoading(false)
  }, [editionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadBracket = useCallback(async (discId: string) => {
    if (!discId) return
    const res = await fetch(`/api/editions/${editionId}/bracket?disciplineId=${discId}`)
    const json = await res.json()
    setBracketMatches((json.matches as BracketMatch[]) ?? [])
  }, [editionId])

  /** Calculates bracket preview without creating anything */
  const loadPreview = useCallback(async (discId: string) => {
    if (!discId) return
    setLoadingPreview(true)
    setPreview(null)
    try {
      const disc = disciplines.find(d => d.id === discId)
      if (!disc) return

      const qpg = disc.qualifying_per_group ?? 2
      const btc = disc.best_thirds_count ?? 0
      const seedingMode = (disc as Discipline & { seeding_mode?: string }).seeding_mode ?? 'merit'

      // Load groups and standings to calculate total
      const { data: groupsData } = await supabase.from('groups').select('id, name').eq('edition_id', editionId).eq('discipline_id', discId).order('name')
      const groups: { id: string; name: string }[] = groupsData ?? []
      if (groups.length === 0) { setPreview(null); setLoadingPreview(false); return }

      const groupIds = groups.map((g: { id: string }) => g.id)
      const { data: standingsData } = await db.from('standings').select('group_id, team_id, team:team_id(name)').in('group_id', groupIds)
      const rows: { group_id: string; team_id: string; team: { name: string } | null }[] = standingsData ?? []

      // Count qualifying per group
      let total = 0
      for (const g of groups) {
        const count = rows.filter((r) => r.group_id === g.id).length
        total += Math.min(qpg, count)
      }
      total += Math.min(btc, Math.max(0, rows.length - total))

      if (total < 2) { setPreview(null); setLoadingPreview(false); return }

      const bracketSize = nextPow2(total)
      const byes = bracketSize - total
      const roundDefs = getRoundDefs(bracketSize)
      const roundNames = roundDefs.map(r => r.phaseName)
      if (includeThirdPlace && bracketSize >= 4) roundNames.splice(roundNames.length - 1, 0, '3er Puesto')

      // Build expected first-round crossings for cross_group mode (display only)
      let crossings: { home: string; away: string }[] | undefined
      if (seedingMode === 'cross_group' && groups.length === 2) {
        const groupATeams = rows.filter(r => r.group_id === groups[0].id).slice(0, qpg)
        const groupBTeams = rows.filter(r => r.group_id === groups[1].id).slice(0, qpg)
        const K = Math.min(qpg, groupATeams.length, groupBTeams.length)
        crossings = []
        for (let k = 0; k < K; k++) {
          const teamA = groupATeams[k]?.team?.name ?? `${groups[0].name} #${k + 1}`
          const teamB = groupBTeams[K - 1 - k]?.team?.name ?? `${groups[1].name} #${K - k}`
          crossings.push({ home: `${k + 1}° ${groups[0].name}: ${teamA}`, away: `${K - k}° ${groups[1].name}: ${teamB}` })
        }
      }

      setPreview({
        total,
        bracketSize,
        byes,
        rounds: roundNames,
        message: `${total} equipos · bracket de ${bracketSize} · ${byes} BYE(s)`,
        crossings,
      })
    } finally {
      setLoadingPreview(false)
    }
  }, [disciplines, editionId, includeThirdPlace]) // eslint-disable-line react-hooks/exhaustive-deps

  function nextPow2(n: number): number {
    if (n <= 1) return 2; let p = 2; while (p < n) p *= 2; return p
  }
  function getRoundDefs(bs: number): { phaseName: string }[] {
    const r = []
    if (bs >= 16) r.push({ phaseName: 'Octavos de Final' })
    if (bs >= 8) r.push({ phaseName: 'Cuartos de Final' })
    if (bs >= 4) r.push({ phaseName: 'Semifinal' })
    r.push({ phaseName: 'Final' })
    return r
  }

  useEffect(() => { loadDisciplines() }, [loadDisciplines])
  useEffect(() => { if (selectedDisc) { loadBracket(selectedDisc) } }, [selectedDisc, loadBracket])

  // Load qualified teams for manual seeding mode
  useEffect(() => {
    const disc = disciplines.find(d => d.id === selectedDisc)
    const isManual = (disc as Discipline & { seeding_mode?: string })?.seeding_mode === 'manual'
    if (!isManual || !selectedDisc) { setQualifiedTeams([]); return }

    async function loadQualifiedTeams() {
      const { data: groupsData } = await supabase.from('groups')
        .select('id, name').eq('edition_id', editionId).eq('discipline_id', selectedDisc).order('name')
      const groups: { id: string; name: string }[] = groupsData ?? []
      if (groups.length === 0) return

      const groupIds = groups.map(g => g.id)
      const { data: standingsData } = await db.from('standings')
        .select('group_id, team_id, points, goal_difference, goals_for, team:team_id(id, name, color)')
        .in('group_id', groupIds)

      const disc = disciplines.find(d => d.id === selectedDisc)
      const qpg = disc?.qualifying_per_group ?? 2

      // Build sorted standings per group, take top qpg
      const teams: QualifiedTeam[] = []
      for (const g of groups) {
        const rows = ((standingsData ?? []) as {
          group_id: string; team_id: string; points: number; goal_difference: number; goals_for: number;
          team: { id: string; name: string; color: string | null } | null
        }[])
          .filter(r => r.group_id === g.id)
          .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points
            if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
            return b.goals_for - a.goals_for
          })
          .slice(0, qpg)

        rows.forEach((r, i) => {
          if (r.team) teams.push({ id: r.team.id, name: r.team.name, color: r.team.color, groupName: g.name, position: i + 1 })
        })
      }
      setQualifiedTeams(teams)
    }
    loadQualifiedTeams()
  }, [selectedDisc, disciplines]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedDisc && bracketMatches.length === 0 && disciplines.length > 0) {
      loadPreview(selectedDisc)
    } else if (bracketMatches.length > 0) {
      setPreview(null)
    }
  }, [selectedDisc, bracketMatches.length, disciplines.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedDisc && bracketMatches.length === 0) loadPreview(selectedDisc)
  }, [includeThirdPlace]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSeedAssign(matchId: string, slot: 'home' | 'away', teamId: string | null) {
    const res = await fetch(`/api/editions/${editionId}/bracket/seed`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId, slot, teamId }),
    })
    const json = await res.json()
    if (res.ok) loadBracket(selectedDisc)
    else toast.error(json.error ?? 'Error al asignar seed')
  }

  async function handleConfirmSeeds() {
    setConfirmingSeeds(true)
    const res = await fetch(`/api/editions/${editionId}/bracket/confirm-seeds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disciplineId: selectedDisc }),
    })
    const json = await res.json()
    if (res.ok) { toast.success(json.message); loadBracket(selectedDisc) }
    else toast.error(json.error ?? 'Error al confirmar seeds')
    setConfirmingSeeds(false)
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/editions/${editionId}/bracket/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disciplineId: selectedDisc, includeThirdPlace }),
      })
      const json = await res.json()
      if (!res.ok) toast.error(json.error)
      else { toast.success(json.message); await loadBracket(selectedDisc) }
    } finally {
      setGenerating(false)
    }
  }

  async function handleClear() {
    if (!confirm('¿Eliminar el bracket actual? Esta acción no se puede deshacer.')) return
    setClearing(true)
    const res = await fetch(`/api/editions/${editionId}/bracket?disciplineId=${selectedDisc}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Bracket eliminado'); setBracketMatches([]); loadPreview(selectedDisc) }
    else { const j = await res.json(); toast.error(j.error) }
    setClearing(false)
  }

  function openSchedule(m: BracketMatch) {
    setSchedulingMatch(m)
    if (m.scheduled_at) {
      const [d, t] = m.scheduled_at.split('T')
      setSchedDate(d); setSchedTime(t?.slice(0, 5) ?? '')
    } else { setSchedDate(''); setSchedTime('') }
    setSchedField(m.field_number?.toString() ?? '')
    setSchedDialog(true)
  }

  async function handleScheduleSave() {
    if (!schedulingMatch || !schedDate || !schedTime) return
    setSaving(true)
    const res = await fetch(`/api/editions/${editionId}/matches/${schedulingMatch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: `${schedDate}T${schedTime}:00`, fieldNumber: schedField ? parseInt(schedField) : null }),
    })
    if (res.ok) { toast.success('Partido programado'); setSchedDialog(false); loadBracket(selectedDisc) }
    else { const j = await res.json(); toast.error(j.error ?? 'Error al programar') }
    setSaving(false)
  }

  async function handleAdvance(m: BracketMatch) {
    const res = await fetch(`/api/editions/${editionId}/bracket/advance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: m.id }),
    })
    const json = await res.json()
    if (res.ok) { toast.success('Ganador avanzado'); loadBracket(selectedDisc) }
    else toast.error(json.error)
  }

  // Group matches by round for display
  const roundsMap = new Map<string, BracketMatch[]>()
  for (const m of bracketMatches) {
    const round = POSITION_ROUND[m.bracket_position] ?? 'Final'
    if (!roundsMap.has(round)) roundsMap.set(round, [])
    roundsMap.get(round)!.push(m)
  }
  const activeRounds = ROUND_ORDER.filter(r => roundsMap.has(r))
  const disc = disciplines.find(d => d.id === selectedDisc)
  const hasBracket = bracketMatches.length > 0
  const seedingMode = (disc as Discipline & { seeding_mode?: string })?.seeding_mode ?? 'merit'

  // For manual mode: identify first-round matches (those not targeted by any winner_advances_to)
  const advancesTargets = new Set(bracketMatches.map(m => m.winner_advances_to).filter(Boolean))
  const firstRoundMatches = bracketMatches.filter(
    m => m.bracket_position !== '3PO' && !advancesTargets.has(m.id)
  )
  const isPendingManualSeeds = seedingMode === 'manual' && hasBracket &&
    firstRoundMatches.some(m => m.home_team === null || m.away_team === null)

  // Teams already assigned in the first round (for exclusion in dropdowns)
  const assignedTeamIds = new Set<string>()
  firstRoundMatches.forEach(m => {
    if (m.home_team?.id) assignedTeamIds.add(m.home_team.id)
    if (m.away_team?.id) assignedTeamIds.add(m.away_team.id)
  })

  if (loading) return <p className="text-gray-500">Cargando...</p>
  if (disciplines.length === 0) return <p className="text-gray-500">Agrega disciplinas primero.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Bracket Eliminatorio</h2>
      </div>

      {/* Discipline pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {disciplines.map((d) => (
          <button key={d.id} onClick={() => setSelectedDisc(d.id)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${selectedDisc === d.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
            {SPORT_LABELS[d.name]} {GENDER_LABELS[d.gender]}
          </button>
        ))}
      </div>

      {disc && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border text-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <strong className="text-gray-800">{SPORT_LABELS[disc.name]} {GENDER_LABELS[disc.gender]}</strong>
              <span className="text-gray-300">·</span>
              <span className="text-gray-500">Clasifica: top {disc.qualifying_per_group} por grupo</span>
              {(disc.best_thirds_count ?? 0) > 0 && (
                <span className="text-gray-500"> + {disc.best_thirds_count} mejores terceros</span>
              )}
              <span className="text-gray-300">·</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                seedingMode === 'cross_group' ? 'bg-purple-100 text-purple-700'
                : seedingMode === 'ranked_byes' ? 'bg-amber-100 text-amber-700'
                : seedingMode === 'manual' ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
              }`}>
                {seedingMode === 'cross_group' ? 'Cruces cruzados'
                  : seedingMode === 'ranked_byes' ? 'BYEs para mejores seeds'
                  : seedingMode === 'manual' ? 'Asignación manual'
                  : 'Seeding por mérito'}
              </span>
            </div>
            {hasBracket ? (
              <Badge className="bg-green-100 text-green-800">Bracket activo · {bracketMatches.length} partidos</Badge>
            ) : (
              <Badge variant="secondary">Sin bracket</Badge>
            )}
          </div>
        </div>
      )}

      {!hasBracket ? (
        /* ── Generation Panel ── */
        <div className="max-w-lg space-y-5">
          {/* Preview */}
          {loadingPreview && <p className="text-sm text-gray-400">Calculando bracket...</p>}
          {!loadingPreview && preview && (
            <div className="p-4 border rounded-lg bg-blue-50 border-blue-200 text-sm space-y-3">
              <p className="font-semibold text-blue-900">Vista previa del bracket</p>
              <p className="text-blue-700">{preview.message}</p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {preview.rounds.map((r, i) => (
                  <span key={r} className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-medium">{r}</span>
                    {i < preview.rounds.length - 1 && <span className="text-blue-400 text-xs">→</span>}
                  </span>
                ))}
              </div>
              {preview.byes > 0 && (
                <p className="text-xs text-blue-600">
                  {preview.crossings
                    ? `Los ${preview.byes} BYE(s) quedarán al final de los cruces cruzados.`
                    : `Los ${preview.byes} BYE(s) se asignan automáticamente a los mejores seeds.`}
                </p>
              )}
              {preview.crossings && preview.crossings.length > 0 && (
                <div className="border-t border-blue-200 pt-3">
                  <p className="text-xs font-semibold text-blue-800 mb-2">Cruces esperados en 1ª ronda:</p>
                  <div className="space-y-1.5">
                    {preview.crossings.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-blue-700">
                        <span className="w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center font-bold text-blue-900 flex-shrink-0">{i + 1}</span>
                        <span className="truncate">{c.home}</span>
                        <span className="text-blue-400 font-bold flex-shrink-0">vs</span>
                        <span className="truncate">{c.away}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-blue-500 mt-2">Los cruces son aproximados; el orden final depende de los standings al momento de generar.</p>
                </div>
              )}
            </div>
          )}
          {!loadingPreview && !preview && selectedDisc && (
            <div className="p-4 border rounded-lg bg-amber-50 border-amber-200 text-sm text-amber-800">
              No hay suficientes equipos con partidos jugados en los standings. Asegurate de que la fase regular tenga resultados.
            </div>
          )}

          <div className="flex items-center gap-3">
            <input type="checkbox" id="tp" checked={includeThirdPlace} onChange={(e) => setIncludeThirdPlace(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="tp" className="text-sm">Incluir partido por 3er puesto</label>
          </div>

          <Button onClick={handleGenerate} disabled={generating || !preview}>
            {generating ? 'Generando...' : 'Generar llaves'}
          </Button>

          <p className="text-xs text-gray-400">
            La clasificación se configura en la pestaña Disciplinas (equipos por grupo y mejores terceros).
          </p>
        </div>
      ) : (
        /* ── Bracket View ── */
        <div>
          {/* ── Manual seeding panel ── */}
          {isPendingManualSeeds && (
            <div className="mb-6 p-4 border-2 border-blue-300 rounded-xl bg-blue-50 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-semibold text-blue-900">Asignación de seeds — pendiente</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Asigná un equipo a cada slot. Los slots en blanco se tratarán como BYE al confirmar.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleConfirmSeeds}
                  disabled={confirmingSeeds}
                  className="bg-blue-700 hover:bg-blue-800 text-white"
                >
                  {confirmingSeeds ? 'Procesando...' : 'Confirmar seeds y procesar BYEs'}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {firstRoundMatches.map((m, idx) => {
                  const availableTeams = qualifiedTeams.filter(t =>
                    !assignedTeamIds.has(t.id) || m.home_team?.id === t.id || m.away_team?.id === t.id
                  )
                  return (
                    <div key={m.id} className="bg-white border rounded-lg p-3 space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        {m.bracket_position} — Partido {idx + 1}
                      </p>

                      {/* Home slot */}
                      <div className="space-y-1">
                        <p className="text-xs text-gray-400">Local</p>
                        <select
                          className="w-full text-xs border rounded px-2 py-1.5 bg-white"
                          value={m.home_team?.id ?? ''}
                          onChange={(e) => handleSeedAssign(m.id, 'home', e.target.value || null)}
                        >
                          <option value="">— BYE / Sin asignar —</option>
                          {availableTeams
                            .filter(t => m.home_team?.id === t.id || !assignedTeamIds.has(t.id))
                            .map(t => (
                              <option key={t.id} value={t.id}>
                                {t.position}° {t.groupName}: {t.name}
                              </option>
                            ))}
                        </select>
                        {m.home_team && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: m.home_team.color ?? '#ccc' }} />
                            <span className="text-xs text-green-700 font-medium">{m.home_team.name}</span>
                          </div>
                        )}
                      </div>

                      {/* Away slot */}
                      <div className="space-y-1">
                        <p className="text-xs text-gray-400">Visitante</p>
                        <select
                          className="w-full text-xs border rounded px-2 py-1.5 bg-white"
                          value={m.away_team?.id ?? ''}
                          onChange={(e) => handleSeedAssign(m.id, 'away', e.target.value || null)}
                        >
                          <option value="">— BYE / Sin asignar —</option>
                          {availableTeams
                            .filter(t => m.away_team?.id === t.id || !assignedTeamIds.has(t.id))
                            .map(t => (
                              <option key={t.id} value={t.id}>
                                {t.position}° {t.groupName}: {t.name}
                              </option>
                            ))}
                        </select>
                        {m.away_team && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: m.away_team.color ?? '#ccc' }} />
                            <span className="text-xs text-green-700 font-medium">{m.away_team.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleClear} disabled={clearing} className="text-red-600 border-red-200 hover:bg-red-50">
              {clearing ? 'Eliminando...' : 'Eliminar bracket'}
            </Button>
          </div>

          <div className="flex gap-8 items-start overflow-x-auto pb-4">
            {activeRounds.map((round) => (
              <div key={round} className="flex-shrink-0">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 text-center">{round}</h4>
                <div className="flex flex-col gap-4 justify-around" style={{ minHeight: round.includes('Cuartos') ? 380 : round.includes('Octavos') ? 600 : round.includes('Semi') ? 220 : 110 }}>
                  {(roundsMap.get(round) ?? []).map((m) => (
                    <MatchCard key={m.id} match={m} onSchedule={openSchedule} onAdvance={handleAdvance} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-4">
            Cuando un partido termine en el operador, usa el botón "Avanzar →" para pasar el ganador al siguiente partido.
          </p>
        </div>
      )}

      {/* Schedule dialog */}
      <Dialog open={schedDialog} onOpenChange={setSchedDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Programar — {schedulingMatch?.bracket_position}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Fecha</Label><Input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Hora</Label><Input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} /></div>
            <div className="space-y-2"><Label>Cancha</Label><Input type="number" min={1} value={schedField} onChange={(e) => setSchedField(e.target.value)} placeholder="Nº cancha" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedDialog(false)}>Cancelar</Button>
            <Button onClick={handleScheduleSave} disabled={saving || !schedDate || !schedTime}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
