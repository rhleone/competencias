-- ============================================================
-- 015_field_names.sql
-- Named courts per discipline.
-- Key: (discipline_id, field_number) — C1 for men's can differ from C1 for women's.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.field_names (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id    uuid        NOT NULL REFERENCES public.editions(id)    ON DELETE CASCADE,
  discipline_id uuid        NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  tenant_id     uuid        REFERENCES public.tenants(id),
  field_number  integer     NOT NULL CHECK (field_number > 0),
  name          text        NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(discipline_id, field_number)
);

CREATE INDEX idx_field_names_edition    ON public.field_names(edition_id);
CREATE INDEX idx_field_names_discipline ON public.field_names(discipline_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.field_names ENABLE ROW LEVEL SECURITY;

-- Public read when edition is active/finished
CREATE POLICY "field_names_select"
  ON public.field_names FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    OR is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.editions e
      WHERE e.id = field_names.edition_id
        AND e.status IN ('active', 'finished')
    )
  );

CREATE POLICY "field_names_insert"
  ON public.field_names FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "field_names_update"
  ON public.field_names FOR UPDATE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

CREATE POLICY "field_names_delete"
  ON public.field_names FOR DELETE
  USING (tenant_id = get_my_tenant_id() OR is_superadmin());

-- ── Grants (explicit — post 014 policy) ──────────────────────
GRANT SELECT ON public.field_names TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_names TO authenticated;
