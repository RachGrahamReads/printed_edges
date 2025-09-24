-- Comprehensive edge images security migration
-- This migration ensures all edge image buckets are properly secured for regeneration
-- Summary of security changes:
-- 1. Make edge-images and edges buckets private
-- 2. Add RLS policies for user-specific access
-- 3. Allow admin override for all buckets
-- 4. Create backwards compatibility for edge function naming

-- Ensure both edge image buckets exist and are private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES
  ('edge-images', 'edge-images', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[], NOW(), NOW()),
  ('edges', 'edges', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[], NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  public = false, -- Ensure they're private
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = NOW();

-- Drop any existing broad policies that might make edge images public
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Write Access" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own edge images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own edge images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own edge images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own edge images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own edge images in edges bucket" ON storage.objects;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

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

-- Add helpful documentation
COMMENT ON POLICY "Users can view own edge images in both buckets" ON storage.objects IS
'Secure access to edge images: users see only their own files in users/{user_id}/ paths, admins and service_role see all';
COMMENT ON POLICY "Users can upload own edge images to both buckets" ON storage.objects IS
'Users can only upload edge images to their own user folder paths';

-- Final verification: ensure edge image buckets are definitely private
UPDATE storage.buckets SET public = false WHERE id IN ('edge-images', 'edges');