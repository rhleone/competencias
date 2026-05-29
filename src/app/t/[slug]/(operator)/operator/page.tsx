'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { MatchStatus, DisciplineType, EditionStatus } from '@/types/database'
import { TeamLogo } from '@/components/ui/team-logo'
import { useTenant } from '@/lib/tenant-context'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol', basketball: 'Basketball', volleyball: 'Voleyball', futsal: 'Fútbol Sala',
}

interface Edition { id: string; name: string; status: EditionStatus }
interface FieldName { discipline_id: string; field_number: number; name: string }
interface DashboardMatch {
  id: string; edition_id: string; discipline_id: string; scheduled_at: string | null; field_number: number | null
  status: MatchStatus; home_score: number | null; away_score: number | null
  home_team: { name: string; color: string | null; logo_url: string | null } | null
  away_team: { name: string; color: string | null; logo_url: string | null } | null
  discipline: { name: DisciplineType; gender: string } | null
  edition: { name: string } | null
}

type ViewMode = 'date' | 'pending'

function StatusBadge({ status }: { status: MatchStatus }) {
  if (status === 'live') return <span className="inline-flex items-center gap-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">EN VIVO</span>
  if (status === 'finished') return <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">Finalizado</span>
  if (status === 'postponed') return <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">Suspendido</span>
  return <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Programado</span>
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('es-BO', {
    weekday: 'long', day: '2-digit', month: 'long',
  })
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

function fmtMatchDate(s: string) {
  const [date, time] = s.split('T')
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y} ${time?.slice(0, 5)}`
}

function MatchCard({ m, slug, selectedEdition, courtName }: { m: DashboardMatch; slug: string; selectedEdition: string; courtName: string }) {
  return (
    <div className={`bg-white rounded-lg border p-4 flex items-center justify-between gap-3 ${m.status === 'live' ? 'border-red-200 shadow-sm' : ''}`}>
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
          <span className="text-xs text-gray-400 flex-shrink-0">{courtName}</span>
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
  )
}

export default function OperatorDashboard() {
  const { slug, id: tenantId } = useTenant()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const today = new Date().toISOString().split('T')[0]

  const [editions, setEditions] = useState<Edition[]>([])
  const [selectedEdition, setSelectedEdition] = useState<string>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('date')
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [matches, setMatches] = useState<DashboardMatch[]>([])
  const [pendingMatches, setPendingMatches] = useState<DashboardMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [fieldNames, setFieldNames] = useState<FieldName[]>([])

  useEffect(() => {
    if (selectedEdition === 'all') { setFieldNames([]); return }
    fetch(`/api/editions/${selectedEdition}/field-names`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : { fieldNames: [] })
      .then(({ fieldNames: fn }) => setFieldNames(fn ?? []))
      .catch(() => {})
  }, [selectedEdition])

  useEffect(() => {
    async function loadEditions() {
      const { data } = await supabase.from('editions').select('id, name, status').eq('tenant_id', tenantId).in('status', ['active', 'draft']).order('year', { ascending: false })
      setEditions((data as Edition[]) ?? [])
    }
    loadEditions()
  }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchSelectFields = 'id, edition_id, discipline_id, scheduled_at, field_number, status, home_score, away_score, home_team:home_team_id(name, color, logo_url), away_team:away_team_id(name, color, logo_url), discipline:discipline_id(name, gender), edition:edition_id(name)'

  const loadMatches = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('matches')
      .select(matchSelectFields)
      .gte('scheduled_at', `${selectedDate}T00:00:00`)
      .lte('scheduled_at', `${selectedDate}T23:59:59`)
      .neq('status', 'postponed')
      .order('scheduled_at')
    if (selectedEdition !== 'all') query = query.eq('edition_id', selectedEdition)
    const { data } = await query
    setMatches((data as DashboardMatch[]) ?? [])
    setLoading(false)
  }, [selectedDate, selectedEdition]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPendingMatches = useCallback(async () => {
    // Past matches (before today) that haven't been finished yet
    let query = supabase.from('matches')
      .select(matchSelectFields)
      .lt('scheduled_at', `${today}T00:00:00`)
      .in('status', ['scheduled', 'live'])
      .order('scheduled_at')
    if (selectedEdition !== 'all') query = query.eq('edition_id', selectedEdition)
    const { data } = await query
    const pending = (data as DashboardMatch[]) ?? []
    setPendingMatches(pending)
    setPendingCount(pending.length)
  }, [today, selectedEdition]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadMatches()
    loadPendingMatches()
    const channel = supabase.channel('operator-dashboard')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => {
        loadMatches()
        loadPendingMatches()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadMatches, loadPendingMatches]) // eslint-disable-line react-hooks/exhaustive-deps

  const byTime = new Map<string, DashboardMatch[]>()
  matches.forEach((m) => {
    const t = m.scheduled_at ? m.scheduled_at.split('T')[1]?.slice(0, 5) ?? '—' : '—'
    const arr = byTime.get(t) ?? []; arr.push(m); byTime.set(t, arr)
  })
  const times = [...byTime.keys()].sort()
  const liveCount = matches.filter((m) => m.status === 'live').length

  // Group pending matches by date
  const pendingByDate = new Map<string, DashboardMatch[]>()
  pendingMatches.forEach((m) => {
    const d = m.scheduled_at?.split('T')[0] ?? '—'
    const arr = pendingByDate.get(d) ?? []; arr.push(m); pendingByDate.set(d, arr)
  })
  const pendingDates = [...pendingByDate.keys()].sort()

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">
            {viewMode === 'pending' ? 'Resultados Pendientes' : 'Partidos'}
          </h1>
          {viewMode === 'date' && (
            <p className="text-sm text-gray-500 capitalize mt-0.5">
              {formatDisplayDate(selectedDate)}
              {selectedDate === today && ' · Hoy'}
            </p>
          )}
        </div>
        {liveCount > 0 && viewMode === 'date' && (
          <span className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-1.5 rounded-full font-medium animate-pulse">
            {liveCount} partido{liveCount !== 1 ? 's' : ''} en vivo
          </span>
        )}
      </div>

      {/* View mode tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode('date')}
          className={`text-sm px-3 py-1.5 rounded-full border font-medium transition ${viewMode === 'date' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
        >
          Por fecha
        </button>
        <button
          onClick={() => setViewMode('pending')}
          className={`text-sm px-3 py-1.5 rounded-full border font-medium transition flex items-center gap-1.5 ${viewMode === 'pending' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
        >
          <Clock size={13} />
          Pendientes
          {pendingCount > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${viewMode === 'pending' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Date navigation (only in date mode) */}
      {viewMode === 'date' && (
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            className="p-1.5 rounded-md border border-gray-200 hover:border-gray-400 transition text-gray-600"
            aria-label="Día anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setSelectedDate(today)}
            disabled={selectedDate === today}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-200 font-medium text-gray-600 hover:border-gray-400 transition disabled:opacity-40 disabled:cursor-default"
          >
            Hoy
          </button>
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="p-1.5 rounded-md border border-gray-200 hover:border-gray-400 transition text-gray-600"
            aria-label="Día siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Edition filter */}
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

      {/* Date view */}
      {viewMode === 'date' && (
        loading ? (
          <p className="text-gray-500">Cargando partidos...</p>
        ) : matches.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No hay partidos programados para esta fecha.</p>
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
                      <MatchCard key={m.id} m={m} slug={slug} selectedEdition={selectedEdition} courtName={fieldNames.find(fn => fn.discipline_id === m.discipline_id && fn.field_number === m.field_number)?.name ?? `C${m.field_number}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Pending view */}
      {viewMode === 'pending' && (
        pendingMatches.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No hay resultados pendientes.</p>
            <p className="text-sm mt-1">Todos los partidos pasados han sido cargados.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pendingDates.map((date) => {
              const dayMatches = pendingByDate.get(date) ?? []
              return (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-semibold text-gray-700 text-sm capitalize">{fmtMatchDate(`${date}T00:00`)}</span>
                    <div className="flex-1 h-px bg-amber-200" />
                    <span className="text-xs text-amber-600 font-medium">{dayMatches.length} sin cargar</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {dayMatches.map((m) => (
                      <MatchCard key={m.id} m={m} slug={slug} selectedEdition={selectedEdition} courtName={fieldNames.find(fn => fn.discipline_id === m.discipline_id && fn.field_number === m.field_number)?.name ?? `C${m.field_number}`} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </>
  )
}
