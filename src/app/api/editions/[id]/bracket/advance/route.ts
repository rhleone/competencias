import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Advances the winner of a finished bracket match to the next round
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { matchId } = await request.json()
  if (!matchId) return NextResponse.json({ error: 'matchId requerido' }, { status: 400 })

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'operator'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Load the match
  const { data: match, error: matchErr } = await db
    .from('matches')
    .select('id, home_team_id, away_team_id, home_score, away_score, status, winner_advances_to, winner_slot, edition_id')
    .eq('id', matchId)
    .eq('edition_id', id)
    .single()

  if (matchErr || !match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
  if (match.status !== 'finished') return NextResponse.json({ error: 'El partido debe estar finalizado' }, { status: 400 })
  if (!match.winner_advances_to) return NextResponse.json({ ok: true, message: 'Sin avance (es el partido final)' })

  // Determine winner
  const homeScore = match.home_score ?? 0
  const awayScore = match.away_score ?? 0
  let winnerId: string | null = null

  if (homeScore > awayScore) {
    winnerId = match.home_team_id
  } else if (awayScore > homeScore) {
    winnerId = match.away_team_id
  } else {
    // Draw — no clear winner (shouldn't happen in knockout, but handle gracefully)
    return NextResponse.json({ error: 'El partido terminó en empate. Defina el ganador manualmente.' }, { status: 400 })
  }

  // Update next match's team slot
  const updateField = match.winner_slot === 'home' ? 'home_team_id' : 'away_team_id'
  const { error: updateErr } = await db
    .from('matches')
    .update({ [updateField]: winnerId })
    .eq('id', match.winner_advances_to)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, winnerId, nextMatchId: match.winner_advances_to })
}
