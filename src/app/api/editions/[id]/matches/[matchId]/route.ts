import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
