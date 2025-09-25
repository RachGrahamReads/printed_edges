-- Create admin_grant_credits function for admin panel credit management
-- This function allows admins to grant credits to users

-- Ensure uuid-ossp extension is available (though it should be by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.admin_grant_credits(
    p_admin_id UUID,
    p_user_id UUID,
    p_credits INTEGER
)
RETURNS JSON AS $$
DECLARE
    v_admin_is_admin BOOLEAN DEFAULT FALSE;
    v_user_exists BOOLEAN DEFAULT FALSE;
    v_old_credits INTEGER DEFAULT 0;
    v_new_credits INTEGER DEFAULT 0;
BEGIN
    -- Verify the admin user has admin privileges
    SELECT is_admin INTO v_admin_is_admin
    FROM public.users
    WHERE id = p_admin_id;

    -- Also check if admin email matches hardcoded admin
    IF NOT v_admin_is_admin THEN
        SELECT (email = 'rachgrahamreads@gmail.com') INTO v_admin_is_admin
        FROM auth.users
        WHERE id = p_admin_id;
    END IF;

    -- Raise error if not admin
    IF NOT v_admin_is_admin THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Check if target user exists
    SELECT EXISTS(
        SELECT 1 FROM auth.users WHERE id = p_user_id
    ) INTO v_user_exists;

    IF NOT v_user_exists THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    -- Validate credits amount
    IF p_credits < 0 THEN
        RAISE EXCEPTION 'Credits amount must be positive: %', p_credits;
    END IF;

    -- Get current credits
    SELECT COALESCE(total_credits, 0) INTO v_old_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;

    -- Grant credits (insert or update)
    INSERT INTO public.user_credits (user_id, total_credits, used_credits, created_at, updated_at)
    VALUES (p_user_id, p_credits, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET
        total_credits = user_credits.total_credits + p_credits,
        updated_at = NOW();

    -- Get new total credits
    SELECT total_credits INTO v_new_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;

    -- Log the action for audit trail
    RAISE NOTICE 'Admin % granted % credits to user %. Old total: %, New total: %',
                 p_admin_id, p_credits, p_user_id, v_old_credits, v_new_credits;

    -- Return success response with details
    RETURN json_build_object(
        'success', true,
        'message', 'Credits granted successfully',
        'user_id', p_user_id,
        'credits_granted', p_credits,
        'old_total', v_old_credits,
        'new_total', v_new_credits,
        'admin_id', p_admin_id
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Log error and re-raise
        RAISE NOTICE 'Error granting credits: %', SQLERRM;
        RAISE EXCEPTION 'Failed to grant credits: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(UUID, UUID, INTEGER) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.admin_grant_credits(UUID, UUID, INTEGER) IS 'Admin function to grant credits to users with proper authorization checks';