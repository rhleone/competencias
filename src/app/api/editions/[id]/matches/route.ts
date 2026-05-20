import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { disciplineId, homeTeamId, awayTeamId, scheduledAt, fieldNumber, groupId, phaseId, notes } = body as {
      disciplineId: string
      homeTeamId: string
      awayTeamId: string
      scheduledAt: string
      fieldNumber: number
      groupId?: string | null
      phaseId?: string | null
      notes?: string | null
    }

    if (!disciplineId || !homeTeamId || !awayTeamId || !scheduledAt || !fieldNumber) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    if (homeTeamId === awayTeamId) {
      return NextResponse.json({ error: 'El equipo local y visitante no pueden ser el mismo' }, { status: 400 })
    }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Auth — only admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Verify edition belongs to this admin's tenant
    const { data: edition, error: editionError } = await db
      .from('editions')
      .select('id, tenant_id')
      .eq('id', id)
      .single()
    if (editionError || !edition) {
      return NextResponse.json({ error: 'Edición no encontrada' }, { status: 404 })
    }

    const { data: match, error: insertError } = await db
      .from('matches')
      .insert({
        edition_id: id,
        discipline_id: disciplineId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        scheduled_at: scheduledAt,
        field_number: fieldNumber,
        group_id: groupId ?? null,
        phase_id: phaseId ?? null,
        notes: notes ?? null,
        status: 'scheduled',
        match_day: null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Manual match insert error:', insertError)
      return NextResponse.json({ error: 'Error al crear el partido' }, { status: 500 })
    }

    return NextResponse.json({ success: true, matchId: match.id })
  } catch (err) {
    console.error('POST /matches error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
