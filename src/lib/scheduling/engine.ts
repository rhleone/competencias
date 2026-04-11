import type { Database } from '@/types/database'

type Discipline = Database['public']['Tables']['disciplines']['Row']

export interface MatchPair {
  homeTeamId: string
  awayTeamId: string
  disciplineId: string
  groupId: string
  phaseId: string | null
  matchDay: number
}

export interface TimeSlot {
  date: string // YYYY-MM-DD
  fieldNumber: number
  startTime: string // HH:MM
  endTime: string // HH:MM
  disciplineId: string
  gender: 'M' | 'F'
}

export interface SchedulingConfig {
  editionId: string
  dateRange: { start: string; end: string }
  disciplines: (Discipline & { gender: 'M' | 'F' })[]
}

export interface SchedulingResult {
  assignments: Array<{
    matchPair: MatchPair
    slot: TimeSlot
  }>
  unscheduled: MatchPair[]
}

/**
 * Generate round-robin pairs using the circle (polygon) method.
 * legs: 'single' = solo ida, 'home_away' = ida y vuelta (duplica los pares con local/visitante invertidos).
 */
export function generateRoundRobinPairs(
  teamIds: string[],
  disciplineId: string,
  groupId: string,
  phaseId: string | null,
  legs: 'single' | 'home_away' = 'single'
): MatchPair[] {
  const teams = [...teamIds]
  if (teams.length % 2 !== 0) teams.push('BYE')
  const n = teams.length
  const firstLeg: MatchPair[] = []

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = teams[i]
      const away = teams[n - 1 - i]
      if (home !== 'BYE' && away !== 'BYE') {
        firstLeg.push({ homeTeamId: home, awayTeamId: away, disciplineId, groupId, phaseId, matchDay: round + 1 })
      }
    }
    const last = teams.pop()!
    teams.splice(1, 0, last)
  }

  if (legs === 'single') return firstLeg

  // Vuelta: invertir local/visitante, continuar numeración de jornadas
  const maxDay = firstLeg.length > 0 ? Math.max(...firstLeg.map((p) => p.matchDay)) : 0
  const secondLeg: MatchPair[] = firstLeg.map((p) => ({
    homeTeamId: p.awayTeamId,
    awayTeamId: p.homeTeamId,
    disciplineId,
    groupId,
    phaseId,
    matchDay: p.matchDay + maxDay,
  }))

  return [...firstLeg, ...secondLeg]
}

/**
 * Generate cross-group match pairs for teams of the same grade across different groups.
 * teamsByGrade: map of grade → list of { teamId, groupId }
 * Cross-group matches have groupId = null (no pertenecen a un grupo específico).
 */
export function generateCrossGroupPairs(
  teamsByGrade: Map<string, { teamId: string; groupId: string }[]>,
  disciplineId: string,
  phaseId: string | null,
  legs: 'single' | 'home_away' = 'single'
): MatchPair[] {
  const allPairs: MatchPair[] = []

  teamsByGrade.forEach((teamEntries, grade) => {
    // Only generate cross-group pairs when teams come from at least 2 different groups
    const groupIds = new Set(teamEntries.map((t) => t.groupId))
    if (groupIds.size < 2) return

    // Filter: only teams from different groups can play each other in cross-group
    const teamIds = teamEntries.map((t) => t.teamId)
    const paddedTeams = [...teamIds]
    if (paddedTeams.length % 2 !== 0) paddedTeams.push('BYE')
    const n = paddedTeams.length
    const firstLeg: MatchPair[] = []

    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < n / 2; i++) {
        const homeId = paddedTeams[i]
        const awayId = paddedTeams[n - 1 - i]
        if (homeId === 'BYE' || awayId === 'BYE') continue

        const homeGroup = teamEntries.find((t) => t.teamId === homeId)?.groupId ?? ''
        const awayGroup = teamEntries.find((t) => t.teamId === awayId)?.groupId ?? ''

        // Only include if they are from DIFFERENT groups
        if (homeGroup !== awayGroup) {
          firstLeg.push({
            homeTeamId: homeId,
            awayTeamId: awayId,
            disciplineId,
            groupId: `cross:${grade}`, // marker prefix to identify cross-group matches
            phaseId,
            matchDay: round + 1,
          })
        }
      }
      const last = paddedTeams.pop()!
      paddedTeams.splice(1, 0, last)
    }

    if (legs === 'home_away') {
      const maxDay = firstLeg.length > 0 ? Math.max(...firstLeg.map((p) => p.matchDay)) : 0
      firstLeg.push(
        ...firstLeg.map((p) => ({
          homeTeamId: p.awayTeamId,
          awayTeamId: p.homeTeamId,
          disciplineId,
          groupId: p.groupId,
          phaseId,
          matchDay: p.matchDay + maxDay,
        }))
      )
    }

    allPairs.push(...firstLeg)
  })

  return allPairs
}

