-- Create enum for payment status
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- Create enum for purchase type
CREATE TYPE purchase_type AS ENUM ('single_image', 'three_images');

-- Add Stripe customer ID to existing users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- Create table for tracking user credits
CREATE TABLE IF NOT EXISTS public.user_credits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    total_credits INTEGER DEFAULT 0 NOT NULL,
    used_credits INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT credits_check CHECK (used_credits <= total_credits),
    CONSTRAINT credits_non_negative CHECK (total_credits >= 0 AND used_credits >= 0)
);

-- Create table for edge designs (user's purchased designs)
CREATE TABLE IF NOT EXISTS public.edge_designs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    side_image_path TEXT,
    top_image_path TEXT,
    bottom_image_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL
);

-- Create table for payments/purchases
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_session_id TEXT UNIQUE,
    amount INTEGER NOT NULL, -- Amount in cents
    currency TEXT DEFAULT 'usd' NOT NULL,
    purchase_type purchase_type NOT NULL,
    credits_granted INTEGER NOT NULL,
    status payment_status DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}' NOT NULL
);

-- Create table for processing jobs (tracks PDF processing with edge designs)
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    edge_design_id UUID REFERENCES public.edge_designs(id) ON DELETE CASCADE NOT NULL,
    input_pdf_path TEXT NOT NULL,
    output_pdf_path TEXT,
    page_count INTEGER,
    page_type TEXT,
    bleed_type TEXT,
    edge_type TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}' NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON public.user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_edge_designs_user_id ON public.edge_designs(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON public.purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_edge_design_id ON public.processing_jobs(edge_design_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.processing_jobs(status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_credits
CREATE POLICY "Users can view their own credits"
    ON public.user_credits FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Only service role can insert/update credits"
    ON public.user_credits FOR ALL
    USING (auth.role() = 'service_role');

-- RLS Policies for edge_designs
CREATE POLICY "Users can view their own edge designs"
    ON public.edge_designs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own edge designs"
    ON public.edge_designs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own edge designs"
    ON public.edge_designs FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policies for purchases
CREATE POLICY "Users can view their own purchases"
    ON public.purchases FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Only service role can manage purchases"
    ON public.purchases FOR ALL
    USING (auth.role() = 'service_role');

-- RLS Policies for processing_jobs
CREATE POLICY "Users can view their own processing jobs"
    ON public.processing_jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own processing jobs"
    ON public.processing_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own processing jobs"
    ON public.processing_jobs FOR UPDATE
    USING (auth.uid() = user_id);

-- Function to automatically create user credits entry when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert user credits with 0 credits
    INSERT INTO public.user_credits (user_id, total_credits, used_credits)
    VALUES (NEW.id, 0, 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user is created
CREATE TRIGGER on_user_created
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Function to grant credits after successful payment
CREATE OR REPLACE FUNCTION public.grant_credits(
    p_user_id UUID,
    p_credits INTEGER,
    p_purchase_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Update or insert user credits
    INSERT INTO public.user_credits (user_id, total_credits, used_credits)
    VALUES (p_user_id, p_credits, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET total_credits = public.user_credits.total_credits + p_credits,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to consume a credit when creating an edge design
CREATE OR REPLACE FUNCTION public.consume_credit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_available_credits INTEGER;
BEGIN
    -- Check if user has available credits
    SELECT (total_credits - used_credits) INTO v_available_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;

    IF v_available_credits IS NULL OR v_available_credits < 1 THEN
        RETURN FALSE;
    END IF;

    -- Consume one credit
    UPDATE public.user_credits
    SET used_credits = used_credits + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;