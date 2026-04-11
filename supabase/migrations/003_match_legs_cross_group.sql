-- Migration 003: match legs (single/home_away) + cross-group matches + team grade

-- 1. Add match_legs to disciplines: 'single' = solo ida, 'home_away' = ida y vuelta
alter table public.disciplines
  add column if not exists match_legs text not null
    check (match_legs in ('single', 'home_away')) default 'single';

-- 2. Add enable_cross_group to disciplines
alter table public.disciplines
  add column if not exists enable_cross_group boolean not null default false;

-- 3. Add grade to teams (e.g. '1°', '2°', '3°', '4°', '5°', '6°')
alter table public.teams
  add column if not exists grade text;
