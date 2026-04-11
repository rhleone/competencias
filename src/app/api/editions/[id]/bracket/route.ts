import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const disciplineId = searchParams.get('disciplineId')

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  let query = db
    .from('matches')
    .select(`
      id, bracket_position, winner_advances_to, winner_slot,
      status, home_score, away_score, scheduled_at, field_number, phase_id,
      home_team:home_team_id(id, name, color),
      away_team:away_team_id(id, name, color),
      discipline:discipline_id(id, name, gender),
      phase:phase_id(id, name, phase_type)
    `)
    .eq('edition_id', id)
    .not('bracket_position', 'is', null)
    .order('created_at')

  if (disciplineId) {
    query = query.eq('discipline_id', disciplineId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ matches: data ?? [] })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const disciplineId = searchParams.get('disciplineId')
  if (!disciplineId) return NextResponse.json({ error: 'disciplineId requerido' }, { status: 400 })

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db
    .from('matches')
    .delete()
    .eq('edition_id', id)
    .eq('discipline_id', disciplineId)
    .not('bracket_position', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
