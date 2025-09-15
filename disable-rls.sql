-- Disable RLS on storage.objects for all our buckets to allow anonymous uploads
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Or alternatively, create permissive policies for our specific buckets
-- Allow anonymous uploads to our public buckets
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