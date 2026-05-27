-- ============================================================
-- 014_grants.sql
-- Explicit API grants — required by Supabase starting Oct 30 2026.
-- Previously auto-granted; now must be declared per table.
--
-- Two roles matter:
--   anon          → unauthenticated callers (public fixture/standings page)
--   authenticated → any logged-in user (RLS then filters rows)
-- ============================================================

-- Schema usage (required before any table grant can take effect)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ── Tables publicly readable (fixture page, public standings) ──
GRANT SELECT ON public.editions        TO anon;
GRANT SELECT ON public.disciplines     TO anon;
GRANT SELECT ON public.teams           TO anon;
GRANT SELECT ON public.phases          TO anon;
GRANT SELECT ON public.groups          TO anon;
GRANT SELECT ON public.group_teams     TO anon;
GRANT SELECT ON public.team_disciplines TO anon;
GRANT SELECT ON public.matches         TO anon;

-- ── All tables — authenticated users (RLS controls row-level access) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.editions            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplines         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phases              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_teams         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_disciplines    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_slots         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_dates       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_users        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.superadmin_access_log TO authenticated;

-- ── Functions used inside RLS policies ────────────────────────
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin()    TO authenticated;
