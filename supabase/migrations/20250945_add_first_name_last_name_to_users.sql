-- Add first_name and last_name columns to users table
ALTER TABLE public.users
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT;

-- Update existing users with names split from the 'name' field if it exists
-- This will handle cases where name is "First Last" format
UPDATE public.users
SET
  first_name = CASE
    WHEN name IS NOT NULL AND position(' ' IN name) > 0
    THEN split_part(name, ' ', 1)
    ELSE name
  END,
  last_name = CASE
    WHEN name IS NOT NULL AND position(' ' IN name) > 0
    THEN substring(name FROM position(' ' IN name) + 1)
    ELSE NULL
  END
WHERE name IS NOT NULL;

-- Comment explaining the migration
COMMENT ON COLUMN public.users.first_name IS 'User first name from sign up form';
COMMENT ON COLUMN public.users.last_name IS 'User last name (surname) from sign up form';