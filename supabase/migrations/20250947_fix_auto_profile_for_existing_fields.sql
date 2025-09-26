-- Update auto-profile creation trigger to populate first_name and surname columns that already exist
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
  first_name TEXT;
  last_name TEXT;
BEGIN
  -- Extract names from user metadata
  first_name := COALESCE(NEW.raw_user_meta_data->>'firstName', NEW.raw_user_meta_data->>'first_name', '');
  last_name := COALESCE(NEW.raw_user_meta_data->>'lastName', NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'surname', '');

  -- Combine first and last name for the 'name' field, fallback to full_name or name from metadata
  user_name := TRIM(CONCAT(first_name, ' ', last_name));
  IF user_name = '' OR user_name IS NULL THEN
    user_name := COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'fullName',
      ''
    );
  END IF;

  -- Create a profile in public.users for the new auth user with separate name fields
  INSERT INTO public.users (id, email, first_name, surname, name, created_at, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(first_name, ''), -- Use NULL if empty string
    NULLIF(last_name, ''),  -- Use NULL if empty string (maps to surname field)
    NULLIF(user_name, ''),  -- Use NULL if empty string
    NEW.created_at,
    false -- New users are not admin by default
  );

  -- Create initial credits record for the user
  INSERT INTO public.user_credits (user_id, total_credits, used_credits, created_at)
  VALUES (NEW.id, 0, 0, NEW.created_at); -- New users start with 0 credits

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

-- Update the trigger (it should already exist, but this ensures it's using the updated function)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Comment explaining the update
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates user profile with separate first_name and surname fields when a new user signs up through Supabase Auth';