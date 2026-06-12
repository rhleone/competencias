-- 018_penalty_scores.sql
-- Add penalty shootout columns to matches for knockout tiebreakers

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS penalty_home_score INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_away_score INTEGER;
