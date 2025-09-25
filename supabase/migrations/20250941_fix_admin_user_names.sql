-- Fix admin user overview to show proper names from public.users table
-- This ensures admin panel shows first names instead of raw metadata

DROP VIEW IF EXISTS public.admin_user_overview;

CREATE OR REPLACE VIEW public.admin_user_overview AS
SELECT
    au.id,
    au.email,
    -- Get name from public.users first, then fallback to metadata, then email prefix
    COALESCE(
        pu.first_name,
        au.raw_user_meta_data->>'first_name',
        au.raw_user_meta_data->>'firstName',
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

-- Grant permissions
GRANT SELECT ON public.admin_user_overview TO service_role;
GRANT SELECT ON public.admin_user_overview TO authenticated;

-- Add comment
COMMENT ON VIEW public.admin_user_overview IS 'Admin view showing user details with proper name fallback logic';