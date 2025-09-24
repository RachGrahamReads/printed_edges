-- Setup storage buckets for PDF processing
-- This ensures the local development environment has the required storage buckets

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES
  ('pdfs', 'pdfs', true, 52428800, ARRAY['application/pdf']::text[], NOW(), NOW()),
  ('edge-images', 'edge-images', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[], NOW(), NOW()),
  ('processed-pdfs', 'processed-pdfs', true, 52428800, ARRAY['application/pdf']::text[], NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = NOW();

-- Ensure buckets are public (in case they existed but weren't public)
UPDATE storage.buckets
SET public = true
WHERE id IN ('pdfs', 'edge-images', 'processed-pdfs');

-- Create storage policies if they don't exist
DO $$
BEGIN
  -- Public read access policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Read Access') THEN
    EXECUTE 'CREATE POLICY "Public Read Access" ON storage.objects FOR SELECT TO public USING (bucket_id IN (''pdfs'', ''edge-images'', ''processed-pdfs''))';
  END IF;

  -- Public write access policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Write Access') THEN
    EXECUTE 'CREATE POLICY "Public Write Access" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id IN (''pdfs'', ''edge-images'', ''processed-pdfs''))';
  END IF;
END $$;