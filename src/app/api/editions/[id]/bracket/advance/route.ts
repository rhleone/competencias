import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Advances the winner of a finished bracket match to the next round.
// Also advances the loser to the 3rd place match (loser_advances_to) if set.
// Ties are resolved via penalty_home_score / penalty_away_score.
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

  const { data: match, error: matchErr } = await db
    .from('matches')
    .select('id, home_team_id, away_team_id, home_score, away_score, status, winner_advances_to, winner_slot, loser_advances_to, loser_slot, penalty_home_score, penalty_away_score, edition_id')
    .eq('id', matchId)
    .eq('edition_id', id)
    .single()

  if (matchErr || !match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
  if (match.status !== 'finished') return NextResponse.json({ error: 'El partido debe estar finalizado' }, { status: 400 })
  if (!match.winner_advances_to) return NextResponse.json({ ok: true, message: 'Sin avance (es el partido final)' })

  const homeScore = match.home_score ?? 0
  const awayScore = match.away_score ?? 0
  let winnerId: string | null = null
  let loserId: string | null = null

  if (homeScore > awayScore) {
    winnerId = match.home_team_id
    loserId = match.away_team_id
  } else if (awayScore > homeScore) {
    winnerId = match.away_team_id
    loserId = match.home_team_id
  } else {
    // Tied — resolve via penalty scores
    const ph = match.penalty_home_score
    const pa = match.penalty_away_score
    if (ph == null || pa == null) {
      return NextResponse.json({
        error: 'El partido terminó en empate. Registrá el resultado de penales para avanzar al ganador.',
      }, { status: 400 })
    }
    if (ph > pa) {
      winnerId = match.home_team_id
      loserId = match.away_team_id
    } else if (pa > ph) {
      winnerId = match.away_team_id
      loserId = match.home_team_id
    } else {
      return NextResponse.json({ error: 'Los penales también están empatados. Revisá el resultado.' }, { status: 400 })
    }
  }

  // Advance winner to next round
  const winnerField = match.winner_slot === 'home' ? 'home_team_id' : 'away_team_id'
  const { error: winnerErr } = await db
    .from('matches')
    .update({ [winnerField]: winnerId })
    .eq('id', match.winner_advances_to)

  if (winnerErr) return NextResponse.json({ error: winnerErr.message }, { status: 500 })

  // Advance loser to 3rd place match (if applicable)
  if (match.loser_advances_to && match.loser_slot && loserId) {
    const loserField = match.loser_slot === 'home' ? 'home_team_id' : 'away_team_id'
    const { error: loserErr } = await db
      .from('matches')
      .update({ [loserField]: loserId })
      .eq('id', match.loser_advances_to)

    if (loserErr) {
      // Don't fail the whole operation, but report the secondary error
      return NextResponse.json({
        ok: true,
        winnerId,
        loserId,
        nextMatchId: match.winner_advances_to,
        warning: `Ganador avanzado, pero error al asignar 3er puesto: ${loserErr.message}`,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    winnerId,
    loserId,
    nextMatchId: match.winner_advances_to,
    thirdPlaceMatchId: match.loser_advances_to ?? null,
  })
}
