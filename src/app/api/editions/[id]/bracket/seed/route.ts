import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────
// PATCH /api/editions/[id]/bracket/seed
// Body: { matchId, slot: 'home'|'away', teamId: string | null }
// Assigns a team (or clears) a single slot in a first-round bracket match.
// Only allowed for matches with bracket_position and null teams (manual seeding mode).
// ─────────────────────────────────────────────
export async function PATCH(
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

  const { matchId, slot, teamId } = await request.json() as {
    matchId: string
    slot: 'home' | 'away'
    teamId: string | null
  }

  if (!matchId || !slot || !['home', 'away'].includes(slot)) {
    return NextResponse.json({ error: 'matchId y slot ("home"|"away") son requeridos.' }, { status: 400 })
  }

  // Validate match belongs to this edition and is a bracket match
  const { data: match, error: matchErr } = await db
    .from('matches')
    .select('id, bracket_position, status, discipline_id')
    .eq('id', matchId)
    .eq('edition_id', id)
    .not('bracket_position', 'is', null)
    .single()

  if (matchErr || !match) {
    return NextResponse.json({ error: 'Partido de bracket no encontrado.' }, { status: 404 })
  }
  if (match.status !== 'scheduled') {
    return NextResponse.json({ error: 'Solo se pueden reasignar seeds en partidos sin comenzar.' }, { status: 409 })
  }

  // Validate team belongs to this edition (if not clearing)
  if (teamId !== null) {
    const { data: team } = await db
      .from('team_disciplines')
      .select('team_id')
      .eq('team_id', teamId)
      .eq('discipline_id', match.discipline_id)
      .maybeSingle()

    if (!team) {
      return NextResponse.json({ error: 'El equipo no pertenece a esta disciplina.' }, { status: 400 })
    }
  }

  const column = slot === 'home' ? 'home_team_id' : 'away_team_id'
  const { error: updErr } = await db
    .from('matches')
    .update({ [column]: teamId })
    .eq('id', matchId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
