'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { MatchStatus, DisciplineType, GenderType } from '@/types/database'
import { TeamLogo } from '@/components/ui/team-logo'

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol', basketball: 'Basketball', volleyball: 'Voleyball', futsal: 'Fútbol Sala',
}

interface FixtureMatch {
  id: string
  scheduled_at: string | null
  field_number: number | null
  match_day: number | null
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  bracket_position: string | null
  home_team: { name: string; color: string | null; logo_url: string | null } | null
  away_team: { name: string; color: string | null; logo_url: string | null } | null
  discipline: { id: string; name: DisciplineType; gender: GenderType } | null
  group: { name: string } | null
}

interface DiscFilter { id: string; name: DisciplineType; gender: GenderType }

type StatusFilter = 'all' | 'upcoming' | 'live' | 'finished'

function pad(n: number) { return String(n).padStart(2, '0') }
function toTime(s: string) { return s.split('T')[1]?.slice(0, 5) ?? '' }
function toLocalDate(s: string) {
  const [y, m, d] = s.split('T')[0].split('-')
  return `${y}-${m}-${d}`
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function gCls(gender: string) {
  return gender === 'M' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-pink-50 text-pink-700 border-pink-200'
}
const STATUS_MAP: Record<MatchStatus, string> = {
  scheduled: 'Programado', live: 'En vivo', finished: 'Final', postponed: 'Postergado',
}

export default function FixturePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any

  const [matches, setMatches] = useState<FixtureMatch[]>([])
  const [disciplines, setDisciplines] = useState<DiscFilter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editionName, setEditionName] = useState('')
  const [editionId, setEditionId] = useState<string | null>(null)

  // Filters
  const [discFilter, setDiscFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<string>('')

  const loadMatches = useCallback(async (eid: string) => {
    try {
      const { data, error: err } = await supabase
        .from('matches')
        .select('id, scheduled_at, field_number, match_day, status, home_score, away_score, bracket_position, home_team:home_team_id(name, color, logo_url), away_team:away_team_id(name, color, logo_url), discipline:discipline_id(id, name, gender), group:group_id(name)')
        .eq('edition_id', eid)
        .not('scheduled_at', 'is', null)
        .order('scheduled_at')
      if (err) throw err
      const list = (data as FixtureMatch[]) ?? []
      setMatches(list)

      // Build discipline filter list
      const seen = new Set<string>()
      const discs: DiscFilter[] = []
      for (const m of list) {
        if (m.discipline && !seen.has(m.discipline.id)) {
          seen.add(m.discipline.id)
          discs.push({ id: m.discipline.id, name: m.discipline.name, gender: m.discipline.gender })
        }
      }
      setDisciplines(discs)
    } catch (e) {
      setError((e as Error).message)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function init() {
      try {
        let edition: { id: string; name: string } | null = null
        const { data: active } = await supabase.from('editions').select('id, name').eq('status', 'active').maybeSingle()
        if (active) { edition = active }
        else {
          const { data: latest } = await supabase.from('editions').select('id, name').order('year', { ascending: false }).limit(1).maybeSingle()
          edition = latest
        }
        if (edition) {
          setEditionId(edition.id)
          setEditionName(edition.name)
          await loadMatches(edition.id)
        }
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling for live score updates
  useEffect(() => {
    if (!editionId) return
    const interval = setInterval(() => {
      const liveExists = matches.some(m => m.status === 'live')
      if (liveExists) loadMatches(editionId)
    }, 20000)
    return () => clearInterval(interval)
  }, [editionId, matches, loadMatches])

  // Apply filters
  const filtered = matches.filter(m => {
    if (discFilter !== 'all' && m.discipline?.id !== discFilter) return false
    if (statusFilter !== 'all') {
      if (statusFilter === 'upcoming' && m.status !== 'scheduled') return false
      if (statusFilter === 'live' && m.status !== 'live') return false
      if (statusFilter === 'finished' && m.status !== 'finished') return false
    }
    if (dateFilter && m.scheduled_at && toLocalDate(m.scheduled_at) !== dateFilter) return false
    return true
  })

  // Group by date
  const byDate = new Map<string, FixtureMatch[]>()
  for (const m of filtered) {
    const d = m.scheduled_at ? toLocalDate(m.scheduled_at) : 'sin-fecha'
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(m)
  }

  // Stats
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const totalPlayed = matches.filter(m => m.status === 'finished').length
  const totalLive = matches.filter(m => m.status === 'live').length
  const totalPending = matches.filter(m => m.status === 'scheduled').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Fixture Completo</h1>
            <p className="text-blue-300 text-sm mt-0.5">{editionName}</p>
          </div>
          <Link href="/resultados" className="text-sm text-blue-200 hover:text-white transition">
            Resultados en vivo →
          </Link>
        </div>
      </header>

      {/* Stats bar */}
      {!loading && matches.length > 0 && (
        <div className="bg-blue-800 text-white px-6 py-2.5">
          <div className="max-w-4xl mx-auto flex gap-6 text-sm">
            <span><strong className="text-white">{totalPlayed}</strong> <span className="text-blue-300">finalizados</span></span>
            {totalLive > 0 && <span className="text-green-300 font-semibold animate-pulse">⬤ {totalLive} en vivo</span>}
            <span><strong className="text-white">{totalPending}</strong> <span className="text-blue-300">próximos</span></span>
            <span><strong className="text-white">{matches.length}</strong> <span className="text-blue-300">total</span></span>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-5">

        {/* Filters */}
        <div className="space-y-3 mb-6">
          {/* Discipline filter */}
          {disciplines.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setDiscFilter('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${discFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
              >
                Todas las disciplinas
              </button>
              {disciplines.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDiscFilter(d.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${discFilter === d.id ? `${gCls(d.gender)} ring-1 ring-current` : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
                >
                  {SPORT_LABELS[d.name]} {d.gender}
                </button>
              ))}
            </div>
          )}

          {/* Status + Date filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {(['all', 'upcoming', 'live', 'finished'] as StatusFilter[]).map(s => {
              const labels: Record<StatusFilter, string> = { all: 'Todos', upcoming: 'Próximos', live: 'En vivo', finished: 'Finalizados' }
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${statusFilter === s ? (s === 'live' ? 'bg-green-600 text-white border-green-600' : 'bg-gray-900 text-white border-gray-900') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}>
                  {labels[s]}
                </button>
              )
            })}
            <div className="flex items-center gap-1.5 ml-auto">
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="text-xs text-gray-400 hover:text-gray-700">✕</button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Cargando fixture...</div>
        ) : error ? (
          <div className="text-center py-16 text-red-500">
            <p className="font-medium">Error al cargar el fixture</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {matches.length === 0 ? 'No hay partidos programados aún.' : 'No hay partidos que coincidan con los filtros.'}
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(byDate.entries()).map(([date, dayMatches]) => (
              <div key={date}>
                <div className={`flex items-center gap-3 mb-3 ${date === todayStr ? 'text-blue-700' : 'text-gray-500'}`}>
                  <h2 className={`text-sm font-bold uppercase tracking-wide capitalize ${date === todayStr ? 'text-blue-700' : 'text-gray-500'}`}>
                    {fmtDate(date)}
                  </h2>
                  {date === todayStr && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Hoy</span>
                  )}
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs text-gray-400">{dayMatches.length} partidos</span>
                </div>
                <div className="space-y-2">
                  {dayMatches.map(m => (
                    <FixtureMatchCard key={m.id} match={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 pt-4 border-t text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}

function FixtureMatchCard({ match }: { match: FixtureMatch }) {
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'
  const isPostponed = match.status === 'postponed'
  const homeWin = isFinished && (match.home_score ?? 0) > (match.away_score ?? 0)
  const awayWin = isFinished && (match.away_score ?? 0) > (match.home_score ?? 0)

  return (
    <div className={`bg-white rounded-lg border px-4 py-3 flex items-center gap-3 ${isLive ? 'border-green-300 shadow-sm' : 'border-gray-100'} ${isPostponed ? 'opacity-60' : ''}`}>
      {/* Time + field */}
      <div className="flex flex-col items-center min-w-[48px] text-xs text-gray-400 flex-shrink-0">
        <span className={`font-mono font-semibold ${isLive ? 'text-green-600' : 'text-gray-600'}`}>
          {match.scheduled_at ? toTime(match.scheduled_at) : '—'}
        </span>
        {match.field_number && <span>C{match.field_number}</span>}
      </div>

      {/* Discipline badge */}
      {match.discipline && (
        <span className={`hidden sm:inline-flex text-xs px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${gCls(match.discipline.gender)}`}>
          {SPORT_LABELS[match.discipline.name]} {match.discipline.gender}
        </span>
      )}

      {/* Teams + score */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {/* Home */}
        <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-end ${homeWin ? 'font-bold' : ''}`}>
          <span className="truncate text-sm">{match.home_team?.name ?? '?'}</span>
          <TeamLogo logoUrl={match.home_team?.logo_url} color={match.home_team?.color} name={match.home_team?.name} size="xs" />
        </div>

        {/* Score / VS */}
        <div className="flex-shrink-0 text-center min-w-[52px]">
          {isLive || isFinished ? (
            <span className={`font-mono font-bold text-base ${isLive ? 'text-green-600' : 'text-gray-800'}`}>
              {match.home_score ?? 0} – {match.away_score ?? 0}
            </span>
          ) : (
            <span className="text-sm text-gray-400 font-medium">vs</span>
          )}
        </div>

        {/* Away */}
        <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${awayWin ? 'font-bold' : ''}`}>
          <TeamLogo logoUrl={match.away_team?.logo_url} color={match.away_team?.color} name={match.away_team?.name} size="xs" />
          <span className="truncate text-sm">{match.away_team?.name ?? '?'}</span>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        {isLive && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold animate-pulse">EN VIVO</span>}
        {isFinished && <span className="text-xs text-gray-400">Final</span>}
        {isPostponed && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Postergado</span>}
        {match.bracket_position && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">{match.bracket_position}</span>
        )}
        {match.group && !match.bracket_position && (
          <span className="text-xs text-gray-400">{match.group.name}</span>
        )}
        {match.match_day && !match.bracket_position && (
          <span className="text-xs text-gray-300">J{match.match_day}</span>
        )}
      </div>
    </div>
  )
}

// Keep compiler happy with unused reference
void STATUS_MAP
