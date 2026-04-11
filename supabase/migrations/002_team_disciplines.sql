-- Migration 002: Teams registered once, linked to disciplines via junction table

-- 1. Remove discipline_id from teams (drop FK constraint first)
alter table public.teams drop column if exists discipline_id;

-- 2. Create team_disciplines junction table
create table public.team_disciplines (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  discipline_id uuid references public.disciplines(id) on delete cascade not null,
  unique(team_id, discipline_id)
);

-- 3. Index for fast lookup
create index idx_team_disciplines_team_id on public.team_disciplines(team_id);
create index idx_team_disciplines_discipline_id on public.team_disciplines(discipline_id);

-- 4. RLS
alter table public.team_disciplines enable row level security;

create policy "Public read access" on public.team_disciplines
  for select using (true);

create policy "Admin full access" on public.team_disciplines
  for all using (public.get_my_role() = 'admin');
