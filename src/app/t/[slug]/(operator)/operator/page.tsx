'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { MatchStatus, DisciplineType, EditionStatus } from '@/types/database'
import { TeamLogo } from '@/components/ui/team-logo'
import { useTenant } from '@/lib/tenant-context'

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol', basketball: 'Basketball', volleyball: 'Voleyball', futsal: 'Fútbol Sala',
}

interface Edition { id: string; name: string; status: EditionStatus }
interface DashboardMatch {
  id: string; edition_id: string; scheduled_at: string | null; field_number: number | null
  status: MatchStatus; home_score: number | null; away_score: number | null
  home_team: { name: string; color: string | null; logo_url: string | null } | null
  away_team: { name: string; color: string | null; logo_url: string | null } | null
  discipline: { name: DisciplineType; gender: string } | null
  edition: { name: string } | null
}

function StatusBadge({ status }: { status: MatchStatus }) {
  if (status === 'live') return <span className="inline-flex items-center gap-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">EN VIVO</span>
  if (status === 'finished') return <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">Finalizado</span>
  if (status === 'postponed') return <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">Suspendido</span>
  return <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Programado</span>
}

export default function OperatorDashboard() {
  const { slug } = useTenant()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const [editions, setEditions] = useState<Edition[]>([])
  const [selectedEdition, setSelectedEdition] = useState<string>('all')
  const [matches, setMatches] = useState<DashboardMatch[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function loadEditions() {
      const { data } = await supabase.from('editions').select('id, name, status').in('status', ['active', 'draft']).order('year', { ascending: false })
      setEditions((data as Edition[]) ?? [])
    }
    loadEditions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMatches = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('matches')
      .select('id, edition_id, scheduled_at, field_number, status, home_score, away_score, home_team:home_team_id(name, color, logo_url), away_team:away_team_id(name, color, logo_url), discipline:discipline_id(name, gender), edition:edition_id(name)')
      .gte('scheduled_at', `${today}T00:00:00`)
      .lte('scheduled_at', `${today}T23:59:59`)
      .neq('status', 'postponed')
      .order('scheduled_at')
    if (selectedEdition !== 'all') query = query.eq('edition_id', selectedEdition)
    const { data } = await query
    setMatches((data as DashboardMatch[]) ?? [])
    setLoading(false)
  }, [today, selectedEdition]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadMatches()
    const channel = supabase.channel('operator-dashboard')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => loadMatches())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadMatches])

  const byTime = new Map<string, DashboardMatch[]>()
  matches.forEach((m) => {
    const t = m.scheduled_at ? m.scheduled_at.split('T')[1]?.slice(0, 5) ?? '—' : '—'
    const arr = byTime.get(t) ?? []; arr.push(m); byTime.set(t, arr)
  })
  const times = [...byTime.keys()].sort()
  const liveCount = matches.filter((m) => m.status === 'live').length

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Partidos de Hoy</h1>
          <p className="text-sm text-gray-500 capitalize mt-0.5">
            {new Date().toLocaleDateString('es-BO', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        {liveCount > 0 && (
          <span className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-1.5 rounded-full font-medium animate-pulse">
            {liveCount} partido{liveCount !== 1 ? 's' : ''} en vivo
          </span>
        )}
      </div>

      {editions.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-6">
          <button onClick={() => setSelectedEdition('all')} className={`text-sm px-3 py-1.5 rounded-full border font-medium transition ${selectedEdition === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
            Todas
          </button>
          {editions.map((e) => (
            <button key={e.id} onClick={() => setSelectedEdition(e.id)} className={`text-sm px-3 py-1.5 rounded-full border font-medium transition ${selectedEdition === e.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Cargando partidos...</p>
      ) : matches.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No hay partidos programados para hoy.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {times.map((time) => {
            const slotMatches = byTime.get(time) ?? []
            return (
              <div key={time}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono font-semibold text-gray-700 text-sm">{time}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">{slotMatches.length} partido{slotMatches.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {slotMatches.map((m) => (
                    <div key={m.id} className={`bg-white rounded-lg border p-4 flex items-center justify-between gap-3 ${m.status === 'live' ? 'border-red-200 shadow-sm' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {selectedEdition === 'all' && m.edition && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium flex-shrink-0">{m.edition.name}</span>
                          )}
                          {m.discipline && (
                            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${m.discipline.gender === 'M' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-pink-50 text-pink-700 border-pink-200'}`}>
                              {SPORT_LABELS[m.discipline.name]} {m.discipline.gender}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 flex-shrink-0">C{m.field_number}</span>
                          <StatusBadge status={m.status} />
                        </div>
                        <p className="font-medium text-sm truncate flex items-center gap-1.5">
                          <TeamLogo logoUrl={m.home_team?.logo_url} color={m.home_team?.color} name={m.home_team?.name} size="xs" />
                          {m.home_team?.name}
                          <span className="text-gray-400 font-normal">vs</span>
                          {m.away_team?.name}
                          <TeamLogo logoUrl={m.away_team?.logo_url} color={m.away_team?.color} name={m.away_team?.name} size="xs" />
                        </p>
                        {(m.status === 'live' || m.status === 'finished') && (
                          <p className={`text-2xl font-bold mt-1 tabular-nums ${m.status === 'live' ? 'text-red-600' : 'text-gray-700'}`}>
                            {m.home_score ?? 0} — {m.away_score ?? 0}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/t/${slug}/operator/matches/${m.id}`}
                        className="flex-shrink-0 text-sm bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-700 transition font-medium whitespace-nowrap"
                      >
                        Gestionar
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
