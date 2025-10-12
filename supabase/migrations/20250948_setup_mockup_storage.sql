-- Setup storage for book mockup generation

-- Create mockup storage buckets (compatible with older Supabase versions)
DO $$
DECLARE
  has_public_column boolean;
  has_limits_column boolean;
BEGIN
  -- Check if columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public'
  ) INTO has_public_column;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
  ) INTO has_limits_column;

  -- Insert with all columns if they exist
  IF has_public_column AND has_limits_column THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
    VALUES
      ('mockup-uploads', 'mockup-uploads', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[], NOW(), NOW()),
      ('mockup-outputs', 'mockup-outputs', true, 10485760, ARRAY['image/png']::text[], NOW(), NOW()),
      ('mockup-templates', 'mockup-templates', true, 10485760, ARRAY['image/png']::text[], NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
  ELSE
    -- Insert with basic columns only
    INSERT INTO storage.buckets (id, name, created_at, updated_at)
    VALUES
      ('mockup-uploads', 'mockup-uploads', NOW(), NOW()),
      ('mockup-outputs', 'mockup-outputs', NOW(), NOW()),
      ('mockup-templates', 'mockup-templates', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
  END IF;
END $$;

-- Public read access policy for mockup buckets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Mockup Public Read Access') THEN
    CREATE POLICY "Mockup Public Read Access"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id IN ('mockup-uploads', 'mockup-outputs', 'mockup-templates'));
  END IF;
END $$;

-- Public write access policy for mockup uploads
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Mockup Public Write Access') THEN
    CREATE POLICY "Mockup Public Write Access"
    ON storage.objects FOR INSERT
    TO public
    WITH CHECK (bucket_id IN ('mockup-uploads', 'mockup-outputs'));
  END IF;
END $$;

-- Public update access for mockup outputs (for upsert)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Mockup Public Update Access') THEN
    CREATE POLICY "Mockup Public Update Access"
    ON storage.objects FOR UPDATE
    TO public
    USING (bucket_id IN ('mockup-uploads', 'mockup-outputs'));
  END IF;
END $$;
