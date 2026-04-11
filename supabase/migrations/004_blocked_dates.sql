-- Migration 004: blocked_dates — non-playable dates (holidays, rest days, etc.)

create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz default now(),
  unique(edition_id, date)
);

alter table public.blocked_dates enable row level security;

create policy "blocked_dates_read" on public.blocked_dates
  for select using (true);

create policy "blocked_dates_admin_write" on public.blocked_dates
  for all using (get_my_role() = 'admin');
