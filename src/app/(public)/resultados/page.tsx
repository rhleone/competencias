'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { APP_NAME } from '@/lib/app-config'
import type { MatchStatus, DisciplineType, GenderType } from '@/types/database'
import { TeamLogo } from '@/components/ui/team-logo'

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol', basketball: 'Basketball', volleyball: 'Voleyball', futsal: 'Fútbol Sala',
}

interface LiveMatch {
  id: string
  scheduled_at: string | null
  field_number: number | null
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  home_team: { name: string; color: string | null; logo_url: string | null } | null
  away_team: { name: string; color: string | null; logo_url: string | null } | null
  discipline: { name: DisciplineType; gender: GenderType } | null
}

interface Standing {
  group_id: string
  team_id: string
  team_name: string
  team_color: string | null
  team_logo_url: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
}

interface GroupInfo {
  id: string
  name: string
  discipline_id: string
  discipline: { name: DisciplineType; gender: GenderType } | null
}

type Tab = 'hoy' | 'posiciones' | 'llaves'

interface BracketMatch {
  id: string
  bracket_position: string
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  scheduled_at: string | null
  field_number: number | null
  home_team: { id: string; name: string; color: string | null; logo_url: string | null } | null
  away_team: { id: string; name: string; color: string | null; logo_url: string | null } | null
  discipline: { id: string; name: DisciplineType; gender: GenderType } | null
  phase: { name: string; phase_type: string } | null
}

const POSITION_ROUND: Record<string, string> = {
  'R16-1': 'Octavos de Final', 'R16-2': 'Octavos de Final', 'R16-3': 'Octavos de Final', 'R16-4': 'Octavos de Final',
  'R16-5': 'Octavos de Final', 'R16-6': 'Octavos de Final', 'R16-7': 'Octavos de Final', 'R16-8': 'Octavos de Final',
  QF1: 'Cuartos de Final', QF2: 'Cuartos de Final', QF3: 'Cuartos de Final', QF4: 'Cuartos de Final',
  SF1: 'Semifinal', SF2: 'Semifinal',
  F: 'Final',
  '3PO': '3er Puesto',
}
const ROUND_ORDER = ['Octavos de Final', 'Cuartos de Final', 'Semifinal', 'Final', '3er Puesto']

function gCls(gender: string) {
  return gender === 'M' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-pink-50 text-pink-700 border-pink-200'
}
function toTime(s: string) { return s.split('T')[1]?.slice(0, 5) ?? '' }

export default function ResultadosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">Cargando...</p></div>}>
      <ResultadosContent />
    </Suspense>
  )
}

