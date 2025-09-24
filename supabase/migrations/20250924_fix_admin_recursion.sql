-- Fix infinite recursion in admin policies by using service role approach
-- This migration resolves the circular dependency in RLS policies

-- Drop the problematic RLS policies that cause infinite recursion
DROP POLICY IF EXISTS "Admins can manage discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Admins can view admin actions" ON public.admin_actions;
DROP POLICY IF EXISTS "Admins can insert admin actions" ON public.admin_actions;

-- Create service role policies instead of user-based checks
-- These policies bypass the RLS recursion issue

-- Service role can manage all discount codes
CREATE POLICY "Service role can manage discount codes"
    ON public.discount_codes FOR ALL
    USING (auth.role() = 'service_role');

-- Service role can manage admin actions
CREATE POLICY "Service role can manage admin actions"
    ON public.admin_actions FOR ALL
    USING (auth.role() = 'service_role');

-- Grant service role permissions
GRANT ALL ON public.discount_codes TO service_role;
GRANT ALL ON public.admin_actions TO service_role;

-- Update the create_discount_code function to use service role context
-- Instead of checking is_admin in the function, we'll do the admin check in the API
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
    -- Insert discount code (admin check is done in API layer)
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

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION public.create_discount_code(TEXT, TEXT, TEXT, discount_type, INTEGER, INTEGER, TIMESTAMPTZ, UUID) TO service_role;

-- Grant permissions for analytics views
GRANT SELECT ON public.admin_daily_analytics TO service_role;
GRANT SELECT ON public.admin_recent_purchases TO service_role;
GRANT SELECT ON public.admin_system_stats TO service_role;