-- Add image_url to editions for home page card covers
ALTER TABLE editions ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;

-- Storage policies for edition-covers bucket
-- Run after creating the bucket in Supabase Storage dashboard

CREATE POLICY "Public read edition covers"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'edition-covers');

CREATE POLICY "Authenticated upload edition covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'edition-covers');

CREATE POLICY "Authenticated update edition covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'edition-covers');

CREATE POLICY "Authenticated delete edition covers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'edition-covers');
