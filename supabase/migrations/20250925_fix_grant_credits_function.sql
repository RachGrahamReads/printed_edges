-- Fix the grant_credits function by adding unique constraint and updating function

-- Add unique constraint on user_id to prevent duplicates
-- Use DO block to check if constraint exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_credits_user_id_unique'
    ) THEN
        ALTER TABLE public.user_credits ADD CONSTRAINT user_credits_user_id_unique UNIQUE (user_id);
    END IF;
END $$;

-- Update the grant_credits function to work correctly with the unique constraint
CREATE OR REPLACE FUNCTION public.grant_credits(
    p_user_id UUID,
    p_credits INTEGER,
    p_purchase_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Update or insert user credits with proper conflict handling
    INSERT INTO public.user_credits (user_id, total_credits, used_credits)
    VALUES (p_user_id, p_credits, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET total_credits = user_credits.total_credits + p_credits,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;