'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { MatchStatus, DisciplineType } from '@/types/database'
import { TeamLogo } from '@/components/ui/team-logo'

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol', basketball: 'Basketball', volleyball: 'Voleyball', futsal: 'Fútbol Sala',
}

interface DashboardMatch {
  id: string
  scheduled_at: string | null
  field_number: number | null
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  home_team: { name: string; color: string | null; logo_url: string | null } | null
  away_team: { name: string; color: string | null; logo_url: string | null } | null
  discipline: { name: DisciplineType; gender: string } | null
}

function StatusBadge({ status }: { status: MatchStatus }) {
  if (status === 'live') return (
    <span className="inline-flex items-center gap-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
      ⬤ EN VIVO
    </span>
  )
  if (status === 'finished') return <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">Finalizado</span>
  if (status === 'postponed') return <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">Suspendido</span>
  return <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Programado</span>
}

export default function OperatorDashboard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const [matches, setMatches] = useState<DashboardMatch[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().split('T')[0]

  const loadMatches = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select('id, scheduled_at, field_number, status, home_score, away_score, home_team:home_team_id(name, color, logo_url), away_team:away_team_id(name, color, logo_url), discipline:discipline_id(name, gender)')
      .gte('scheduled_at', `${today}T00:00:00`)
      .lte('scheduled_at', `${today}T23:59:59`)
      .neq('status', 'postponed')
      .order('scheduled_at')
    setMatches((data as DashboardMatch[]) ?? [])
    setLoading(false)
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadMatches()
    const channel = supabase
      .channel('operator-dashboard')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => {
        loadMatches()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadMatches])

  // Group by time slot
  const byTime = new Map<string, DashboardMatch[]>()
  matches.forEach((m) => {
    const t = m.scheduled_at ? m.scheduled_at.split('T')[1]?.slice(0, 5) ?? '—' : '—'
    const arr = byTime.get(t) ?? []; arr.push(m); byTime.set(t, arr)
  })
  const times = [...byTime.keys()].sort()

  const liveCount = matches.filter((m) => m.status === 'live').length

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Partidos de Hoy</h1>
          <p className="text-sm text-gray-500 capitalize mt-0.5">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        {liveCount > 0 && (
          <span className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-1.5 rounded-full font-medium animate-pulse">
            {liveCount} partido{liveCount !== 1 ? 's' : ''} en vivo
          </span>
        )}
      </div>

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
                        href={`/operator/matches/${m.id}`}
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
