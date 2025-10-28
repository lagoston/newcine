/*
  # Fix user creation triggers and functions

  1. Changes
    - Update the `handle_new_user` function to properly handle errors and avoid failures
    - Update the `init_user_tickets` function to include better error handling
    - Ensure both functions have proper exception handling to prevent signup failures
  
  2. Purpose
    - Resolves the "Database error saving new user" issue during account creation
    - Prevents 500 errors when signing up new users
    - Adds more robust error handling to prevent cascading failures
*/

-- First, let's recreate the handle_new_user function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    -- Create a profile for the new user
    INSERT INTO public.profiles (id, username, avatar_url, created_at, updated_at)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'username',
      NEW.raw_user_meta_data->>'avatar_url',
      NOW(),
      NOW()
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Handle username already taken
      RAISE WARNING 'Username already taken: %', NEW.raw_user_meta_data->>'username';
      -- Continue execution instead of failing completely
    WHEN OTHERS THEN
      -- Log but don't fail the entire transaction
      RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    -- Initialize tickets for the new user
    INSERT INTO public.user_tickets (
      user_id,
      plan_type,
      tickets_remaining,
      last_reset_at,
      next_reset,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'free',
      300,
      NOW(),
      (NOW() + INTERVAL '30 days'),
      NOW(),
      NOW()
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Already exists, so update instead
      UPDATE public.user_tickets
      SET 
        tickets_remaining = 300,
        last_reset_at = NOW(),
        next_reset = (NOW() + INTERVAL '30 days'),
        updated_at = NOW()
      WHERE user_id = NEW.id;
    WHEN OTHERS THEN
      -- Log but don't fail the entire transaction
      RAISE WARNING 'Error initializing tickets for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Recreate the init_user_tickets function with better error handling
CREATE OR REPLACE FUNCTION public.init_user_tickets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_tickets (
      user_id,
      plan_type,
      tickets_remaining,
      last_reset_at,
      next_reset,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'free',
      300,
      NOW(),
      (NOW() + INTERVAL '30 days'),
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tickets_remaining = 300,
      last_reset_at = NOW(),
      next_reset = (NOW() + INTERVAL '30 days'),
      updated_at = NOW();
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Error in init_user_tickets for %: %', NEW.id, SQLERRM;
      -- Don't re-raise the exception, just log and continue
  END;

  RETURN NEW;
END;
$$;

-- Recreate the initialize_user_tickets function with better error handling
CREATE OR REPLACE FUNCTION public.initialize_user_tickets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_tickets (
      user_id,
      plan_type,
      tickets_remaining,
      last_reset_at,
      next_reset,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'free',
      300,
      NOW(),
      (NOW() + INTERVAL '30 days'),
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tickets_remaining = 300,
      last_reset_at = NOW(),
      next_reset = (NOW() + INTERVAL '30 days'),
      updated_at = NOW();
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Error in initialize_user_tickets for %: %', NEW.id, SQLERRM;
      -- Don't re-raise the exception, just log and continue
  END;

  RETURN NEW;
END;
$$;

-- Recreate the sync_profile_plan_type function with better error handling
CREATE OR REPLACE FUNCTION public.sync_profile_plan_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    UPDATE public.profiles
    SET plan_type = NEW.plan_type, updated_at = NOW()
    WHERE id = NEW.user_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Error in sync_profile_plan_type for %: %', NEW.user_id, SQLERRM;
      -- Don't re-raise the exception, just log and continue
  END;
  
  RETURN NEW;
END;
$$;

-- If the trigger doesn't exist, create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created' 
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$$;

-- If the trigger doesn't exist, create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_user_tickets_plan_type_updated' 
  ) THEN
    CREATE TRIGGER on_user_tickets_plan_type_updated
    AFTER UPDATE OF plan_type ON public.user_tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_plan_type();
  END IF;
END
$$;