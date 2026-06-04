interface StandingRow {
  team_id: string
  points: number
  goal_difference: number
}

export interface MatchRow {
  group_id: string
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
}

// Sorts standings by: points → goal_difference → head-to-head (pts → gd among tied teams)
export function sortStandings<T extends StandingRow>(teams: T[], groupMatches: MatchRow[]): T[] {
  const sorted = [...teams].sort(
    (a, b) => b.points - a.points || b.goal_difference - a.goal_difference
  )

  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (
      j < sorted.length &&
      sorted[j].points === sorted[i].points &&
      sorted[j].goal_difference === sorted[i].goal_difference
    ) j++

    if (j - i > 1) {
      const tiedIds = sorted.slice(i, j).map((t) => t.team_id)
      const h2h = computeH2H(tiedIds, groupMatches)
      const tiedGroup = sorted.slice(i, j).sort((a, b) => {
        const ah = h2h.get(a.team_id) ?? { pts: 0, gd: 0 }
        const bh = h2h.get(b.team_id) ?? { pts: 0, gd: 0 }
        return bh.pts - ah.pts || bh.gd - ah.gd || a.team_id.localeCompare(b.team_id)
      })
      sorted.splice(i, j - i, ...tiedGroup)
    }
    i = j
  }

  return sorted
}

function computeH2H(tiedIds: string[], matches: MatchRow[]): Map<string, { pts: number; gd: number }> {
  const stats = new Map(tiedIds.map((id) => [id, { pts: 0, gd: 0 }]))

  for (const m of matches) {
    const { home_team_id: h, away_team_id: a, home_score: hs, away_score: as_ } = m
    if (!h || !a || hs == null || as_ == null) continue
    if (!tiedIds.includes(h) || !tiedIds.includes(a)) continue

    const home = stats.get(h)!
    const away = stats.get(a)!

    if (hs > as_) {
      home.pts += 3
    } else if (hs === as_) {
      home.pts += 1
      away.pts += 1
    } else {
      away.pts += 3
    }

    home.gd += hs - as_
    away.gd += as_ - hs
  }

  return stats
}
