-- Fix user_credits table to support ON CONFLICT operations
-- This adds a unique constraint on user_id which is required for the admin_grant_credits function

-- Add unique constraint on user_id column
-- This ensures each user can only have one credits record and enables ON CONFLICT operations
ALTER TABLE public.user_credits
ADD CONSTRAINT user_credits_user_id_unique UNIQUE (user_id);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT user_credits_user_id_unique ON public.user_credits
IS 'Ensures each user has exactly one credits record, enables ON CONFLICT operations in admin functions';