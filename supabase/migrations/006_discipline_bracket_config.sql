-- 006_discipline_bracket_config.sql
-- Add bracket qualification config to disciplines
-- Add loser advancement support to matches (for 3rd place playoff)

ALTER TABLE disciplines
  ADD COLUMN IF NOT EXISTS qualifying_per_group INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS best_thirds_count    INTEGER NOT NULL DEFAULT 0;

-- loser_advances_to: for SF loser → 3rd place playoff
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS loser_advances_to UUID REFERENCES matches(id),
  ADD COLUMN IF NOT EXISTS loser_slot        TEXT CHECK (loser_slot IN ('home', 'away'));

-- Index
CREATE INDEX IF NOT EXISTS idx_matches_loser_advances_to ON matches(loser_advances_to) WHERE loser_advances_to IS NOT NULL;
