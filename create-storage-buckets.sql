-- Create storage buckets for Printed Edges app

-- Bucket for original PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdfs',
  'pdfs',
  false,  -- Private bucket, requires authentication
  5368709120,  -- 5GB limit
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket for edge images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'edge-images',
  'edge-images',
  false,  -- Private bucket
  52428800,  -- 50MB limit for images
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket for processed PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'processed-pdfs',
  'processed-pdfs',
  false,  -- Private bucket
  5368709120,  -- 5GB limit
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS Policies for authenticated users to manage their own files

-- PDFs bucket policies
CREATE POLICY "Users can upload their own PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own PDFs"
ON storage.objects FOR DELETE
USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Edge images bucket policies
CREATE POLICY "Users can upload their own edge images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'edge-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own edge images"
ON storage.objects FOR SELECT
USING (bucket_id = 'edge-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own edge images"
ON storage.objects FOR DELETE
USING (bucket_id = 'edge-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Processed PDFs bucket policies
CREATE POLICY "Users can upload their own processed PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'processed-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own processed PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'processed-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own processed PDFs"
ON storage.objects FOR DELETE
USING (bucket_id = 'processed-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);