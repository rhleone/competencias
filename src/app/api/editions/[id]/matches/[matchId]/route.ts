import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id, matchId } = await params
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: match } = await db
      .from('matches').select('status').eq('id', matchId).eq('edition_id', id).single()
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })
    if (match.status !== 'postponed') {
      return NextResponse.json({ error: 'Solo se pueden eliminar partidos suspendidos' }, { status: 400 })
    }

    const { error } = await db.from('matches').delete().eq('id', matchId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Match DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id, matchId } = await params
    const body = await request.json()
    const { scheduledAt, fieldNumber, status } = body as {
      scheduledAt?: string
      fieldNumber?: number
      status?: string
    }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const updateData: Record<string, unknown> = {}
    if (scheduledAt !== undefined) updateData.scheduled_at = scheduledAt
    if (fieldNumber !== undefined) updateData.field_number = fieldNumber
    if (status !== undefined) updateData.status = status

    const { error } = await db
      .from('matches')
      .update(updateData)
      .eq('id', matchId)
      .eq('edition_id', id)

    if (error) {
      console.error('Match update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Match PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
