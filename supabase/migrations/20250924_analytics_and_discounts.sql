-- Add analytics and discount system to the existing schema

-- Create enum for discount types
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');

-- Create enum for discount status
CREATE TYPE discount_status AS ENUM ('active', 'inactive', 'expired');

-- Add discount fields to purchases table
ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS discount_code TEXT,
ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0, -- Amount discounted in cents
ADD COLUMN IF NOT EXISTS original_amount INTEGER, -- Original amount before discount
ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT; -- Stripe coupon reference

-- Create discount codes table for admin management
CREATE TABLE IF NOT EXISTS public.discount_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, -- Admin-friendly name
    description TEXT,
    stripe_coupon_id TEXT UNIQUE NOT NULL, -- Reference to Stripe coupon
    discount_type discount_type NOT NULL,
    discount_value INTEGER NOT NULL, -- Percentage (0-100) or amount in cents
    status discount_status DEFAULT 'active' NOT NULL,
    usage_limit INTEGER, -- NULL = unlimited
    times_used INTEGER DEFAULT 0 NOT NULL,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id) NOT NULL, -- Admin who created it
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    metadata JSONB DEFAULT '{}' NOT NULL
);

-- Create admin actions log table
CREATE TABLE IF NOT EXISTS public.admin_actions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    action_type TEXT NOT NULL, -- 'grant_credits', 'revoke_credits', 'create_discount', etc.
    target_type TEXT NOT NULL, -- 'user', 'discount_code', 'system'
    target_id UUID, -- ID of the target (user_id, discount_id, etc.)
    details JSONB DEFAULT '{}' NOT NULL, -- Action-specific data
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create analytics views for admin dashboard

-- Daily revenue and credits analytics
CREATE OR REPLACE VIEW public.admin_daily_analytics AS
SELECT
    DATE(created_at) as date,
    COUNT(*) as total_purchases,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_purchases,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_purchases,
    SUM(amount) FILTER (WHERE status = 'completed') as total_revenue,
    SUM(credits_granted) FILTER (WHERE status = 'completed') as credits_sold,
    SUM(discount_amount) FILTER (WHERE status = 'completed') as total_discounts,
    COUNT(DISTINCT user_id) FILTER (WHERE status = 'completed') as unique_customers
FROM public.purchases
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Recent purchase activity for admin log
CREATE OR REPLACE VIEW public.admin_recent_purchases AS
SELECT
    p.id,
    p.created_at,
    p.completed_at,
    p.amount,
    p.original_amount,
    p.discount_amount,
    p.discount_code,
    p.credits_granted,
    p.status,
    p.purchase_type,
    u.email as user_email,
    u.name as user_name
FROM public.purchases p
JOIN public.users u ON p.user_id = u.id
ORDER BY p.created_at DESC
LIMIT 100;

