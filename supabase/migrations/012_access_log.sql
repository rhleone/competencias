-- Etapa 5: Log de accesos cross-tenant del superadmin

CREATE TABLE IF NOT EXISTS superadmin_access_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_id  uuid NOT NULL REFERENCES auth.users(id),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  accessed_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE superadmin_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_read_access_log" ON superadmin_access_log
  FOR SELECT USING (is_superadmin());

CREATE POLICY "superadmin_insert_access_log" ON superadmin_access_log
  FOR INSERT WITH CHECK (is_superadmin());

-- Index for dashboard queries
CREATE INDEX idx_access_log_tenant ON superadmin_access_log (tenant_id, accessed_at DESC);
CREATE INDEX idx_access_log_superadmin ON superadmin_access_log (superadmin_id, accessed_at DESC);
