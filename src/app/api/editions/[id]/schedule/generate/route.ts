import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateRoundRobinPairs,
  generateCrossGroupPairs,
  generateAvailableSlots,
  scheduleMatches,
  type MatchPair,
} from '@/lib/scheduling/engine'
import type { Database } from '@/types/database'

type Discipline = Database['public']['Tables']['disciplines']['Row']
type Team = Database['public']['Tables']['teams']['Row']
type Group = Database['public']['Tables']['groups']['Row']

interface EnrichedMatchPair extends MatchPair {
  homeTeamName: string
  awayTeamName: string
  disciplineName: string
  disciplineGender: string
  groupName: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { startDate, endDate, allowedDays } = body as { startDate?: string; endDate?: string; allowedDays?: number[] }


    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // 1. Get edition
    const { data: edition, error: editionError } = await db
      .from('editions')
      .select('*')
      .eq('id', id)
      .single()

    if (editionError || !edition) {
      return NextResponse.json({ error: 'Edition not found' }, { status: 404 })
    }

    const dateRange = {
      start: startDate ?? edition.start_date,
      end: endDate ?? edition.end_date,
    }

    // 2. Load blocked dates for this edition
    const { data: blockedDatesData } = await db
      .from('blocked_dates')
      .select('date')
      .eq('edition_id', id)
    const blockedDates: string[] = (blockedDatesData ?? []).map((b: { date: string }) => b.date)

    // 3. Load all disciplines for the edition
    const { data: disciplinesData, error: disciplinesError } = await db
      .from('disciplines')
      .select('*')
      .eq('edition_id', id)
      .order('created_at', { ascending: true })

    if (disciplinesError) {
      return NextResponse.json({ error: 'Failed to load disciplines' }, { status: 500 })
    }

    const disciplines: Discipline[] = disciplinesData ?? []

    // 3. Load all groups with their assigned teams
    const { data: groupsData, error: groupsError } = await db
      .from('groups')
      .select(`
        *,
        group_teams (
          team_id,
          teams (*)
        )
      `)
      .eq('edition_id', id)

    if (groupsError) {
      return NextResponse.json({ error: 'Failed to load groups' }, { status: 500 })
    }

