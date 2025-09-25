-- Simple seed data for local development

-- Grant credits to admin users (if they exist)
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Check if admin user exists and grant credits
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'rachgrahamreads@gmail.com'
  LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    -- Create or update user_credits record
    INSERT INTO public.user_credits (user_id, total_credits, used_credits, created_at, updated_at)
    VALUES (admin_user_id, 50, 0, now(), now())
    ON CONFLICT (user_id)
    DO UPDATE SET
      total_credits = user_credits.total_credits + 50,
      updated_at = now();

    RAISE NOTICE 'Granted 50 credits to admin user: %', admin_user_id;
  END IF;
END $$;

-- Output test credentials message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'TO CREATE TEST ACCOUNTS:';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Go to: http://localhost:3005/auth/signup';
  RAISE NOTICE '';
  RAISE NOTICE 'Create admin account:';
  RAISE NOTICE '  Email: rachgrahamreads@gmail.com';
  RAISE NOTICE '  Password: testpassword123';
  RAISE NOTICE '';
  RAISE NOTICE 'Create regular user:';
  RAISE NOTICE '  Email: testuser@example.com';
  RAISE NOTICE '  Password: testpassword123';
  RAISE NOTICE '';
  RAISE NOTICE 'Admin email is configured in .env.local';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
END $$;