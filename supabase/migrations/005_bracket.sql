-- 005_bracket.sql
-- Add bracket support columns to matches table

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS bracket_position TEXT,
  ADD COLUMN IF NOT EXISTS winner_advances_to UUID REFERENCES matches(id),
  ADD COLUMN IF NOT EXISTS winner_slot TEXT CHECK (winner_slot IN ('home', 'away'));

-- Index for bracket queries
CREATE INDEX IF NOT EXISTS idx_matches_bracket_position ON matches(bracket_position) WHERE bracket_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_winner_advances_to ON matches(winner_advances_to) WHERE winner_advances_to IS NOT NULL;
