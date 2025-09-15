-- Disable RLS on storage.objects table to allow anonymous uploads
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Alternatively, if you want to keep RLS enabled but allow anonymous access to our buckets:
-- First, re-enable RLS if it was disabled
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Then create policies that allow anonymous access to our specific buckets
DROP POLICY IF EXISTS "Allow anonymous uploads to pdfs bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous reads from pdfs bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous uploads to edge-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous reads from edge-images bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous uploads to processed-pdfs bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous reads from processed-pdfs bucket" ON storage.objects;

CREATE POLICY "Allow anonymous uploads to pdfs bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pdfs');

CREATE POLICY "Allow anonymous reads from pdfs bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'pdfs');

CREATE POLICY "Allow anonymous uploads to edge-images bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'edge-images');

CREATE POLICY "Allow anonymous reads from edge-images bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'edge-images');

CREATE POLICY "Allow anonymous uploads to processed-pdfs bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'processed-pdfs');

CREATE POLICY "Allow anonymous reads from processed-pdfs bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'processed-pdfs');