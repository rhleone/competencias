-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null unique,
  role text not null check (role in ('admin', 'operator')) default 'operator',
  full_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Editions (championship years)
create table public.editions (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  year integer not null,
  status text not null check (status in ('draft', 'active', 'finished')) default 'draft',
  start_date date not null,
  end_date date not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Disciplines
create table public.disciplines (
  id uuid default uuid_generate_v4() primary key,
  edition_id uuid references public.editions(id) on delete cascade not null,
  name text not null check (name in ('football', 'basketball', 'volleyball', 'futsal')),
  gender text not null check (gender in ('M', 'F')),
  match_duration_minutes integer not null default 40,
  interval_minutes integer not null default 15,
  fields_available integer not null default 1,
  min_matchdays integer not null default 1,
  max_matchdays integer not null default 10,
  daily_start_time time not null default '08:00',
  daily_end_time time not null default '18:00',
  created_at timestamptz default now() not null,
  unique(edition_id, name, gender)
);

-- Teams
create table public.teams (
  id uuid default uuid_generate_v4() primary key,
  edition_id uuid references public.editions(id) on delete cascade not null,
  discipline_id uuid references public.disciplines(id) on delete cascade not null,
  name text not null,
  color text default '#3B82F6',
  created_at timestamptz default now() not null
);

-- Phases
create table public.phases (
  id uuid default uuid_generate_v4() primary key,
  edition_id uuid references public.editions(id) on delete cascade not null,
  discipline_id uuid references public.disciplines(id) on delete cascade not null,
  name text not null,
  phase_type text not null check (phase_type in ('group_stage', 'round_of_16', 'quarterfinal', 'semifinal', 'final')),
  order_index integer not null default 0,
  is_knockout boolean not null default false,
  format text not null check (format in ('round_robin', 'series', 'phase_based')) default 'round_robin',
  created_at timestamptz default now() not null
);

-- Groups
create table public.groups (
  id uuid default uuid_generate_v4() primary key,
  edition_id uuid references public.editions(id) on delete cascade not null,
  discipline_id uuid references public.disciplines(id) on delete cascade not null,
  phase_id uuid references public.phases(id) on delete set null,
  name text not null,
  created_at timestamptz default now() not null
);

-- Group Teams (junction table)
create table public.group_teams (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  team_id uuid references public.teams(id) on delete cascade not null,
  seed integer,
  unique(group_id, team_id)
);

-- Matches
create table public.matches (
  id uuid default uuid_generate_v4() primary key,
  edition_id uuid references public.editions(id) on delete cascade not null,
  discipline_id uuid references public.disciplines(id) on delete cascade not null,
  phase_id uuid references public.phases(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  scheduled_at timestamptz,
  field_number integer,
  match_day integer,
  status text not null check (status in ('scheduled', 'live', 'finished', 'postponed')) default 'scheduled',
  home_score integer,
  away_score integer,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Venue Slots (output of scheduling engine)
create table public.venue_slots (
  id uuid default uuid_generate_v4() primary key,
  edition_id uuid references public.editions(id) on delete cascade not null,
  discipline_id uuid references public.disciplines(id) on delete cascade not null,
  slot_date date not null,
  field_number integer not null,
  start_time time not null,
  end_time time not null,
  match_id uuid references public.matches(id) on delete set null,
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_matches_edition_id on public.matches(edition_id);
create index idx_matches_discipline_id on public.matches(discipline_id);
create index idx_matches_scheduled_at on public.matches(scheduled_at);
create index idx_matches_status on public.matches(status);
create index idx_venue_slots_edition_id on public.venue_slots(edition_id);
create index idx_venue_slots_date on public.venue_slots(slot_date);

-- Standings View
create or replace view public.standings as
select
  gt.group_id,
  t.id as team_id,
  t.name as team_name,
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
group by gt.group_id, t.id, t.name;

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.editions enable row level security;
alter table public.disciplines enable row level security;
alter table public.teams enable row level security;
alter table public.phases enable row level security;
alter table public.groups enable row level security;
alter table public.group_teams enable row level security;
alter table public.matches enable row level security;
alter table public.venue_slots enable row level security;

-- Public read access for all tables
create policy "Public read access" on public.editions for select using (true);
create policy "Public read access" on public.disciplines for select using (true);
create policy "Public read access" on public.teams for select using (true);
create policy "Public read access" on public.phases for select using (true);
create policy "Public read access" on public.groups for select using (true);
create policy "Public read access" on public.group_teams for select using (true);
create policy "Public read access" on public.matches for select using (true);
create policy "Public read access" on public.venue_slots for select using (true);

-- Admin full access (based on profile role)
create policy "Admin full access" on public.editions
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admin full access" on public.disciplines
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admin full access" on public.teams
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admin full access" on public.phases
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admin full access" on public.groups
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admin full access" on public.group_teams
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admin full access" on public.matches
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admin full access" on public.venue_slots
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Operator: can update match scores only
create policy "Operator update matches" on public.matches
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'operator'))
  );

-- Profile policies
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Admin can read all profiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Function to handle new user creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'role', 'operator'));
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function to update updated_at timestamp
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_editions_updated_at before update on public.editions
  for each row execute function public.update_updated_at();
create trigger update_matches_updated_at before update on public.matches
  for each row execute function public.update_updated_at();
create trigger update_profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();
