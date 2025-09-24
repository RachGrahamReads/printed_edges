-- Fix RLS policy issues and infinite recursion problems

-- First, drop the problematic admin view and recreate it
DROP VIEW IF EXISTS public.admin_user_overview;

-- Temporarily disable RLS on users table to fix the infinite recursion
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Drop existing policies on users table that might be causing recursion
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;

-- Create simpler, non-recursive policies for users table
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Re-enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create a simpler admin view that doesn't cause recursion
CREATE OR REPLACE VIEW public.admin_user_overview AS
SELECT
    au.id,
    au.email,
    au.raw_user_meta_data->>'first_name' as name,
    CASE
        WHEN au.email = 'rachgrahamreads@gmail.com' THEN true
        ELSE false
    END as is_admin,
    au.created_at,
    au.last_sign_in_at,
    au.email_confirmed_at IS NOT NULL as email_confirmed,
    COALESCE(uc.total_credits, 0) as total_credits,
    COALESCE(uc.used_credits, 0) as used_credits,
    COALESCE(uc.total_credits, 0) - COALESCE(uc.used_credits, 0) as available_credits,
    (
        SELECT COUNT(*)
        FROM public.processing_jobs pj
        WHERE pj.user_id = au.id
    ) as total_jobs,
    (
        SELECT COUNT(*)
        FROM public.edge_designs ed
        WHERE ed.user_id = au.id AND ed.is_active = true
    ) as total_designs,
    (
        SELECT COUNT(*)
        FROM public.purchases p
        WHERE p.user_id = au.id AND p.status = 'completed'
    ) as completed_purchases,
    (
        SELECT SUM(p.amount)
        FROM public.purchases p
        WHERE p.user_id = au.id AND p.status = 'completed'
    ) as total_spent
FROM auth.users au
LEFT JOIN public.user_credits uc ON au.id = uc.user_id
ORDER BY au.created_at DESC;

-- Grant permissions for the admin view to service role
GRANT SELECT ON public.admin_user_overview TO service_role;
GRANT SELECT ON public.admin_user_overview TO authenticated;

-- Ensure service role can bypass RLS on all relevant tables
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_credits TO service_role;
GRANT ALL ON public.purchases TO service_role;
GRANT ALL ON public.processing_jobs TO service_role;
GRANT ALL ON public.edge_designs TO service_role;

-- Create policy for admin access to user_credits
DROP POLICY IF EXISTS "Service role can manage all credits" ON public.user_credits;
CREATE POLICY "Service role can manage all credits" ON public.user_credits
    FOR ALL USING (auth.role() = 'service_role');

-- Create policy for admin access to purchases
DROP POLICY IF EXISTS "Service role can manage all purchases" ON public.purchases;
CREATE POLICY "Service role can manage all purchases" ON public.purchases
    FOR ALL USING (auth.role() = 'service_role');

-- Ensure the unique constraint exists on user_credits
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_credits_user_id_unique'
    ) THEN
        ALTER TABLE public.user_credits ADD CONSTRAINT user_credits_user_id_unique UNIQUE (user_id);
    END IF;
END $$;

-- Update the grant_credits function to be more robust
CREATE OR REPLACE FUNCTION public.grant_credits(
    p_user_id UUID,
    p_credits INTEGER,
    p_purchase_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Insert or update user credits with proper conflict handling
    INSERT INTO public.user_credits (user_id, total_credits, used_credits, created_at, updated_at)
    VALUES (p_user_id, p_credits, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET
        total_credits = user_credits.total_credits + p_credits,
        updated_at = NOW();

    -- Log the credit grant for debugging
    RAISE NOTICE 'Granted % credits to user %', p_credits, p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on the function
GRANT EXECUTE ON FUNCTION public.grant_credits(UUID, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits(UUID, INTEGER, UUID) TO authenticated;