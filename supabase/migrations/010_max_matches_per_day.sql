-- Migration 010: max_matches_per_day per discipline
-- Controls how many times a team can play on the same date within a discipline.
-- Default 1 = each team plays at most once per day (current implicit behavior after fix).

alter table public.disciplines
  add column if not exists max_matches_per_day integer not null default 1;