function ResultadosContent() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const searchParams = useSearchParams()
  const editionParam = searchParams.get('edition')
  const [tab, setTab] = useState<Tab>('hoy')
  const [editionId, setEditionId] = useState<string | null>(null)
  const [editionName, setEditionName] = useState('')
  const [todayMatches, setTodayMatches] = useState<LiveMatch[]>([])
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingStandings, setLoadingStandings] = useState(false)
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('all')
  const [editionStatus, setEditionStatus] = useState<string>('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [bracketMatches, setBracketMatches] = useState<BracketMatch[]>([])
  const [loadingBracket, setLoadingBracket] = useState(false)

  // Use local date (not UTC) to avoid timezone off-by-one issues
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const loadTodayMatches = useCallback(async (eid: string) => {
    const { data } = await supabase
      .from('matches')
      .select('id, scheduled_at, field_number, status, home_score, away_score, home_team:home_team_id(name, color, logo_url), away_team:away_team_id(name, color, logo_url), discipline:discipline_id(name, gender)')
      .eq('edition_id', eid)
      .gte('scheduled_at', `${today}T00:00:00`)
      .lte('scheduled_at', `${today}T23:59:59`)
      .order('scheduled_at')
    setTodayMatches((data as LiveMatch[]) ?? [])
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadStandings = useCallback(async (eid: string) => {
    setLoadingStandings(true)
    const { data: groupsData } = await supabase
      .from('groups')
      .select('id, name, discipline_id, discipline:discipline_id(name, gender)')
      .eq('edition_id', eid)
      .order('name')
    const allGroups = (groupsData as GroupInfo[]) ?? []
    setGroups(allGroups)

    if (allGroups.length > 0) {
      const groupIds = allGroups.map((g) => g.id)
      const { data: standingsData } = await supabase
        .from('standings')
        .select('group_id, team_id, team_name, team_color, team_logo_url, played, won, drawn, lost, goals_for, goals_against, goal_difference, points')
        .in('group_id', groupIds)
      setStandings((standingsData as Standing[]) ?? [])
    }
    setLoadingStandings(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function init() {
      try {
        let edition: { id: string; name: string; status: string } | null = null

        if (editionParam) {
          // Load specific edition from URL param
          const { data } = await supabase
            .from('editions')
            .select('id, name, status')
            .eq('id', editionParam)
            .maybeSingle()
          edition = data
        } else {
          // Fallback: active edition or latest
          const { data: active } = await supabase
            .from('editions')
            .select('id, name, status')
            .eq('status', 'active')
            .maybeSingle()

          if (active) {
            edition = active
          } else {
            const { data: latest } = await supabase
              .from('editions')
              .select('id, name, status')
              .order('year', { ascending: false })
              .limit(1)
              .maybeSingle()
            edition = latest
          }
        }

        if (edition) {
          setEditionId(edition.id)
          setEditionName(edition.name)
          setEditionStatus(edition.status)
          await loadTodayMatches(edition.id)
        }
      } catch (e) {
        setFetchError('No se pudo conectar al servidor. Verificá tu conexión.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [editionParam]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadBracketMatches = useCallback(async (eid: string) => {
    setLoadingBracket(true)
    const res = await fetch(`/api/editions/${eid}/bracket`)
    const json = await res.json()
    setBracketMatches((json.matches as BracketMatch[]) ?? [])
    setLoadingBracket(false)
  }, [])

  // Load standings when tab changes to posiciones
  useEffect(() => {
    if (tab === 'posiciones' && editionId && groups.length === 0) {
      loadStandings(editionId)
    }
    if (tab === 'llaves' && editionId && bracketMatches.length === 0) {
      loadBracketMatches(editionId)
    }
  }, [tab, editionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Supabase Realtime + polling fallback for live score updates
  useEffect(() => {
    if (!editionId) return

    // Full reload keeps join data intact (payload.new has only raw columns)
    function refresh() {
      loadTodayMatches(editionId!)
      if (tab === 'posiciones') loadStandings(editionId!)
    }

    const channel = supabase
      .channel('public-results')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, refresh)
      .subscribe()

    // Polling every 20s as fallback when Realtime is not enabled in Supabase
    const interval = setInterval(refresh, 20000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [editionId, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Group today's matches
  const liveMatches = todayMatches.filter((m) => m.status === 'live')
  const scheduledMatches = todayMatches.filter((m) => m.status === 'scheduled')
  const finishedMatches = todayMatches.filter((m) => m.status === 'finished')

  // Unique disciplines for filter
  const disciplines = groups
    .reduce<{ id: string; name: DisciplineType; gender: GenderType }[]>((acc, g) => {
      if (g.discipline && !acc.find((d) => d.id === g.discipline_id)) {
        acc.push({ id: g.discipline_id, name: g.discipline.name, gender: g.discipline.gender })
      }
      return acc
    }, [])

  const filteredGroups = selectedDiscipline === 'all'
    ? groups
    : groups.filter((g) => g.discipline_id === selectedDiscipline)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{APP_NAME}</h1>
            <p className="text-blue-300 text-sm mt-0.5">{editionName || 'Resultados en Vivo'}</p>
          </div>
          <Link href="/" className="text-sm text-blue-300 hover:text-white transition">
            ← Inicio
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-0 max-w-4xl mx-auto items-center">
          {[
            { key: 'hoy', label: 'Partidos de Hoy' },
            { key: 'posiciones', label: 'Posiciones' },
            { key: 'llaves', label: 'Llaves' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition ${tab === key ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
          <Link
            href={editionId ? `/fixture?edition=${editionId}` : '/fixture'}
            className="ml-auto text-sm text-gray-400 hover:text-blue-700 transition py-3.5 border-b-2 border-transparent"
          >
            Fixture completo →
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* TAB: HOY */}
        {tab === 'hoy' && (
          <div className="space-y-6">
            {editionStatus === 'draft' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                El campeonato aún está en preparación (borrador). Los resultados se publicarán cuando sea activado.
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 capitalize">
                {now.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })}
              </p>
              {editionId && (
                <button
                  onClick={() => loadTodayMatches(editionId)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Actualizar
                </button>
              )}
            </div>
            {loading ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : fetchError ? (
              <div className="text-center py-10">
                <p className="text-red-500 font-medium">{fetchError}</p>
                <button onClick={() => window.location.reload()} className="mt-3 text-sm text-blue-600 hover:underline">Reintentar</button>
              </div>
            ) : todayMatches.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay partidos programados para hoy.</p>
            ) : (
              <>
                {/* Live matches first */}
                {liveMatches.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="font-semibold text-red-600 flex items-center gap-2">
                      <span className="animate-pulse">⬤</span> En vivo ({liveMatches.length})
                    </h2>
                    {liveMatches.map((m) => (
                      <MatchCard key={m.id} match={m} />
                    ))}
                  </div>
                )}

                {/* Scheduled */}
                {scheduledMatches.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="font-semibold text-gray-700">Próximos</h2>
                    {scheduledMatches.map((m) => (
                      <MatchCard key={m.id} match={m} />
                    ))}
                  </div>
                )}

                {/* Finished */}
                {finishedMatches.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="font-semibold text-gray-500">Finalizados</h2>
                    {finishedMatches.map((m) => (
                      <MatchCard key={m.id} match={m} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB: LLAVES */}
        {tab === 'llaves' && (
          <div className="space-y-8">
            {loadingBracket ? (
              <p className="text-gray-400 text-center py-10">Cargando llaves...</p>
            ) : bracketMatches.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay bracket eliminatorio disponible aún.</p>
            ) : (
              <PublicBracket matches={bracketMatches} />
            )}
          </div>
        )}

        {/* TAB: POSICIONES */}
        {tab === 'posiciones' && (
          <div className="space-y-6">
            {loadingStandings ? (
              <p className="text-gray-400 text-center py-10">Cargando posiciones...</p>
            ) : groups.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay grupos configurados.</p>
            ) : (
              <>
                {/* Discipline filter */}
                {disciplines.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedDiscipline('all')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${selectedDiscipline === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}
                    >
                      Todos
                    </button>
                    {disciplines.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDiscipline(d.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${gCls(d.gender)} ${selectedDiscipline === d.id ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                      >
                        {SPORT_LABELS[d.name]} {d.gender}
                      </button>
                    ))}
                  </div>
                )}

                {filteredGroups.map((group) => {
                  const groupStandings = standings
                    .filter((s) => s.group_id === group.id)
                    .sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference || b.goals_for - a.goals_for)

                  if (groupStandings.length === 0) return null

                  return (
                    <div key={group.id} className="bg-white rounded-lg border overflow-hidden">
                      <div className={`px-4 py-2.5 flex items-center gap-3 border-b ${group.discipline?.gender === 'M' ? 'bg-blue-50' : 'bg-pink-50'}`}>
                        {group.discipline && (
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${gCls(group.discipline.gender)}`}>
                            {SPORT_LABELS[group.discipline.name]} {group.discipline.gender}
                          </span>
                        )}
                        <span className="font-semibold text-sm">{group.name}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-xs text-gray-500 bg-gray-50 border-b">
                            <tr>
                              <th className="text-left px-4 py-2 font-medium">Equipo</th>
                              <th className="px-2 py-2 font-medium text-center">PJ</th>
                              <th className="px-2 py-2 font-medium text-center">G</th>
                              <th className="px-2 py-2 font-medium text-center">E</th>
                              <th className="px-2 py-2 font-medium text-center">P</th>
                              <th className="px-2 py-2 font-medium text-center">GF</th>
                              <th className="px-2 py-2 font-medium text-center">GC</th>
                              <th className="px-2 py-2 font-medium text-center">DG</th>
                              <th className="px-3 py-2 font-medium text-center text-blue-700">Pts</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {groupStandings.map((s, i) => (
                              <tr key={s.team_id} className={i === 0 && s.played > 0 ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                                <td className="px-4 py-2.5 font-medium">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-400 text-xs">{i + 1}.</span>
                                    <TeamLogo logoUrl={s.team_logo_url} color={s.team_color} name={s.team_name} size="xs" />
                                    {s.team_name}
                                  </div>
                                </td>
                                <td className="px-2 py-2.5 text-center text-gray-500">{s.played}</td>
                                <td className="px-2 py-2.5 text-center text-green-600 font-medium">{s.won}</td>
                                <td className="px-2 py-2.5 text-center text-gray-500">{s.drawn}</td>
                                <td className="px-2 py-2.5 text-center text-red-500">{s.lost}</td>
                                <td className="px-2 py-2.5 text-center text-gray-500">{s.goals_for}</td>
                                <td className="px-2 py-2.5 text-center text-gray-500">{s.goals_against}</td>
                                <td className="px-2 py-2.5 text-center text-gray-500">
                                  {s.goal_difference > 0 ? `+${s.goal_difference}` : s.goal_difference}
                                </td>
                                <td className="px-3 py-2.5 text-center font-bold text-blue-700 text-base">{s.points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PublicBracket({ matches }: { matches: BracketMatch[] }) {
  // Group by discipline
  const disciplineMap = new Map<string, { disc: BracketMatch['discipline']; matches: BracketMatch[] }>()
  for (const m of matches) {
    const discId = m.discipline?.id ?? 'unknown'
    if (!disciplineMap.has(discId)) disciplineMap.set(discId, { disc: m.discipline, matches: [] })
    disciplineMap.get(discId)!.matches.push(m)
  }

  return (
    <div className="space-y-10">
      {Array.from(disciplineMap.entries()).map(([discId, { disc, matches: dMatches }]) => {
        // Group by round
        const roundMap = new Map<string, BracketMatch[]>()
        for (const m of dMatches) {
          const round = POSITION_ROUND[m.bracket_position] ?? 'Final'
          if (!roundMap.has(round)) roundMap.set(round, [])
          roundMap.get(round)!.push(m)
        }
        const rounds = ROUND_ORDER.filter(r => roundMap.has(r))

        return (
          <div key={discId}>
            {disc && (
              <h3 className={`text-sm font-semibold px-3 py-1.5 rounded-full inline-block mb-4 ${gCls(disc.gender)}`}>
                {SPORT_LABELS[disc.name]} {disc.gender}
              </h3>
            )}
            <div className="flex gap-4 overflow-x-auto pb-2">
              {rounds.map((round) => (
                <div key={round} className="flex-shrink-0">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 text-center">{round}</p>
                  <div className="flex flex-col gap-3 justify-around" style={{ minHeight: 80 }}>
                    {(roundMap.get(round) ?? []).map((m) => (
                      <BracketCard key={m.id} match={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BracketCard({ match }: { match: BracketMatch }) {
  const isFinished = match.status === 'finished'
  const isLive = match.status === 'live'
  const isBye = isFinished && (match.home_team === null || match.away_team === null)
  const homeWin = isFinished && !isBye && (match.home_score ?? 0) > (match.away_score ?? 0)
  const awayWin = isFinished && !isBye && (match.away_score ?? 0) > (match.home_score ?? 0)

  if (isBye) {
    // BYE matches: just show the advancing team
    const team = match.home_team ?? match.away_team
    return (
      <div className="bg-white border rounded-lg overflow-hidden w-52 shadow-sm opacity-60">
        <div className="flex items-center justify-between px-2.5 py-1 border-b bg-gray-50">
          <span className="text-xs text-gray-400 font-bold">{match.bracket_position}</span>
          <span className="text-xs text-gray-400">BYE</span>
        </div>
        <div className="flex items-center px-2.5 py-2 gap-2 text-sm font-medium">
          {team && <TeamLogo logoUrl={team.logo_url} color={team.color} name={team.name} size="xs" />}
          <span className="flex-1 truncate">{team?.name ?? '—'}</span>
          <span className="text-xs text-gray-400">avanza</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white border rounded-lg overflow-hidden w-52 shadow-sm ${isLive ? 'border-red-300' : ''}`}>
      <div className="flex items-center justify-between px-2.5 py-1 border-b bg-gray-50">
        <span className="text-xs text-gray-400 font-bold">{match.bracket_position}</span>
        {isLive && <span className="text-xs text-red-600 font-bold animate-pulse">EN VIVO</span>}
        {isFinished && <span className="text-xs text-gray-400">Final</span>}
        {match.scheduled_at && !isLive && !isFinished && (
          <span className="text-xs text-gray-400">{toTime(match.scheduled_at)}</span>
        )}
      </div>
      <div className={`flex items-center px-2.5 py-1.5 gap-2 border-b text-sm ${homeWin ? 'bg-yellow-50 font-bold' : ''}`}>
        {match.home_team ? (
          <>
            <TeamLogo logoUrl={match.home_team.logo_url} color={match.home_team.color} name={match.home_team.name} size="xs" />
            <span className="flex-1 truncate">{match.home_team.name}</span>
            {(isLive || isFinished) && <span className="font-mono font-bold">{match.home_score ?? 0}</span>}
          </>
        ) : <span className="text-gray-400 text-xs italic">Por definir</span>}
      </div>
      <div className={`flex items-center px-2.5 py-1.5 gap-2 text-sm ${awayWin ? 'bg-yellow-50 font-bold' : ''}`}>
        {match.away_team ? (
          <>
            <TeamLogo logoUrl={match.away_team.logo_url} color={match.away_team.color} name={match.away_team.name} size="xs" />
            <span className="flex-1 truncate">{match.away_team.name}</span>
            {(isLive || isFinished) && <span className="font-mono font-bold">{match.away_score ?? 0}</span>}
          </>
        ) : <span className="text-gray-400 text-xs italic">Por definir</span>}
      </div>
    </div>
  )
}

function MatchCard({ match }: { match: LiveMatch }) {
  const isActive = match.status === 'live' || match.status === 'finished'
  return (
    <div className={`bg-white rounded-lg border p-4 ${match.status === 'live' ? 'border-red-200 shadow-sm' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {match.discipline && (
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${match.discipline.gender === 'M' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-pink-50 text-pink-700 border-pink-200'}`}>
              {SPORT_LABELS[match.discipline.name]} {match.discipline.gender}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {match.scheduled_at ? toTime(match.scheduled_at) : ''} · C{match.field_number}
          </span>
        </div>
        {match.status === 'live' && (
          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">EN VIVO</span>
        )}
        {match.status === 'finished' && (
          <span className="text-xs text-gray-400">Final</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TeamLogo logoUrl={match.home_team?.logo_url} color={match.home_team?.color} name={match.home_team?.name} size="sm" />
          <span className="font-medium text-sm truncate">{match.home_team?.name}</span>
        </div>
        <div className="flex-shrink-0 text-center px-2">
          {isActive ? (
            <span className={`text-2xl font-bold tabular-nums ${match.status === 'live' ? 'text-red-600' : 'text-gray-800'}`}>
              {match.home_score ?? 0} — {match.away_score ?? 0}
            </span>
          ) : (
            <span className="text-sm text-gray-400 font-medium">VS</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="font-medium text-sm truncate text-right">{match.away_team?.name}</span>
          <TeamLogo logoUrl={match.away_team?.logo_url} color={match.away_team?.color} name={match.away_team?.name} size="sm" />
        </div>
      </div>
    </div>
  )
}
