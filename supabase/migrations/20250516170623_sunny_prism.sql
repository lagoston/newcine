/*
  # Fix sqlcontext column reference error

  1. Changes
     - Updates the handle_new_user function to remove or fix references to the non-existent "sqlcontext" column
     - This function is triggered during user creation and is causing signup failures

  This migration addresses the error: "ERROR: column 'sqlcontext' does not exist (SQLSTATE 42703)"
  that occurs during user registration.
*/

-- Drop and recreate the handle_new_user function to fix the sqlcontext reference
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert a row into public.profiles
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'username', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Initialize user tickets
  INSERT INTO public.user_tickets (
    user_id,
    plan_type,
    tickets_remaining,
    next_reset
  ) VALUES (
    NEW.id,
    'free',
    300,
    (now() + interval '30 days')
  );
  
  RETURN NEW;
END;
$$;

-- Ensure the trigger is properly set up on auth.users table
-- Note: We don't need to recreate the trigger if it already exists correctly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$$;