-- 016_seeding_mode.sql
-- Seeding mode for bracket generation per discipline.
-- 'merit'      : all qualifiers sorted by merit across groups (current default)
-- 'cross_group': interleaved by group position — 1A vs KB, 2A vs (K-1)B, … (requires exactly 2 groups)

ALTER TABLE public.disciplines
  ADD COLUMN IF NOT EXISTS seeding_mode TEXT NOT NULL DEFAULT 'merit'
    CHECK (seeding_mode IN ('merit', 'cross_group'));
