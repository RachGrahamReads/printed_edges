-- Add admin system to the existing schema
-- This migration depends on the payment system migration

-- Add is_admin field to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false NOT NULL;

-- Create index for admin queries
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin);

-- Create admin-specific RLS policies for full access to all tables
-- Only create policies if the tables exist (they should from payment system migration)

-- Admin policies for user_credits
CREATE POLICY "Admins can view all user credits"
    ON public.user_credits FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

CREATE POLICY "Admins can manage all user credits"
    ON public.user_credits FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Admin policies for purchases
CREATE POLICY "Admins can view all purchases"
    ON public.purchases FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Admin policies for edge_designs
CREATE POLICY "Admins can view all edge designs"
    ON public.edge_designs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Admin policies for processing_jobs
CREATE POLICY "Admins can view all processing jobs"
    ON public.processing_jobs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Admin policies for users table
CREATE POLICY "Admins can view all users"
    ON public.users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

CREATE POLICY "Admins can update user admin status"
    ON public.users FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Function to grant credits with admin override
CREATE OR REPLACE FUNCTION public.admin_grant_credits(
    p_user_id UUID,
    p_credits INTEGER,
    p_admin_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = p_admin_id AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Update or insert user credits
    INSERT INTO public.user_credits (user_id, total_credits, used_credits)
    VALUES (p_user_id, p_credits, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET total_credits = public.user_credits.total_credits + p_credits,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke credits with admin override
CREATE OR REPLACE FUNCTION public.admin_revoke_credits(
    p_user_id UUID,
    p_credits INTEGER,
    p_admin_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = p_admin_id AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Update user credits (ensure they don't go negative)
    UPDATE public.user_credits
    SET total_credits = GREATEST(0, total_credits - p_credits),
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set user admin status (only callable by existing admins)
CREATE OR REPLACE FUNCTION public.set_user_admin_status(
    p_user_id UUID,
    p_is_admin BOOLEAN,
    p_admin_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = p_admin_id AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Update user admin status
    UPDATE public.users
    SET is_admin = p_is_admin
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for admin dashboard that combines user and credit information
CREATE OR REPLACE VIEW public.admin_user_overview AS
SELECT
    u.id,
    u.email,
    u.name,
    u.is_admin,
    u.created_at,
    u.last_login,
    u.stripe_customer_id,
    COALESCE(uc.total_credits, 0) as total_credits,
    COALESCE(uc.used_credits, 0) as used_credits,
    COALESCE(uc.total_credits - uc.used_credits, 0) as available_credits,
    (
        SELECT COUNT(*)
        FROM public.purchases p
        WHERE p.user_id = u.id AND p.status = 'completed'
    ) as completed_purchases,
    (
        SELECT SUM(p.amount)
        FROM public.purchases p
        WHERE p.user_id = u.id AND p.status = 'completed'
    ) as total_spent,
    (
        SELECT COUNT(*)
        FROM public.processing_jobs pj
        WHERE pj.user_id = u.id
    ) as total_jobs
FROM public.users u
LEFT JOIN public.user_credits uc ON u.id = uc.user_id
ORDER BY u.created_at DESC;

-- Grant permissions for the view
GRANT SELECT ON public.admin_user_overview TO authenticated;

-- Note: Views inherit RLS from underlying tables, so the admin policies
-- on the users and user_credits tables will control access to this view