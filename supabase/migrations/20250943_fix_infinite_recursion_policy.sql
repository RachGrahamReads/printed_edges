-- Fix infinite recursion in users table RLS policies
-- This is preventing dashboard API from fetching user data and credits

-- Temporarily disable RLS on users table to fix the policies
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies that might be causing recursion
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Service role can manage all users" ON public.users;

-- Create simple, non-recursive policies
-- Policy for users to view their own profile (no recursion)
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Policy for users to update their own profile (no recursion)
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Policy for service role to have full access (bypasses RLS anyway)
CREATE POLICY "Service role full access" ON public.users
    FOR ALL USING (auth.role() = 'service_role');

-- Re-enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Also ensure user_credits table has proper policies
DROP POLICY IF EXISTS "Users can view their own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update their own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Service role can manage all credits" ON public.user_credits;

-- Create simple policies for user_credits
CREATE POLICY "Users can view own credits" ON public.user_credits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own credits" ON public.user_credits
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all credits" ON public.user_credits
    FOR ALL USING (auth.role() = 'service_role');

-- Ensure authenticated users can insert their own credits
CREATE POLICY "Users can insert own credits" ON public.user_credits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE public.users IS 'Users table with fixed RLS policies to prevent infinite recursion';
COMMENT ON TABLE public.user_credits IS 'User credits table with proper RLS policies';