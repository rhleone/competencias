import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────
// Bracket Math Helpers
// ─────────────────────────────────────────────

function nextPow2(n: number): number {
  if (n <= 1) return 2
  let p = 2
  while (p < n) p *= 2
  return p
}

/**
 * Standard bracket seeding slots.
 * Ensures seed 1 meets seed 2 only in the Final, seed 1 meets seeds 3-4 in semis, etc.
 * getSeedingSlots(4)  → [1, 4, 3, 2]
 * getSeedingSlots(8)  → [1, 8, 5, 4, 3, 6, 7, 2]
 * getSeedingSlots(16) → [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2]
 */
function getSeedingSlots(n: number): number[] {
  if (n === 2) return [1, 2]
  const half = getSeedingSlots(n / 2)
  return half.flatMap(s => [s, n + 1 - s])
}

interface RoundDef {
  phaseType: string
  phaseName: string
  orderIndex: number
  positions: string[]
}

/**
 * Returns round definitions for a given bracket size, from first round to Final.
 * bracketSize=2:  [Final]
 * bracketSize=4:  [SF, F]
 * bracketSize=8:  [QF, SF, F]
 * bracketSize=16: [R16, QF, SF, F]
 */
function getRoundDefs(bracketSize: number): RoundDef[] {
  const rounds: RoundDef[] = []
  if (bracketSize >= 16) {
    rounds.push({
      phaseType: 'round_of_16', phaseName: 'Octavos de Final', orderIndex: 1,
      positions: Array.from({ length: 8 }, (_, i) => `R16-${i + 1}`),
    })
  }
  if (bracketSize >= 8) {
    rounds.push({
      phaseType: 'quarterfinal', phaseName: 'Cuartos de Final', orderIndex: 2,
      positions: ['QF1', 'QF2', 'QF3', 'QF4'],
    })
  }
  if (bracketSize >= 4) {
    rounds.push({
      phaseType: 'semifinal', phaseName: 'Semifinal', orderIndex: 3,
      positions: ['SF1', 'SF2'],
    })
  }
  rounds.push({
    phaseType: 'final', phaseName: 'Final', orderIndex: 4,
    positions: ['F'],
  })
  return rounds
}

