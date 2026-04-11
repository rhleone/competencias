'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { toast } from 'sonner'
import type { MatchStatus, DisciplineType } from '@/types/database'

const SPORT_LABELS: Record<DisciplineType, string> = {
  football: 'Fútbol', basketball: 'Basketball', volleyball: 'Voleyball', futsal: 'Fútbol Sala',
}

interface MatchDetail {
  id: string
  edition_id: string
  scheduled_at: string | null
  field_number: number | null
  match_day: number | null
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  notes: string | null
  bracket_position: string | null
  winner_advances_to: string | null
  winner_slot: string | null
  home_team: { id: string; name: string; color: string | null } | null
  away_team: { id: string; name: string; color: string | null } | null
  discipline: { name: DisciplineType; gender: string } | null
  group: { name: string } | null
}

function fmtDateTime(s: string) {
  const [date, time] = s.split('T')
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y} ${time?.slice(0, 5)}`
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  async function loadMatch() {
    const { data } = await supabase
      .from('matches')
      .select('id, edition_id, scheduled_at, field_number, match_day, status, home_score, away_score, notes, bracket_position, winner_advances_to, winner_slot, home_team:home_team_id(id, name, color), away_team:away_team_id(id, name, color), discipline:discipline_id(name, gender), group:group_id(name)')
      .eq('id', id)
      .single()
    if (data) {
      const m = data as MatchDetail
      setMatch(m)
      setHomeScore(m.home_score ?? 0)
      setAwayScore(m.away_score ?? 0)
      setNotes(m.notes ?? '')
    }
    setLoading(false)
  }

  useEffect(() => { loadMatch() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function changeStatus(newStatus: MatchStatus) {
    if (!match) return
    setChangingStatus(true)
    const update: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'live') {
      update.home_score = 0
      update.away_score = 0
    }
    const { error } = await supabase.from('matches').update(update).eq('id', id)
    setChangingStatus(false)
    if (error) { toast.error('Error al cambiar estado'); return }
    toast.success(newStatus === 'live' ? 'Partido iniciado' : newStatus === 'finished' ? 'Partido finalizado' : 'Estado actualizado')

    // Auto-advance winner in bracket matches
    if (newStatus === 'finished' && match.winner_advances_to) {
      const advRes = await fetch(`/api/editions/${match.edition_id}/bracket/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id }),
      })
      if (advRes.ok) {
        toast.success('Ganador avanzado al siguiente partido')
      } else {
        const j = await advRes.json()
        toast.warning(`Partido finalizado pero no se pudo avanzar al siguiente: ${j.error}`)
      }
    }

    loadMatch()
  }

  async function saveResult() {
    if (!match) return
    setSaving(true)
    const { error } = await supabase.from('matches').update({
      home_score: homeScore,
      away_score: awayScore,
      notes: notes || null,
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Resultado guardado')
    loadMatch()
  }

  if (loading) return <p className="text-gray-500">Cargando partido...</p>
  if (!match) return <p className="text-gray-500">Partido no encontrado.</p>

  const isEditable = match.status === 'live' || match.status === 'scheduled'
  const genderCls = match.discipline?.gender === 'M'
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-pink-50 text-pink-700 border-pink-200'

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/operator" className="text-gray-400 hover:text-gray-600 text-sm">← Volver</Link>
      </div>

      {/* Match header */}
      <div className="bg-white rounded-xl border p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {match.discipline && (
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${genderCls}`}>
              {SPORT_LABELS[match.discipline.name]} {match.discipline.gender}
            </span>
          )}
          {match.group && <span className="text-xs text-gray-400">{match.group.name}</span>}
          {match.bracket_position && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">{match.bracket_position}</span>
          )}
          {match.match_day && !match.bracket_position && <span className="text-xs text-gray-400">Jornada {match.match_day}</span>}
          <span className="text-xs text-gray-400">Campo {match.field_number}</span>
          {match.scheduled_at && (
            <span className="text-xs text-gray-400">{fmtDateTime(match.scheduled_at)}</span>
          )}
        </div>

        {/* Score display */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="text-center flex-1">
            <div
              className="w-8 h-8 rounded-full mx-auto mb-2 border-2 border-white shadow"
              style={{ backgroundColor: match.home_team?.color ?? '#3B82F6' }}
            />
            <p className="font-semibold text-sm">{match.home_team?.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">Local</p>
          </div>
          <div className="text-center">
            {match.status === 'scheduled' ? (
              <p className="text-gray-400 text-sm font-medium">VS</p>
            ) : (
              <p className={`text-4xl font-bold tabular-nums ${match.status === 'live' ? 'text-red-600' : 'text-gray-800'}`}>
                {match.home_score ?? 0} — {match.away_score ?? 0}
              </p>
            )}
            <div className="mt-1">
              {match.status === 'live' && (
                <span className="inline-flex items-center gap-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
                  ⬤ EN VIVO
                </span>
              )}
              {match.status === 'finished' && (
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">Final</span>
              )}
              {match.status === 'scheduled' && (
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Programado</span>
              )}
            </div>
          </div>
          <div className="text-center flex-1">
            <div
              className="w-8 h-8 rounded-full mx-auto mb-2 border-2 border-white shadow"
              style={{ backgroundColor: match.away_team?.color ?? '#EF4444' }}
            />
            <p className="font-semibold text-sm">{match.away_team?.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">Visitante</p>
          </div>
        </div>
      </div>

      {/* Status controls */}
      {match.status === 'scheduled' && (
        <Button
          className="w-full bg-green-600 hover:bg-green-700"
          disabled={changingStatus}
          onClick={() => changeStatus('live')}
        >
          {changingStatus ? 'Iniciando...' : '▶ Iniciar Partido'}
        </Button>
      )}

      {/* Score editor (only while live or editing finished) */}
      {(match.status === 'live' || match.status === 'finished') && (
        <div className="bg-white rounded-xl border p-5 space-y-5">
          <p className="font-medium text-sm text-gray-700">Resultado</p>
          <div className="grid grid-cols-2 gap-6">
            {/* Home score */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 block text-center">{match.home_team?.name}</Label>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setHomeScore((p) => Math.max(0, p - 1))}
                  className="w-10 h-10 rounded-full border-2 border-gray-200 text-xl font-bold hover:border-gray-400 transition disabled:opacity-30"
                  disabled={!isEditable}
                >−</button>
                <span className="text-4xl font-bold tabular-nums w-12 text-center">{homeScore}</span>
                <button
                  onClick={() => setHomeScore((p) => p + 1)}
                  className="w-10 h-10 rounded-full border-2 border-gray-200 text-xl font-bold hover:border-gray-400 transition disabled:opacity-30"
                  disabled={!isEditable}
                >+</button>
              </div>
            </div>
            {/* Away score */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 block text-center">{match.away_team?.name}</Label>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setAwayScore((p) => Math.max(0, p - 1))}
                  className="w-10 h-10 rounded-full border-2 border-gray-200 text-xl font-bold hover:border-gray-400 transition disabled:opacity-30"
                  disabled={!isEditable}
                >−</button>
                <span className="text-4xl font-bold tabular-nums w-12 text-center">{awayScore}</span>
                <button
                  onClick={() => setAwayScore((p) => p + 1)}
                  className="w-10 h-10 rounded-full border-2 border-gray-200 text-xl font-bold hover:border-gray-400 transition disabled:opacity-30"
                  disabled={!isEditable}
                >+</button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Notas (opcional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isEditable}
              placeholder="Observaciones del partido..."
              className="w-full text-sm border rounded-md px-3 py-2 resize-none h-16 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div className="flex gap-3">
            {isEditable && (
              <Button onClick={saveResult} disabled={saving} className="flex-1">
                {saving ? 'Guardando...' : 'Guardar resultado'}
              </Button>
            )}
            {match.status === 'live' && (
              <Button
                variant="destructive"
                onClick={() => changeStatus('finished')}
                disabled={changingStatus}
                className="flex-1"
              >
                {changingStatus ? '...' : '■ Finalizar partido'}
              </Button>
            )}
          </div>
        </div>
      )}

      {match.status === 'finished' && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-medium mb-1">Partido finalizado</p>
          {match.notes && <p className="text-gray-500">{match.notes}</p>}
          <button
            onClick={() => changeStatus('live')}
            className="text-xs text-blue-600 hover:underline mt-2 block"
            disabled={changingStatus}
          >
            Reabrir partido para corrección
          </button>
        </div>
      )}
    </div>
  )
}
