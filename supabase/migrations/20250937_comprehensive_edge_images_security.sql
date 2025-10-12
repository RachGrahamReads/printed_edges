-- Comprehensive edge images security migration
-- This migration ensures all edge image buckets are properly secured for regeneration
-- Summary of security changes:
-- 1. Make edge-images and edges buckets private
-- 2. Add RLS policies for user-specific access
-- 3. Allow admin override for all buckets
-- 4. Create backwards compatibility for edge function naming

-- Ensure both edge image buckets exist and are private (compatible with older Supabase versions)
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
      ('edge-images', 'edge-images', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[], NOW(), NOW()),
      ('edges', 'edges', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[], NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      updated_at = NOW();
  ELSE
    -- Insert with basic columns only
    INSERT INTO storage.buckets (id, name, created_at, updated_at)
    VALUES
      ('edge-images', 'edge-images', NOW(), NOW()),
      ('edges', 'edges', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
  END IF;
END $$;

-- Drop any existing broad policies that might make edge images public
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Write Access" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own edge images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own edge images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own edge images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own edge images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own edge images in edges bucket" ON storage.objects;
DROP POLICY IF EXISTS "Public access to pdfs and processed-pdfs" ON storage.objects;

-- Enable RLS on storage.objects if not already enabled (skip if permission denied)
DO $$
BEGIN
  EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL; -- RLS may already be enabled or we don't have permission (not critical)
END $$;

-- Create comprehensive secure policies for edge image buckets
-- Policy 1: Users can view their own edge images (both buckets)
CREATE POLICY "Users can view own edge images in both buckets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id IN ('edge-images', 'edges')
  AND (
    -- User can access their own files (path starts with users/{user_id}/)
    name LIKE CONCAT('users/', auth.uid()::text, '/%')
    OR
    -- Admins can access all edge images
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
    OR
    -- Service role can access everything (for Edge Functions)
    auth.role() = 'service_role'
  )
);

-- Policy 2: Users can upload to their own folders
CREATE POLICY "Users can upload own edge images to both buckets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('edge-images', 'edges')
  AND (
    name LIKE CONCAT('users/', auth.uid()::text, '/%')
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
    OR
    auth.role() = 'service_role'
  )
);

-- Policy 3: Users can update their own images
CREATE POLICY "Users can update own edge images in both buckets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('edge-images', 'edges')
  AND (
    name LIKE CONCAT('users/', auth.uid()::text, '/%')
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
    OR
    auth.role() = 'service_role'
  )
);

-- Policy 4: Users can delete their own images
CREATE POLICY "Users can delete own edge images in both buckets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('edge-images', 'edges')
  AND (
    name LIKE CONCAT('users/', auth.uid()::text, '/%')
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
    OR
    auth.role() = 'service_role'
  )
);

-- Policy 5: Keep other buckets public as needed
CREATE POLICY "Public access to pdfs and processed-pdfs"
ON storage.objects FOR ALL
TO public
USING (bucket_id IN ('pdfs', 'processed-pdfs'))
WITH CHECK (bucket_id IN ('pdfs', 'processed-pdfs'));

-- Grant necessary permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.objects TO service_role;

-- Final verification: ensure edge image buckets are definitely private (skip if public column doesn't exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'public'
  ) THEN
    UPDATE storage.buckets SET public = false WHERE id IN ('edge-images', 'edges');
  END IF;
END $$;