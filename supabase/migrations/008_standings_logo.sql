-- Add team_logo_url and team_color to standings view
create or replace view public.standings as
select
  gt.group_id,
  t.id as team_id,
  t.name as team_name,
  t.color as team_color,
  t.logo_url as team_logo_url,
  count(m.id) filter (where m.status = 'finished') as played,
  count(m.id) filter (
    where m.status = 'finished' and (
      (m.home_team_id = t.id and m.home_score > m.away_score) or
      (m.away_team_id = t.id and m.away_score > m.home_score)
    )
  ) as won,
  count(m.id) filter (
    where m.status = 'finished' and m.home_score = m.away_score
  ) as drawn,
  count(m.id) filter (
    where m.status = 'finished' and (
      (m.home_team_id = t.id and m.home_score < m.away_score) or
      (m.away_team_id = t.id and m.away_score < m.home_score)
    )
  ) as lost,
  coalesce(sum(case when m.home_team_id = t.id then m.home_score
                    when m.away_team_id = t.id then m.away_score else 0 end)
    filter (where m.status = 'finished'), 0) as goals_for,
  coalesce(sum(case when m.home_team_id = t.id then m.away_score
                    when m.away_team_id = t.id then m.home_score else 0 end)
    filter (where m.status = 'finished'), 0) as goals_against,
  coalesce(sum(case when m.home_team_id = t.id then m.home_score - m.away_score
                    when m.away_team_id = t.id then m.away_score - m.home_score else 0 end)
    filter (where m.status = 'finished'), 0) as goal_difference,
  coalesce(
    count(m.id) filter (
      where m.status = 'finished' and (
        (m.home_team_id = t.id and m.home_score > m.away_score) or
        (m.away_team_id = t.id and m.away_score > m.home_score)
      )
    ) * 3 +
    count(m.id) filter (
      where m.status = 'finished' and m.home_score = m.away_score
    ),
  0) as points
from
  public.group_teams gt
  join public.teams t on gt.team_id = t.id
  left join public.matches m on
    m.group_id = gt.group_id and
    (m.home_team_id = t.id or m.away_team_id = t.id)
group by gt.group_id, t.id, t.name, t.color, t.logo_url;