// ─────────────────────────────────────────────
// POST /api/editions/[id]/bracket/generate
// Body: { disciplineId, includeThirdPlace? }
// ─────────────────────────────────────────────
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { disciplineId, includeThirdPlace = true } = await request.json()
  if (!disciplineId) return NextResponse.json({ error: 'disciplineId requerido' }, { status: 400 })

  // Check existing bracket
  const { data: existing } = await db.from('matches').select('id').eq('edition_id', id).eq('discipline_id', disciplineId).not('bracket_position', 'is', null).limit(1)
  if (existing?.length > 0) return NextResponse.json({ error: 'Ya existe un bracket para esta disciplina. Eliminalo primero.' }, { status: 409 })

  // Load discipline config
  const { data: disc, error: discErr } = await db.from('disciplines').select('id, qualifying_per_group, best_thirds_count').eq('id', disciplineId).single()
  if (discErr || !disc) return NextResponse.json({ error: 'Disciplina no encontrada' }, { status: 404 })

  const qualifyingPerGroup: number = disc.qualifying_per_group ?? 2
  const bestThirdsCount: number = disc.best_thirds_count ?? 0

  // Load groups ordered by name
  const { data: groupsData } = await db.from('groups').select('id, name').eq('edition_id', id).eq('discipline_id', disciplineId).order('name')
  const groups: { id: string; name: string }[] = groupsData ?? []
  if (groups.length === 0) return NextResponse.json({ error: 'No hay grupos definidos para esta disciplina.' }, { status: 400 })

  // Load standings
  const groupIds = groups.map((g: { id: string }) => g.id)
  const { data: standingsData } = await db.from('standings').select('group_id, team_id, points, goal_difference, goals_for').in('group_id', groupIds)

  // Build standings map per group (already sorted by view ORDER — but we re-sort for safety)
  const standingsMap = new Map<string, { team_id: string; points: number; goal_difference: number; goals_for: number }[]>()
  for (const g of groups) {
    const rows = (standingsData ?? [])
      .filter((s: { group_id: string }) => s.group_id === g.id)
      .sort((a: { points: number; goal_difference: number; goals_for: number }, b: { points: number; goal_difference: number; goals_for: number }) => {
        if (b.points !== a.points) return b.points - a.points
        if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
        return b.goals_for - a.goals_for
      })
    standingsMap.set(g.id, rows)
  }

  // ─── Seed Collection ───────────────────────────────────────────────────────
  // Seeds are assigned in tiers:
  //   Tier 0: best 1st-place teams (sorted cross-group by quality)
  //   Tier 1: best 2nd-place teams (sorted cross-group by quality)
  //   ...
  //   Best thirds (optional)
  const allSeeds: { teamId: string }[] = []

  for (let pos = 0; pos < qualifyingPerGroup; pos++) {
    const tier: { teamId: string; points: number; goalDiff: number; goalsFor: number }[] = []
    for (const g of groups) {
      const row = standingsMap.get(g.id)?.[pos]
      if (row) tier.push({ teamId: row.team_id, points: row.points, goalDiff: row.goal_difference, goalsFor: row.goals_for })
    }
    // Sort tier by merit (best first within this position)
    tier.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
      return b.goalsFor - a.goalsFor
    })
    allSeeds.push(...tier.map(t => ({ teamId: t.teamId })))
  }

  // Best thirds
  if (bestThirdsCount > 0) {
    const thirdsPos = qualifyingPerGroup
    const thirds: { teamId: string; points: number; goalDiff: number; goalsFor: number }[] = []
    for (const g of groups) {
      const row = standingsMap.get(g.id)?.[thirdsPos]
      if (row) thirds.push({ teamId: row.team_id, points: row.points, goalDiff: row.goal_difference, goalsFor: row.goals_for })
    }
    thirds.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
      return b.goalsFor - a.goalsFor
    })
    const qualified = thirds.slice(0, bestThirdsCount)
    allSeeds.push(...qualified.map(t => ({ teamId: t.teamId })))
  }

  const total = allSeeds.length
  if (total < 2) return NextResponse.json({ error: `Solo hay ${total} equipo(s) clasificado(s). Se necesitan al menos 2.` }, { status: 400 })

  // ─── Bracket Structure ─────────────────────────────────────────────────────
  const bracketSize = nextPow2(total)
  const byes = bracketSize - total
  const rounds = getRoundDefs(bracketSize)
  const seedingSlots = getSeedingSlots(bracketSize)

  // ─── Phase Helper ─────────────────────────────────────────────────────────
  async function ensurePhase(phaseType: string, phaseName: string, orderIndex: number): Promise<string> {
    const { data: ex } = await db.from('phases').select('id').eq('edition_id', id).eq('discipline_id', disciplineId).eq('phase_type', phaseType).maybeSingle()
    if (ex?.id) return ex.id
    const { data: created, error: err } = await db.from('phases').insert({ edition_id: id, discipline_id: disciplineId, name: phaseName, phase_type: phaseType, is_knockout: true, format: 'phase_based', order_index: orderIndex }).select('id').single()
    if (err) throw new Error(`Error creando fase ${phaseName}: ${err.message}`)
    return created.id
  }

  // ─── Create Match Shells (reverse order: Final → first round) ─────────────
  try {
    // rounds[last] = Final, rounds[0] = first round
    // We create in reverse so we have IDs for winner_advances_to

    // matchIdsByRound[roundIdx][matchIdx] = match id
    const matchIdsByRound: string[][] = rounds.map(r => Array(r.positions.length).fill(''))

    // 3rd place match (if enabled) — attached to Final phase
    let thirdPlaceId: string | null = null

    // Create matches round by round in REVERSE order
    for (let ri = rounds.length - 1; ri >= 0; ri--) {
      const round = rounds[ri]
      const phaseId = await ensurePhase(round.phaseType, round.phaseName, round.orderIndex)

      for (let mi = 0; mi < round.positions.length; mi++) {
        const pos = round.positions[mi]

        // Determine winner_advances_to: this match's winner goes to next round
        let winnerAdvancesTo: string | null = null
        let winnerSlot: string | null = null
        if (ri < rounds.length - 1) {
          // Next round
          const nextRoundMatchIdx = Math.floor(mi / 2)
          winnerAdvancesTo = matchIdsByRound[ri + 1][nextRoundMatchIdx]
          winnerSlot = mi % 2 === 0 ? 'home' : 'away'
        }

        // loser_advances_to for SF → 3PO
        let loserAdvancesTo: string | null = null
        let loserSlot: string | null = null
        if (round.phaseType === 'semifinal' && includeThirdPlace) {
          if (thirdPlaceId === null) {
            // Create 3PO match first (use final phase)
            const finalPhaseId = await ensurePhase('final', 'Final', round.orderIndex + 1)
            const { data: tpm, error: tpErr } = await db.from('matches').insert({
              edition_id: id, discipline_id: disciplineId, phase_id: finalPhaseId,
              group_id: null, status: 'scheduled', bracket_position: '3PO',
            }).select('id').single()
            if (tpErr) throw new Error(`Error creando 3er puesto: ${tpErr.message}`)
            thirdPlaceId = tpm.id
          }
          loserAdvancesTo = thirdPlaceId
          loserSlot = mi === 0 ? 'home' : 'away'
        }

        const insertData: Record<string, unknown> = {
          edition_id: id,
          discipline_id: disciplineId,
          phase_id: phaseId,
          group_id: null,
          status: 'scheduled',
          bracket_position: pos,
        }
        if (winnerAdvancesTo) { insertData.winner_advances_to = winnerAdvancesTo; insertData.winner_slot = winnerSlot }
        if (loserAdvancesTo) { insertData.loser_advances_to = loserAdvancesTo; insertData.loser_slot = loserSlot }

        const { data: created, error: createErr } = await db.from('matches').insert(insertData).select('id').single()
        if (createErr) throw new Error(`Error creando partido ${pos}: ${createErr.message}`)
        matchIdsByRound[ri][mi] = created.id
      }
    }

    // ─── Fill First-Round Teams & Handle BYEs ─────────────────────────────────
    const firstRound = rounds[0]
    const firstRoundMatchIds = matchIdsByRound[0]

    for (let pi = 0; pi < seedingSlots.length; pi += 2) {
      const matchIdx = pi / 2
      const seedA = seedingSlots[pi]       // home seed number (1-based)
      const seedB = seedingSlots[pi + 1]   // away seed number (1-based)

      const teamA = seedA <= total ? allSeeds[seedA - 1].teamId : null  // null = BYE
      const teamB = seedB <= total ? allSeeds[seedB - 1].teamId : null  // null = BYE

      const isBye = teamA === null || teamB === null
      const matchId = firstRoundMatchIds[matchIdx]

      // Update the first-round match with teams
      const updateData: Record<string, unknown> = {
        home_team_id: teamA,
        away_team_id: teamB,
      }
      if (isBye) {
        // Auto-finish: the real team wins with 1-0 (or 0-1 if teamA is BYE)
        updateData.status = 'finished'
        updateData.home_score = teamA !== null ? 1 : 0
        updateData.away_score = teamB !== null ? 1 : 0
      }

      const { error: updErr } = await db.from('matches').update(updateData).eq('id', matchId)
      if (updErr) throw new Error(`Error actualizando partido ${firstRound.positions[matchIdx]}: ${updErr.message}`)

      // Inline advance for BYE matches
      if (isBye) {
        const winnerId = teamA !== null ? teamA : teamB

        // Determine which next-round match and slot
        if (rounds.length > 1) {
          const nextRoundMatchIdx = Math.floor(matchIdx / 2)
          const nextMatchId = matchIdsByRound[1][nextRoundMatchIdx]
          const slot = matchIdx % 2 === 0 ? 'home_team_id' : 'away_team_id'

          const { error: advErr } = await db.from('matches').update({ [slot]: winnerId }).eq('id', nextMatchId)
          if (advErr) throw new Error(`Error avanzando BYE al siguiente partido: ${advErr.message}`)
        }
        // If bracketSize=2 (only a Final), the Final itself was already updated with both teams above
      }
    }

    const totalCreated = rounds.reduce((acc, r) => acc + r.positions.length, 0) + (thirdPlaceId ? 1 : 0)
    const roundNames = [...rounds.map(r => r.phaseName), ...(thirdPlaceId ? ['3er Puesto'] : [])]

    return NextResponse.json({
      ok: true,
      total,
      bracketSize,
      byes,
      rounds: roundNames,
      message: `Bracket generado: ${total} equipos, ${byes} BYE(s), ${totalCreated} partidos (${roundNames.join(' → ')}).`,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