/**
 * Generate all available time slots for a discipline within a date range.
 * allowedDays: JS day-of-week numbers (0=Sunday,1=Monday,...,6=Saturday).
 * If empty, all days are allowed.
 */
export function generateAvailableSlots(
  discipline: Discipline & { gender: 'M' | 'F' },
  dateRange: { start: string; end: string },
  allowedDays: number[] = [],
  blockedDates: string[] = []
): TimeSlot[] {
  const slots: TimeSlot[] = []
  const current = new Date(dateRange.start + 'T12:00:00')
  const end = new Date(dateRange.end + 'T12:00:00')

  while (current <= end) {
    const dayOfWeek = current.getDay()
    const dateStr = current.toISOString().split('T')[0]
    if (
      (allowedDays.length === 0 || allowedDays.includes(dayOfWeek)) &&
      !blockedDates.includes(dateStr)
    ) {
      for (let field = 1; field <= discipline.fields_available; field++) {
        let currentMinutes = timeToMinutes(discipline.daily_start_time)
        const endMinutes = timeToMinutes(discipline.daily_end_time)
        while (currentMinutes + discipline.match_duration_minutes <= endMinutes) {
          slots.push({
            date: dateStr,
            fieldNumber: field,
            startTime: minutesToTime(currentMinutes),
            endTime: minutesToTime(currentMinutes + discipline.match_duration_minutes),
            disciplineId: discipline.id,
            gender: discipline.gender,
          })
          currentMinutes += discipline.match_duration_minutes + discipline.interval_minutes
        }
      }
    }
    current.setDate(current.getDate() + 1)
  }

  return slots
}

/**
 * Check if two time slots overlap on the same date.
 */
function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  if (a.date !== b.date) return false
  const aStart = timeToMinutes(a.startTime)
  const aEnd = timeToMinutes(a.endTime)
  const bStart = timeToMinutes(b.startTime)
  const bEnd = timeToMinutes(b.endTime)
  return aStart < bEnd && aEnd > bStart
}

/**
 * Check if assigning a slot would create a same-gender conflict.
 * Rule: two disciplines of the same gender CANNOT play at the same time.
 * Different genders CAN overlap.
 */
function hasGenderConflict(
  candidateSlot: TimeSlot,
  assignedSlots: TimeSlot[]
): boolean {
  return assignedSlots.some(
    (assigned) =>
      assigned.gender === candidateSlot.gender &&
      assigned.disciplineId !== candidateSlot.disciplineId &&
      slotsOverlap(assigned, candidateSlot)
  )
}

/**
 * Main scheduling engine: greedy assignment of match pairs to available slots.
 */
export function scheduleMatches(
  matchPairs: MatchPair[],
  allSlots: TimeSlot[],
  config: SchedulingConfig
): SchedulingResult {
  const availableSlots = [...allSlots]
  const assignedSlots: TimeSlot[] = []
  const assignments: SchedulingResult['assignments'] = []
  const unscheduled: MatchPair[] = []

  // Sort match pairs by match day first, then discipline
  const sortedPairs = [...matchPairs].sort((a, b) => {
    if (a.matchDay !== b.matchDay) return a.matchDay - b.matchDay
    return a.disciplineId.localeCompare(b.disciplineId)
  })

  for (const pair of sortedPairs) {
    const disciplineConfig = config.disciplines.find(
      (d) => d.id === pair.disciplineId
    )
    if (!disciplineConfig) {
      unscheduled.push(pair)
      continue
    }

    // Find first valid slot for this match
    const slotIndex = availableSlots.findIndex((slot) => {
      if (slot.disciplineId !== pair.disciplineId) return false
      if (hasGenderConflict(slot, assignedSlots)) return false
      return true
    })

    if (slotIndex === -1) {
      unscheduled.push(pair)
      continue
    }

    const chosenSlot = availableSlots[slotIndex]
    assignments.push({ matchPair: pair, slot: chosenSlot })
    assignedSlots.push(chosenSlot)
    availableSlots.splice(slotIndex, 1)
  }

  return { assignments, unscheduled }
}

// Helpers
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}
