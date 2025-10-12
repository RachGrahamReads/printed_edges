-- Secure the edge-images bucket to be private with proper access controls
-- Only users can access their own edge images, and admins can access all

-- First, ensure buckets exist and configure them (compatible with older Supabase versions)
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
      ('pdfs', 'pdfs', true, 52428800, ARRAY['application/pdf']::text[], NOW(), NOW()),
      ('edge-images', 'edge-images', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[], NOW(), NOW()),
      ('processed-pdfs', 'processed-pdfs', true, 52428800, ARRAY['application/pdf']::text[], NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      updated_at = NOW();
  ELSE
    -- Insert with basic columns only
    INSERT INTO storage.buckets (id, name, created_at, updated_at)
    VALUES
      ('pdfs', 'pdfs', NOW(), NOW()),
      ('edge-images', 'edge-images', NOW(), NOW()),
      ('processed-pdfs', 'processed-pdfs', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
  END IF;
END $$;

-- Remove any existing broad public policies for edge-images
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Write Access" ON storage.objects;

-- Create secure policies for edge-images bucket
-- Users can only access edge images in their own user folder structure
CREATE POLICY "Users can view own edge images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'edge-images'
  AND (
    -- User can access their own files (path starts with users/{user_id}/)
    name LIKE CONCAT('users/', auth.uid()::text, '/%')
    OR
    -- Admins can access all edge images
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);

CREATE POLICY "Users can upload own edge images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'edge-images'
  AND name LIKE CONCAT('users/', auth.uid()::text, '/%')
);

CREATE POLICY "Users can update own edge images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'edge-images'
  AND (
    name LIKE CONCAT('users/', auth.uid()::text, '/%')
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);

CREATE POLICY "Users can delete own edge images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'edge-images'
  AND (
    name LIKE CONCAT('users/', auth.uid()::text, '/%')
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);

-- Create policies for other buckets (keeping them public for now)
CREATE POLICY "Public access to pdfs and processed-pdfs"
ON storage.objects FOR ALL
TO public
USING (bucket_id IN ('pdfs', 'processed-pdfs'))
WITH CHECK (bucket_id IN ('pdfs', 'processed-pdfs'));

-- Enable RLS on storage.objects if not already enabled (skip if permission denied)
DO $$
BEGIN
  EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL; -- RLS may already be enabled or we don't have permission (not critical)
END $$;