-- System-wide statistics
CREATE OR REPLACE VIEW public.admin_system_stats AS
SELECT
    -- User statistics
    (SELECT COUNT(*) FROM public.users) as total_users,
    (SELECT COUNT(*) FROM public.users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_users_7d,
    (SELECT COUNT(*) FROM public.users WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_users_30d,

    -- Credit statistics
    (SELECT COALESCE(SUM(total_credits), 0) FROM public.user_credits) as total_credits_granted,
    (SELECT COALESCE(SUM(used_credits), 0) FROM public.user_credits) as total_credits_used,
    (SELECT COALESCE(SUM(total_credits - used_credits), 0) FROM public.user_credits) as total_credits_available,

    -- Revenue statistics
    (SELECT COALESCE(SUM(amount), 0) FROM public.purchases WHERE status = 'completed') as total_revenue_all_time,
    (SELECT COALESCE(SUM(amount), 0) FROM public.purchases WHERE status = 'completed' AND created_at >= CURRENT_DATE - INTERVAL '30 days') as revenue_30d,
    (SELECT COALESCE(SUM(amount), 0) FROM public.purchases WHERE status = 'completed' AND created_at >= CURRENT_DATE - INTERVAL '7 days') as revenue_7d,
    (SELECT COALESCE(SUM(amount), 0) FROM public.purchases WHERE status = 'completed' AND created_at >= CURRENT_DATE) as revenue_today,

    -- Purchase statistics
    (SELECT COUNT(*) FROM public.purchases WHERE status = 'completed') as total_purchases,
    (SELECT COUNT(*) FROM public.purchases WHERE status = 'completed' AND created_at >= CURRENT_DATE - INTERVAL '30 days') as purchases_30d,
    (SELECT COUNT(*) FROM public.purchases WHERE status = 'failed') as failed_purchases,

    -- Discount statistics
    (SELECT COUNT(*) FROM public.discount_codes WHERE status = 'active') as active_discount_codes,
    (SELECT COALESCE(SUM(discount_amount), 0) FROM public.purchases WHERE status = 'completed' AND discount_amount > 0) as total_discounts_given,

    -- Processing statistics
    (SELECT COUNT(*) FROM public.processing_jobs) as total_jobs,
    (SELECT COUNT(*) FROM public.processing_jobs WHERE status = 'completed') as completed_jobs,
    (SELECT COUNT(*) FROM public.edge_designs) as total_edge_designs;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON public.discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_status ON public.discount_codes(status);
CREATE INDEX IF NOT EXISTS idx_discount_codes_expires_at ON public.discount_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON public.admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON public.admin_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON public.purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_discount_code ON public.purchases(discount_code);

-- Enable RLS on new tables
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for discount_codes
CREATE POLICY "Admins can manage discount codes"
    ON public.discount_codes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- RLS Policies for admin_actions
CREATE POLICY "Admins can view admin actions"
    ON public.admin_actions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

CREATE POLICY "Admins can insert admin actions"
    ON public.admin_actions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
        AND admin_id = auth.uid()
    );

-- Grant permissions on views
GRANT SELECT ON public.admin_daily_analytics TO authenticated;
GRANT SELECT ON public.admin_recent_purchases TO authenticated;
GRANT SELECT ON public.admin_system_stats TO authenticated;

-- Function to create discount code and Stripe coupon
CREATE OR REPLACE FUNCTION public.create_discount_code(
    p_code TEXT,
    p_name TEXT,
    p_description TEXT,
    p_discount_type discount_type,
    p_discount_value INTEGER,
    p_usage_limit INTEGER,
    p_expires_at TIMESTAMPTZ,
    p_admin_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_discount_id UUID;
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = p_admin_id AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Insert discount code (Stripe coupon ID will be set later via API)
    INSERT INTO public.discount_codes (
        code, name, description, stripe_coupon_id,
        discount_type, discount_value, usage_limit,
        expires_at, created_by
    ) VALUES (
        p_code, p_name, p_description, '', -- stripe_coupon_id will be updated
        p_discount_type, p_discount_value, p_usage_limit,
        p_expires_at, p_admin_id
    ) RETURNING id INTO v_discount_id;

    -- Log the action
    INSERT INTO public.admin_actions (
        admin_id, action_type, target_type, target_id, details
    ) VALUES (
        p_admin_id, 'create_discount_code', 'discount_code', v_discount_id,
        jsonb_build_object(
            'code', p_code,
            'discount_type', p_discount_type,
            'discount_value', p_discount_value,
            'usage_limit', p_usage_limit
        )
    );

    RETURN v_discount_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_admin_id UUID,
    p_action_type TEXT,
    p_target_type TEXT,
    p_target_id UUID,
    p_details JSONB
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.admin_actions (
        admin_id, action_type, target_type, target_id, details
    ) VALUES (
        p_admin_id, p_action_type, p_target_type, p_target_id, p_details
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the grant_credits function to log actions
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

    -- Log the action
    PERFORM public.log_admin_action(
        p_admin_id, 'grant_credits', 'user', p_user_id,
        jsonb_build_object('credits_granted', p_credits)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the revoke_credits function to log actions
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

    -- Log the action
    PERFORM public.log_admin_action(
        p_admin_id, 'revoke_credits', 'user', p_user_id,
        jsonb_build_object('credits_revoked', p_credits)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;