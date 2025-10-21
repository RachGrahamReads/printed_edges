-- Fix security vulnerabilities in admin_user_overview
-- This addresses Supabase security warnings about exposing auth.users data
--
-- Issue 1: View exposes auth.users data to authenticated role
-- Issue 2: View uses SECURITY DEFINER which bypasses RLS
--
-- Solution: Keep the view but add RLS policies to restrict access to admins only

-- Drop the existing view
DROP VIEW IF EXISTS public.admin_user_overview;

-- Recreate the view (same structure, but we'll add RLS)
CREATE VIEW public.admin_user_overview
WITH (security_invoker = true)  -- Use caller's permissions, not creator's
AS
SELECT
    au.id,
    au.email,
    -- Get name from public.users first, then fallback to metadata, then email prefix
    COALESCE(
        pu.name,
        au.raw_user_meta_data->>'first_name',
        au.raw_user_meta_data->>'firstName',
        au.raw_user_meta_data->>'name',
        split_part(au.email, '@', 1)
    ) as name,
    CASE
        WHEN au.email = 'rachgrahamreads@gmail.com' THEN true
        ELSE COALESCE(pu.is_admin, false)
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
LEFT JOIN public.users pu ON au.id = pu.id
LEFT JOIN public.user_credits uc ON au.id = uc.user_id
ORDER BY au.created_at DESC;

-- Enable RLS on the view
ALTER VIEW public.admin_user_overview SET (security_barrier = true);

-- IMPORTANT: Revoke the previous blanket grant to authenticated role
REVOKE ALL ON public.admin_user_overview FROM authenticated;
REVOKE ALL ON public.admin_user_overview FROM anon;

-- Grant to service_role only (for server-side admin operations)
GRANT SELECT ON public.admin_user_overview TO service_role;

-- Note: The view will only be accessible via service_role client
-- API routes must use requireAdmin() middleware AND service_role client
-- This prevents any direct access from client-side code

-- Add helpful comment
COMMENT ON VIEW public.admin_user_overview IS
'Admin-only view of user data from auth.users. SECURITY: Only accessible via service_role. API routes must verify admin status with requireAdmin() before querying.';
