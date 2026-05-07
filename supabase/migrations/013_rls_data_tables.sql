-- ============================================================
-- Etapa: Row-Level Security on data tables
-- Ensures each tenant only sees their own data.
-- Active/finished editions are publicly readable (results page).
-- ============================================================

-- ── editions ─────────────────────────────────────────────────
ALTER TABLE editions ENABLE ROW LEVEL SECURITY;

-- Public can read active/finished editions; tenant members see all their own.
CREATE POLICY "editions_select"
  ON editions FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    OR is_superadmin()
    OR status IN ('active', 'finished')
  );

CREATE POLICY "editions_insert"
  ON editions FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "editions_update"
  ON editions FOR UPDATE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "editions_delete"
  ON editions FOR DELETE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── disciplines ───────────────────────────────────────────────
ALTER TABLE disciplines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disciplines_select"
  ON disciplines FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR is_superadmin() OR
    EXISTS (SELECT 1 FROM editions e WHERE e.id = disciplines.edition_id AND e.status IN ('active','finished')));

CREATE POLICY "disciplines_insert"
  ON disciplines FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "disciplines_update"
  ON disciplines FOR UPDATE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "disciplines_delete"
  ON disciplines FOR DELETE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── teams ─────────────────────────────────────────────────────
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select"
  ON teams FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR is_superadmin() OR
    EXISTS (SELECT 1 FROM editions e WHERE e.id = teams.edition_id AND e.status IN ('active','finished')));

CREATE POLICY "teams_insert"
  ON teams FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "teams_update"
  ON teams FOR UPDATE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "teams_delete"
  ON teams FOR DELETE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── groups ────────────────────────────────────────────────────
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select"
  ON groups FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR is_superadmin() OR
    EXISTS (SELECT 1 FROM editions e WHERE e.id = groups.edition_id AND e.status IN ('active','finished')));

CREATE POLICY "groups_insert"
  ON groups FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "groups_update"
  ON groups FOR UPDATE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "groups_delete"
  ON groups FOR DELETE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── phases ────────────────────────────────────────────────────
ALTER TABLE phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phases_select"
  ON phases FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR is_superadmin() OR
    EXISTS (SELECT 1 FROM editions e WHERE e.id = phases.edition_id AND e.status IN ('active','finished')));

CREATE POLICY "phases_insert"
  ON phases FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "phases_update"
  ON phases FOR UPDATE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "phases_delete"
  ON phases FOR DELETE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── matches ───────────────────────────────────────────────────
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matches_select"
  ON matches FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR is_superadmin() OR
    EXISTS (SELECT 1 FROM editions e WHERE e.id = matches.edition_id AND e.status IN ('active','finished')));

CREATE POLICY "matches_insert"
  ON matches FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "matches_update"
  ON matches FOR UPDATE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "matches_delete"
  ON matches FOR DELETE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── blocked_dates ─────────────────────────────────────────────
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_dates_all"
  ON blocked_dates FOR ALL
  USING (tenant_id = get_my_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── venue_slots ───────────────────────────────────────────────
ALTER TABLE venue_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_slots_all"
  ON venue_slots FOR ALL
  USING (tenant_id = get_my_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── team_disciplines ──────────────────────────────────────────
-- No tenant_id column; access scoped via discipline_id → edition_id
ALTER TABLE team_disciplines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_disciplines_select"
  ON team_disciplines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM disciplines d
      JOIN editions e ON e.id = d.edition_id
      WHERE d.id = team_disciplines.discipline_id
        AND (e.tenant_id = get_my_tenant_id() OR is_superadmin() OR e.status IN ('active','finished'))
    )
  );

CREATE POLICY "team_disciplines_write"
  ON team_disciplines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM disciplines d
      JOIN editions e ON e.id = d.edition_id
      WHERE d.id = team_disciplines.discipline_id
        AND (e.tenant_id = get_my_tenant_id() OR is_superadmin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM disciplines d
      JOIN editions e ON e.id = d.edition_id
      WHERE d.id = team_disciplines.discipline_id
        AND (e.tenant_id = get_my_tenant_id() OR is_superadmin())
    )
  );

-- ── Backfill hint ─────────────────────────────────────────────
-- If existing editions have tenant_id IS NULL, run:
--   UPDATE editions    SET tenant_id = '<your-tenant-id>' WHERE tenant_id IS NULL;
--   UPDATE disciplines SET tenant_id = '<your-tenant-id>' WHERE tenant_id IS NULL;
--   UPDATE teams       SET tenant_id = '<your-tenant-id>' WHERE tenant_id IS NULL;
--   UPDATE groups      SET tenant_id = '<your-tenant-id>' WHERE tenant_id IS NULL;
--   UPDATE phases      SET tenant_id = '<your-tenant-id>' WHERE tenant_id IS NULL;
--   UPDATE matches     SET tenant_id = '<your-tenant-id>' WHERE tenant_id IS NULL;
