-- Add logo_url column to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo_url TEXT;
