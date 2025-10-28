-- First, drop existing triggers that cause circular updates
DROP TRIGGER IF EXISTS sync_profile_plan_type ON user_tickets;
DROP TRIGGER IF EXISTS sync_tickets_plan_type ON profiles;
DROP TRIGGER IF EXISTS upgrade_tickets_to_premium ON user_tickets;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop existing function after its dependent trigger
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Make plan_type nullable and set default
ALTER TABLE profiles 
ALTER COLUMN plan_type DROP NOT NULL,
ALTER COLUMN plan_type SET DEFAULT 'free';

-- Create new function with proper initialization
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  username_from_metadata text;
  final_username text;
  next_reset timestamptz;
BEGIN
  -- Calculate next reset (next Monday)
  next_reset := date_trunc('day', now()) + 
    CASE 
      WHEN EXTRACT(DOW FROM now()) = 1 THEN interval '7 days'
      WHEN EXTRACT(DOW FROM now()) = 0 THEN interval '1 day'
      ELSE interval '1 day' * (8 - EXTRACT(DOW FROM now())::integer)
    END;

  -- Get username from metadata or generate one
  username_from_metadata := (new.raw_user_meta_data->>'username')::text;
  
  IF username_from_metadata IS NOT NULL AND length(username_from_metadata) > 0 THEN
    final_username := username_from_metadata;
  ELSE
    final_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;

  -- Create profile with default free plan
  INSERT INTO public.profiles (
    id,
    username,
    plan_type
  ) VALUES (
    new.id,
    final_username,
    'free'
  );

  -- Create user_tickets entry
  INSERT INTO public.user_tickets (
    user_id,
    tickets_remaining,
    plan_type,
    last_reset_at,
    next_reset
  ) VALUES (
    new.id,
    300,
    'free',
    now(),
    next_reset
  );
  
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Log error details
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN null;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type 
ON profiles(plan_type) 
WHERE plan_type IS NOT NULL;