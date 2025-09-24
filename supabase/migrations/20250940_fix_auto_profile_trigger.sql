-- Fix auto-profile creation trigger that was missing after database reset
-- This ensures new user signups automatically get profiles in public.users

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
  first_name TEXT;
  last_name TEXT;
BEGIN
  -- Extract names from user metadata
  first_name := COALESCE(NEW.raw_user_meta_data->>'firstName', NEW.raw_user_meta_data->>'first_name', '');
  last_name := COALESCE(NEW.raw_user_meta_data->>'lastName', NEW.raw_user_meta_data->>'last_name', '');

  -- Combine first and last name, fallback to full_name or name from metadata
  user_name := TRIM(CONCAT(first_name, ' ', last_name));
  IF user_name = '' OR user_name IS NULL THEN
    user_name := COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'fullName',
      ''
    );
  END IF;

  -- Create a profile in public.users for the new auth user
  INSERT INTO public.users (id, email, name, created_at, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    user_name,
    NEW.created_at,
    false -- New users are not admin by default
  );

  -- Create initial credits record for the user
  INSERT INTO public.user_credits (user_id, total_credits, used_credits, created_at)
  VALUES (NEW.id, 5, 0, NEW.created_at); -- Give new users 5 free credits

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If profile already exists (shouldn't happen, but handle gracefully)
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't prevent user signup
    RAISE WARNING 'Failed to create user profile for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that runs after a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

-- Add comment for documentation
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates user profile and credits when a new user signs up through Supabase Auth';