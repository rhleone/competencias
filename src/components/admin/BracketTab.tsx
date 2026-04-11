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

      // Load groups and standings to calculate total
      const { data: groupsData } = await supabase.from('groups').select('id, name').eq('edition_id', editionId).eq('discipline_id', discId).order('name')
      const groups: { id: string }[] = groupsData ?? []
      if (groups.length === 0) { setPreview(null); setLoadingPreview(false); return }

      const groupIds = groups.map((g: { id: string }) => g.id)
      const { data: standingsData } = await db.from('standings').select('group_id, team_id').in('group_id', groupIds)
      const rows: { group_id: string }[] = standingsData ?? []

      // Count qualifying per group
      let total = 0
      for (const g of groups) {
        const count = rows.filter((r) => r.group_id === g.id).length
        total += Math.min(qpg, count)
      }
      total += Math.min(btc, Math.max(0, rows.length - total)) // approximate best thirds

      if (total < 2) { setPreview(null); setLoadingPreview(false); return }

      const bracketSize = nextPow2(total)
      const byes = bracketSize - total
      const roundDefs = getRoundDefs(bracketSize)
      const roundNames = roundDefs.map(r => r.phaseName)
      if (includeThirdPlace && bracketSize >= 4) roundNames.splice(roundNames.length - 1, 0, '3er Puesto')

      setPreview({
        total,
        bracketSize,
        byes,
        rounds: roundNames,
        message: `${total} equipos · bracket de ${bracketSize} · ${byes} BYE(s)`,
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
          <div className="flex items-center justify-between">
            <div>
              <strong className="text-gray-800">{SPORT_LABELS[disc.name]} {GENDER_LABELS[disc.gender]}</strong>
              <span className="mx-2 text-gray-300">·</span>
              <span className="text-gray-500">Clasifica: top {disc.qualifying_per_group} por grupo</span>
              {(disc.best_thirds_count ?? 0) > 0 && (
                <span className="text-gray-500"> + {disc.best_thirds_count} mejores terceros</span>
              )}
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
                  Los {preview.byes} BYE(s) se asignan automáticamente a los mejores seeds.
                </p>
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
