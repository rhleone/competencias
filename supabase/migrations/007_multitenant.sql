-- ============================================================
-- Etapa 1: Multitenant foundation
-- Adds: tenants, tenant_users, is_superadmin, tenant_id columns
-- ============================================================

-- ── Tenants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text UNIQUE NOT NULL,
  name             text NOT NULL,
  plan             text NOT NULL DEFAULT 'free',   -- free | basic | pro
  status           text NOT NULL DEFAULT 'active', -- active | suspended | cancelled
  suspended_at     timestamptz,
  suspended_reason text,
  trial_ends_at    timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ── Tenant ↔ User relationship with role ─────────────────────
CREATE TABLE IF NOT EXISTS tenant_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'operator',  -- tenant_admin | operator
  invited_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- ── Superadmin flag on profiles ───────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;

-- ── Add tenant_id to existing tables (nullable for backward compatibility) ──
ALTER TABLE editions      ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE disciplines   ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE teams         ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE groups        ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE phases        ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE matches       ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE blocked_dates ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE venue_slots   ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- ── Helper: get current user's tenant_id ─────────────────────
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM tenant_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- ── Helper: is current user a superadmin ─────────────────────
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(is_superadmin, false) FROM profiles WHERE id = auth.uid();
$$;

-- ── RLS on tenants ────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select_own"
  ON tenants FOR SELECT
  USING (id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "tenants_update_superadmin"
  ON tenants FOR UPDATE
  USING (is_superadmin());

CREATE POLICY "tenants_insert_superadmin"
  ON tenants FOR INSERT
  WITH CHECK (is_superadmin());

-- ── RLS on tenant_users ───────────────────────────────────────
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_users_select"
  ON tenant_users FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "tenant_users_insert"
  ON tenant_users FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "tenant_users_delete"
  ON tenant_users FOR DELETE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── NOTE ──────────────────────────────────────────────────────
-- Existing table RLS policies are NOT modified in this migration
-- to preserve backward compatibility. tenant_id columns are nullable.
-- Run the seed below to create the initial tenant and backfill data.
--
-- SEED (run manually in Supabase SQL editor after migration):
--
-- 1. Create the initial tenant:
--    INSERT INTO tenants (slug, name, plan)
--    VALUES ('belgrano', 'Colegio Belgrano', 'pro')
--    RETURNING id;
--
-- 2. Assign the admin user to the tenant (replace UUIDs):
--    INSERT INTO tenant_users (tenant_id, user_id, role)
--    VALUES ('<tenant_id>', '<user_id>', 'tenant_admin');
--
-- 3. Backfill tenant_id on existing data:
--    UPDATE editions      SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
--    UPDATE disciplines   SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
--    UPDATE teams         SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
--    UPDATE groups        SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
--    UPDATE phases        SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
--    UPDATE matches       SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
--    UPDATE blocked_dates SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
--    UPDATE venue_slots   SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
