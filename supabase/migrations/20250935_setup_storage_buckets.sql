-- Setup storage buckets for PDF processing
-- This ensures the local development environment has the required storage buckets

-- Create storage buckets if they don't exist (compatible with older Supabase versions)
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
      ('edge-images', 'edge-images', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[], NOW(), NOW()),
      ('processed-pdfs', 'processed-pdfs', true, 52428800, ARRAY['application/pdf']::text[], NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
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