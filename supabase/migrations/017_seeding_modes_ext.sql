-- 017_seeding_modes_ext.sql
-- Extend seeding_mode with 'ranked_byes' and 'manual'.
-- ranked_byes : best seeds receive BYE automatically (merit order, getSeedingSlots).
-- manual      : bracket shells created without team assignment; admin seeds manually.

ALTER TABLE public.disciplines
  DROP CONSTRAINT IF EXISTS disciplines_seeding_mode_check;

ALTER TABLE public.disciplines
  ADD CONSTRAINT disciplines_seeding_mode_check
    CHECK (seeding_mode IN ('merit', 'cross_group', 'ranked_byes', 'manual'));
