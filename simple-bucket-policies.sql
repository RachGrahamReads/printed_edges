-- Create policies that allow public access to our specific buckets
-- Run these one by one in the Supabase SQL Editor

-- For pdfs bucket
CREATE POLICY "Public upload to pdfs" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'pdfs');

CREATE POLICY "Public read from pdfs" ON storage.objects
FOR SELECT USING (bucket_id = 'pdfs');

-- For edge-images bucket
CREATE POLICY "Public upload to edge-images" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'edge-images');

CREATE POLICY "Public read from edge-images" ON storage.objects
FOR SELECT USING (bucket_id = 'edge-images');

-- For processed-pdfs bucket
CREATE POLICY "Public upload to processed-pdfs" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'processed-pdfs');

CREATE POLICY "Public read from processed-pdfs" ON storage.objects
FOR SELECT USING (bucket_id = 'processed-pdfs');