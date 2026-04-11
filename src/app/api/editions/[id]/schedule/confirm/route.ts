import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface AssignmentItem {
  matchPair: {
    homeTeamId: string
    homeTeamName: string
    awayTeamId: string
    awayTeamName: string
    disciplineId: string
    disciplineName: string
    disciplineGender: string
    groupId: string
    groupName: string
    phaseId: string | null
    matchDay: number
  }
  slot: {
    date: string
    fieldNumber: number
    startTime: string
    endTime: string
    disciplineId: string
    gender: string
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { assignments } = body as { assignments: AssignmentItem[] }

    if (!assignments || !Array.isArray(assignments)) {
      return NextResponse.json({ error: 'Invalid assignments data' }, { status: 400 })
    }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Delete existing scheduled matches and venue_slots for this edition
    const { error: deleteMatchesError } = await db
      .from('matches')
      .delete()
      .eq('edition_id', id)
      .eq('status', 'scheduled')

    if (deleteMatchesError) {
      console.error('Error deleting existing matches:', deleteMatchesError)
      return NextResponse.json({ error: 'Failed to clear existing schedule' }, { status: 500 })
    }

    const { error: deleteSlotsError } = await db
      .from('venue_slots')
      .delete()
      .eq('edition_id', id)

    if (deleteSlotsError) {
      console.error('Error deleting existing venue slots:', deleteSlotsError)
      return NextResponse.json({ error: 'Failed to clear existing venue slots' }, { status: 500 })
    }

    let matchesCreated = 0

    for (const assignment of assignments) {
      const { matchPair, slot } = assignment

      // Combine date and time into timestamptz
      const scheduledAt = `${slot.date}T${slot.startTime}:00`

      // Insert match
      const { data: matchData, error: matchError } = await db
        .from('matches')
        .insert({
          edition_id: id,
          discipline_id: matchPair.disciplineId,
          phase_id: matchPair.phaseId ?? null,
          // cross-group matches use a 'cross:grade' marker — store as null group_id
        group_id: matchPair.groupId.startsWith('cross:') ? null : matchPair.groupId,
          home_team_id: matchPair.homeTeamId,
          away_team_id: matchPair.awayTeamId,
          scheduled_at: scheduledAt,
          field_number: slot.fieldNumber,
          match_day: matchPair.matchDay,
          status: 'scheduled',
        })
        .select('id')
        .single()

      if (matchError) {
        console.error('Error inserting match:', matchError)
        continue
      }

      const matchId = matchData?.id

      // Insert venue slot
      const { error: slotError } = await db.from('venue_slots').insert({
        edition_id: id,
        discipline_id: slot.disciplineId,
        slot_date: slot.date,
        field_number: slot.fieldNumber,
        start_time: slot.startTime,
        end_time: slot.endTime,
        match_id: matchId ?? null,
      })

      if (slotError) {
        console.error('Error inserting venue slot:', slotError)
      }

      matchesCreated++
    }

    return NextResponse.json({ success: true, matchesCreated })
  } catch (err) {
    console.error('Schedule confirm error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
