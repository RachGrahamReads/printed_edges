-- Fix the admin user overview to work with auth.users directly
-- since public.users might not be populated

DROP VIEW IF EXISTS public.admin_user_overview;

CREATE OR REPLACE VIEW public.admin_user_overview AS
SELECT
    au.id,
    au.email,
    au.raw_user_meta_data->>'first_name' as name,
    CASE WHEN au.email = ANY(string_to_array(current_setting('app.admin_emails', true), ','))
         THEN true
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
        SELECT SUM(p.amount)
        FROM public.purchases p
        WHERE p.user_id = au.id AND p.status = 'completed'
    ) as total_spent
FROM auth.users au
LEFT JOIN public.user_credits uc ON au.id = uc.user_id
ORDER BY au.created_at DESC;

-- Grant permissions for the view
GRANT SELECT ON public.admin_user_overview TO authenticated;

-- Set the admin emails setting so the view can check admin status
SELECT set_config('app.admin_emails', 'rachgrahamreads@gmail.com', false);