    // Build team maps
    const teamNameMap = new Map<string, string>()
    const teamGradeMap = new Map<string, string>()
    const disciplineMap = new Map<string, Discipline>()
    disciplines.forEach((d) => disciplineMap.set(d.id, d))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawGroups: any[] = groupsData ?? []
    rawGroups.forEach((group) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(group.group_teams ?? []).forEach((gt: any) => {
        if (gt.teams) {
          const t = gt.teams as Team & { grade?: string }
          teamNameMap.set(gt.team_id, t.name)
          if (t.grade) teamGradeMap.set(gt.team_id, t.grade)
        }
      })
    })

    const groupNameMap = new Map<string, string>()
    rawGroups.forEach((group: Group) => groupNameMap.set(group.id, group.name))

    // 4. Generate intra-group round-robin pairs
    const allMatchPairs: EnrichedMatchPair[] = []

    for (const group of rawGroups) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamIds: string[] = (group.group_teams ?? []).map((gt: any) => gt.team_id as string)
      if (teamIds.length < 2) continue

      const discipline = disciplineMap.get(group.discipline_id)
      if (!discipline) continue

      const legs = (discipline as Discipline & { match_legs?: string }).match_legs === 'home_away' ? 'home_away' : 'single'

      const pairs = generateRoundRobinPairs(teamIds, group.discipline_id, group.id, group.phase_id ?? null, legs)

      allMatchPairs.push(...pairs.map((pair) => ({
        ...pair,
        homeTeamName: teamNameMap.get(pair.homeTeamId) ?? pair.homeTeamId,
        awayTeamName: teamNameMap.get(pair.awayTeamId) ?? pair.awayTeamId,
        disciplineName: discipline.name,
        disciplineGender: discipline.gender,
        groupName: group.name,
      })))
    }

    // 4b. Generate cross-group pairs for disciplines that have enable_cross_group = true
    for (const discipline of disciplines) {
      const disc = discipline as Discipline & { enable_cross_group?: boolean; match_legs?: string }
      if (!disc.enable_cross_group) continue

      // Build map: grade → [{ teamId, groupId }] across all groups of this discipline
      const teamsByGrade = new Map<string, { teamId: string; groupId: string }[]>()

      for (const group of rawGroups) {
        if (group.discipline_id !== discipline.id) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(group.group_teams ?? []).forEach((gt: any) => {
          const grade = teamGradeMap.get(gt.team_id)
          if (!grade) return
          const arr = teamsByGrade.get(grade) ?? []
          arr.push({ teamId: gt.team_id, groupId: group.id })
          teamsByGrade.set(grade, arr)
        })
      }

      const legs = disc.match_legs === 'home_away' ? 'home_away' : 'single'
      const crossPairs = generateCrossGroupPairs(teamsByGrade, discipline.id, null, legs)

      allMatchPairs.push(...crossPairs.map((pair) => ({
        ...pair,
        homeTeamName: teamNameMap.get(pair.homeTeamId) ?? pair.homeTeamId,
        awayTeamName: teamNameMap.get(pair.awayTeamId) ?? pair.awayTeamId,
        disciplineName: discipline.name,
        disciplineGender: discipline.gender,
        groupName: `Inter-grupos (${pair.groupId.replace('cross:', '')})`,
      })))
    }

    // 5. Generate available time slots for each discipline (respecting allowed days + blocked dates)
    const allSlots = disciplines.flatMap((discipline) =>
      generateAvailableSlots(
        discipline as Discipline & { gender: 'M' | 'F' },
        dateRange,
        allowedDays ?? [],
        blockedDates
      )
    )

    // 6. Run the scheduling engine
    const config = {
      editionId: id,
      dateRange,
      disciplines: disciplines as (Discipline & { gender: 'M' | 'F' })[],
    }

    const basePairs: MatchPair[] = allMatchPairs.map((p) => ({
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
      disciplineId: p.disciplineId,
      groupId: p.groupId,
      phaseId: p.phaseId,
      matchDay: p.matchDay,
    }))

    const { assignments: baseAssignments, unscheduled } = scheduleMatches(
      basePairs,
      allSlots,
      config
    )

    // Enrich assignments with team/discipline names
    const assignments = baseAssignments.map((a) => {
      const enriched = allMatchPairs.find(
        (p) =>
          p.homeTeamId === a.matchPair.homeTeamId &&
          p.awayTeamId === a.matchPair.awayTeamId &&
          p.disciplineId === a.matchPair.disciplineId &&
          p.groupId === a.matchPair.groupId &&
          p.matchDay === a.matchPair.matchDay
      )
      return {
        matchPair: {
          homeTeamId: a.matchPair.homeTeamId,
          homeTeamName: enriched?.homeTeamName ?? a.matchPair.homeTeamId,
          awayTeamId: a.matchPair.awayTeamId,
          awayTeamName: enriched?.awayTeamName ?? a.matchPair.awayTeamId,
          disciplineId: a.matchPair.disciplineId,
          disciplineName: enriched?.disciplineName ?? '',
          disciplineGender: enriched?.disciplineGender ?? '',
          groupId: a.matchPair.groupId,
          groupName: enriched?.groupName ?? groupNameMap.get(a.matchPair.groupId) ?? '',
          phaseId: a.matchPair.phaseId ?? null,
          matchDay: a.matchPair.matchDay,
        },
        slot: a.slot,
      }
    })

    // 7. Build stats
    const byDiscipline: Record<string, { name: string; gender: string; scheduled: number; unscheduled: number }> = {}

    disciplines.forEach((d) => {
      byDiscipline[d.id] = { name: d.name, gender: d.gender, scheduled: 0, unscheduled: 0 }
    })

    assignments.forEach((a) => {
      if (byDiscipline[a.matchPair.disciplineId]) {
        byDiscipline[a.matchPair.disciplineId].scheduled++
      }
    })

    unscheduled.forEach((p) => {
      if (byDiscipline[p.disciplineId]) {
        byDiscipline[p.disciplineId].unscheduled++
      }
    })

    const stats = {
      total: assignments.length + unscheduled.length,
      scheduled: assignments.length,
      unscheduled: unscheduled.length,
      byDiscipline,
    }

    return NextResponse.json({ assignments, unscheduled, stats })
  } catch (err) {
    console.error('Schedule generate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
