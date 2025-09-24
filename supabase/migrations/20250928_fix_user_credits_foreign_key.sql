-- Fix user_credits foreign key to reference auth.users instead of public.users
-- since users are created in auth.users, not public.users

-- First, drop the existing foreign key constraint
ALTER TABLE public.user_credits
DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;

-- Add new foreign key constraint referencing auth.users
ALTER TABLE public.user_credits
ADD CONSTRAINT user_credits_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Also fix any other tables that might have similar issues
-- Check if edge_designs has the same problem
ALTER TABLE public.edge_designs
DROP CONSTRAINT IF EXISTS edge_designs_user_id_fkey;

ALTER TABLE public.edge_designs
ADD CONSTRAINT edge_designs_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Check if purchases has the same problem
ALTER TABLE public.purchases
DROP CONSTRAINT IF EXISTS purchases_user_id_fkey;

ALTER TABLE public.purchases
ADD CONSTRAINT purchases_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Check if processing_jobs has the same problem
ALTER TABLE public.processing_jobs
DROP CONSTRAINT IF EXISTS processing_jobs_user_id_fkey;

ALTER TABLE public.processing_jobs
ADD CONSTRAINT processing_jobs_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;