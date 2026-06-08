import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────
// POST /api/editions/[id]/bracket/confirm-seeds
// Body: { disciplineId }
// Finalises manual seeding by auto-processing BYE slots:
//   - One null team → auto-finish (real team wins 1-0) and advance to next round.
//   - Both null teams → auto-finish 0-0 (double BYE, slot remains vacant in next round).
// ─────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { disciplineId } = await request.json() as { disciplineId: string }
  if (!disciplineId) return NextResponse.json({ error: 'disciplineId requerido' }, { status: 400 })

  // Load all bracket matches for this discipline with their phase order
  const { data: allMatches, error: matchErr } = await db
    .from('matches')
    .select('id, bracket_position, status, home_team_id, away_team_id, winner_advances_to, winner_slot, phase:phase_id(order_index)')
    .eq('edition_id', id)
    .eq('discipline_id', disciplineId)
    .not('bracket_position', 'is', null)
    .neq('bracket_position', '3PO')

  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })
  const matches: {
    id: string
    bracket_position: string
    status: string
    home_team_id: string | null
    away_team_id: string | null
    winner_advances_to: string | null
    winner_slot: string | null
    phase: { order_index: number } | null
  }[] = allMatches ?? []

  // Identify first round = matches with the lowest phase order_index
  const minOrder = Math.min(...matches.map(m => m.phase?.order_index ?? 999))
  const firstRound = matches.filter(m => (m.phase?.order_index ?? 999) === minOrder)

  // Process BYE slots in the first round
  let byesProcessed = 0
  const errors: string[] = []

  for (const m of firstRound) {
    const hasHome = m.home_team_id !== null
    const hasAway = m.away_team_id !== null

    if (hasHome && hasAway) continue // fully assigned, skip
    if (m.status === 'finished') continue  // already processed

    const isDoubleBye = !hasHome && !hasAway

    // Auto-finish the match
    const { error: finErr } = await db.from('matches').update({
      status: 'finished',
      home_score: hasHome ? 1 : 0,
      away_score: hasAway ? 1 : 0,
    }).eq('id', m.id)

    if (finErr) { errors.push(`Error finalizando ${m.bracket_position}: ${finErr.message}`); continue }
    byesProcessed++

    // Advance winner to next round (only for single BYE)
    if (!isDoubleBye && m.winner_advances_to && m.winner_slot) {
      const winnerId = hasHome ? m.home_team_id : m.away_team_id
      const column = m.winner_slot === 'home' ? 'home_team_id' : 'away_team_id'

      const { error: advErr } = await db.from('matches')
        .update({ [column]: winnerId })
        .eq('id', m.winner_advances_to)

      if (advErr) errors.push(`Error avanzando BYE de ${m.bracket_position}: ${advErr.message}`)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, byesProcessed, errors }, { status: 207 })
  }

  return NextResponse.json({
    ok: true,
    byesProcessed,
    message: byesProcessed === 0
      ? 'Todos los seeds ya estaban asignados. Bracket listo.'
      : `${byesProcessed} BYE(s) procesados automáticamente. Bracket listo para jugar.`,
  })
}
