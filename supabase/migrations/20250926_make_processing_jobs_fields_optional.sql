-- Make processing_jobs fields optional for hybrid approach
-- We store edge images for reuse but process PDFs in-memory

-- Only modify if the table exists and the column is currently NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'processing_jobs'
    ) THEN
        ALTER TABLE public.processing_jobs
        ALTER COLUMN input_pdf_path DROP NOT NULL;

        -- Add comments to explain the hybrid approach
        COMMENT ON COLUMN public.processing_jobs.input_pdf_path IS 'Optional - only used when PDFs are stored, null for in-memory processing';
        COMMENT ON COLUMN public.processing_jobs.edge_design_id IS 'Edge design for reusable edge images';
    END IF;
END $$;