-- Create table for PDF complexity analysis logs
-- Stores complexity metrics for every PDF uploaded, with success/failure tracking
CREATE TABLE IF NOT EXISTS public.pdf_complexity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Allow anonymous analysis
    session_id TEXT NOT NULL, -- Links to processing session

    -- Basic file info
    file_size BIGINT NOT NULL, -- in bytes
    file_size_mb DECIMAL(10, 2) NOT NULL,
    page_count INTEGER NOT NULL,

    -- Page properties
    avg_page_width DECIMAL(10, 2),
    avg_page_height DECIMAL(10, 2),
    has_variable_page_sizes BOOLEAN DEFAULT FALSE,

    -- Complexity indicators
    total_fonts INTEGER DEFAULT 0,
    total_images INTEGER DEFAULT 0,
    has_transparency BOOLEAN DEFAULT FALSE,
    has_annotations BOOLEAN DEFAULT FALSE,
    has_xobjects INTEGER DEFAULT 0,
    large_image_count INTEGER DEFAULT 0,

    -- Font details (stored as JSONB for flexibility)
    font_names JSONB DEFAULT '[]'::JSONB,

    -- Scoring
    complexity_score INTEGER NOT NULL, -- 0-100
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    risk_factors JSONB DEFAULT '[]'::JSONB, -- Array of strings

    -- Processing outcome tracking
    processing_status TEXT, -- 'pending', 'success', 'failed', 'cancelled'
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_duration_ms INTEGER, -- Duration in milliseconds
    error_message TEXT, -- If failed, what was the error
    error_type TEXT, -- Categorize errors: 'timeout', 'memory', 'complexity', 'network', etc.

    -- Processing details
    page_type TEXT, -- 'bw', 'standard', 'premium'
    bleed_type TEXT, -- 'add_bleed', 'existing_bleed'
    edge_type TEXT, -- 'side-only', 'all-edges'

    -- Metadata
    analyzed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for querying and analysis
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_user_id ON public.pdf_complexity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_session_id ON public.pdf_complexity_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_risk_level ON public.pdf_complexity_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_processing_status ON public.pdf_complexity_logs(processing_status);
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_complexity_score ON public.pdf_complexity_logs(complexity_score);
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_analyzed_at ON public.pdf_complexity_logs(analyzed_at);

-- Create composite index for common queries (correlation analysis)
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_status_risk ON public.pdf_complexity_logs(processing_status, risk_level);
CREATE INDEX IF NOT EXISTS idx_pdf_complexity_logs_score_status ON public.pdf_complexity_logs(complexity_score, processing_status);

-- Enable Row Level Security
ALTER TABLE public.pdf_complexity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Allow users to view their own complexity logs
CREATE POLICY "Users can view own complexity logs"
    ON public.pdf_complexity_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Allow users to insert their own complexity logs
CREATE POLICY "Users can insert own complexity logs"
    ON public.pdf_complexity_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own complexity logs (for status tracking)
CREATE POLICY "Users can update own complexity logs"
    ON public.pdf_complexity_logs
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Allow service role to insert anonymous logs (for non-authenticated users during analysis)
CREATE POLICY "Service role can insert any complexity logs"
    ON public.pdf_complexity_logs
    FOR INSERT
    WITH CHECK (true);

-- Allow service role to update any logs (for backend status tracking)
CREATE POLICY "Service role can update any complexity logs"
    ON public.pdf_complexity_logs
    FOR UPDATE
    USING (true);

-- Admin users can view all complexity logs for analysis
CREATE POLICY "Admins can view all complexity logs"
    ON public.pdf_complexity_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_pdf_complexity_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pdf_complexity_logs_updated_at
    BEFORE UPDATE ON public.pdf_complexity_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_pdf_complexity_logs_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.pdf_complexity_logs IS 'Stores PDF complexity analysis metrics and processing outcomes for correlation analysis and threshold calibration';
COMMENT ON COLUMN public.pdf_complexity_logs.session_id IS 'Unique session identifier that links complexity analysis to processing attempt';
COMMENT ON COLUMN public.pdf_complexity_logs.complexity_score IS 'Calculated complexity score (0-100) based on fonts, images, transparency, etc.';
COMMENT ON COLUMN public.pdf_complexity_logs.processing_status IS 'Outcome of processing attempt: pending, success, failed, cancelled';
COMMENT ON COLUMN public.pdf_complexity_logs.error_type IS 'Categorized error type for failure analysis: timeout, memory, complexity, network, etc.';
