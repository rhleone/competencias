-- Add image_url to editions for home page card covers
ALTER TABLE editions ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;
