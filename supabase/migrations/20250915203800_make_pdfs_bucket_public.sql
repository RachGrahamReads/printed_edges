-- Make all storage buckets public
UPDATE storage.buckets
SET public = true
WHERE id IN ('pdfs', 'edge-images', 'processed-pdfs');

-- Create policy to allow public read access to objects in all buckets
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('pdfs', 'edge-images', 'processed-pdfs'));

-- Create policy to allow public write access to objects in all buckets
CREATE POLICY "Public Write Access"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id IN ('pdfs', 'edge-images', 'processed-pdfs'));