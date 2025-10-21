-- Add new PDF metadata columns to existing pdf_complexity_logs table
-- This migration adds columns for enhanced metadata collection

-- Add file size per page (key metric for flattening detection)
ALTER TABLE public.pdf_complexity_logs
ADD COLUMN IF NOT EXISTS file_size_per_page_mb DECIMAL(10, 6);

-- Add PDF Document Metadata columns
ALTER TABLE public.pdf_complexity_logs
ADD COLUMN IF NOT EXISTS pdf_version TEXT,
ADD COLUMN IF NOT EXISTS is_linearized BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS creator TEXT,
ADD COLUMN IF NOT EXISTS producer TEXT,
ADD COLUMN IF NOT EXISTS creation_date TEXT,
ADD COLUMN IF NOT EXISTS is_acro_form_present BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_xfa_present BOOLEAN DEFAULT FALSE;

-- Add comments for the new columns
COMMENT ON COLUMN public.pdf_complexity_logs.file_size_per_page_mb IS 'File size divided by page count - KEY indicator of flattening vs compression (smaller values may indicate problematic non-flattened PDFs)';
COMMENT ON COLUMN public.pdf_complexity_logs.pdf_version IS 'PDF format version from metadata (e.g., "1.7")';
COMMENT ON COLUMN public.pdf_complexity_logs.is_linearized IS 'Whether PDF is optimized for web streaming (linearized)';
COMMENT ON COLUMN public.pdf_complexity_logs.creator IS 'Application that created the original document (e.g., "Adobe InDesign", "Canva")';
COMMENT ON COLUMN public.pdf_complexity_logs.producer IS 'Software that generated the PDF (e.g., "Adobe PDF Library", "iText")';
COMMENT ON COLUMN public.pdf_complexity_logs.creation_date IS 'Creation date from PDF metadata';
COMMENT ON COLUMN public.pdf_complexity_logs.is_acro_form_present IS 'Whether PDF contains AcroForm interactive forms';
COMMENT ON COLUMN public.pdf_complexity_logs.is_xfa_present IS 'Whether PDF contains XML Forms Architecture (XFA) forms';

-- Create index on file_size_per_page_mb for analysis queries
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_file_size_per_page
ON public.pdf_complexity_logs(file_size_per_page_mb);

-- Create index on creator for pattern analysis
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_creator
ON public.pdf_complexity_logs(creator);

-- Create index on producer for pattern analysis
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_producer
ON public.pdf_complexity_logs(producer);
