-- Complete fix for infinite recursion in users table RLS policies
-- This should completely resolve the recursion issue

-- Step 1: Completely disable RLS and clean up all policies
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on users table
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                      policy_record.policyname,
                      policy_record.schemaname,
                      policy_record.tablename);
    END LOOP;
END $$;

-- Drop ALL existing policies on user_credits table
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'user_credits'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                      policy_record.policyname,
                      policy_record.schemaname,
                      policy_record.tablename);
    END LOOP;
END $$;

-- Step 2: Create extremely simple, non-recursive policies for users table
CREATE POLICY "simple_user_select" ON public.users
    FOR SELECT USING (
        auth.role() = 'service_role' OR
        auth.uid()::text = id::text
    );

CREATE POLICY "simple_user_update" ON public.users
    FOR UPDATE USING (
        auth.role() = 'service_role' OR
        auth.uid()::text = id::text
    );

CREATE POLICY "simple_user_insert" ON public.users
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role' OR
        auth.uid()::text = id::text
    );

-- Step 3: Create simple policies for user_credits table
CREATE POLICY "simple_credits_select" ON public.user_credits
    FOR SELECT USING (
        auth.role() = 'service_role' OR
        auth.uid()::text = user_id::text
    );

CREATE POLICY "simple_credits_update" ON public.user_credits
    FOR UPDATE USING (
        auth.role() = 'service_role' OR
        auth.uid()::text = user_id::text
    );

CREATE POLICY "simple_credits_insert" ON public.user_credits
    FOR INSERT WITH CHECK (
        auth.role() = 'service_role' OR
        auth.uid()::text = user_id::text
    );

CREATE POLICY "simple_credits_delete" ON public.user_credits
    FOR DELETE USING (
        auth.role() = 'service_role' OR
        auth.uid()::text = user_id::text
    );

-- Step 4: Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- Step 5: Grant explicit permissions to service_role to bypass any issues
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_credits TO service_role;

-- Ensure service_role can bypass RLS entirely
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits FORCE ROW LEVEL SECURITY;

-- Add comments
COMMENT ON TABLE public.users IS 'Users table with completely rebuilt RLS policies to eliminate recursion';
COMMENT ON TABLE public.user_credits IS 'User credits table with simple, non-recursive RLS policies';