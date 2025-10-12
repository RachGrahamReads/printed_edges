-- Make all storage buckets public (skip if column doesn't exist in older Supabase versions)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public'
  ) THEN
    UPDATE storage.buckets
    SET public = true
    WHERE id IN ('pdfs', 'edge-images', 'processed-pdfs');
  END IF;
END $$;

-- Create policy to allow public read access to objects in all buckets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Read Access') THEN
    CREATE POLICY "Public Read Access"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id IN ('pdfs', 'edge-images', 'processed-pdfs'));
  END IF;
END $$;

-- Create policy to allow public write access to objects in all buckets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Write Access') THEN
    CREATE POLICY "Public Write Access"
    ON storage.objects FOR INSERT
    TO public
    WITH CHECK (bucket_id IN ('pdfs', 'edge-images', 'processed-pdfs'));
  END IF;
END $$;