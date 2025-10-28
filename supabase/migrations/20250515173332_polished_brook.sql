/*
  # Fix User Account Creation Flow

  1. Changes
    - Recreate handle_new_user function to properly initialize new accounts
    - Ensure proper user profile creation with username
    - Create user_tickets entry with correct initial values
    - Fix trigger connection to auth.users table
    
  2. Security
    - Maintain existing RLS policies
    - Use security definer for function execution
*/

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Create improved handle_new_user function with better error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  username_from_metadata text;
  final_username text;
  next_reset_date timestamptz;
BEGIN
  -- Log function execution
  RAISE LOG 'handle_new_user executing for user ID: %', new.id;

  -- Get username from metadata or generate one
  username_from_metadata := (new.raw_user_meta_data->>'username')::text;
  
  IF username_from_metadata IS NOT NULL AND length(username_from_metadata) > 0 THEN
    final_username := username_from_metadata;
  ELSE
    final_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;
  
  -- Create profile record
  BEGIN
    INSERT INTO profiles (
      id, 
      username, 
      created_at, 
      updated_at,
      plan_type,
      avatar_frame,
      banner
    ) VALUES (
      new.id,
      final_username,
      now(),
      now(),
      'free',
      '',
      ''
    );
    RAISE LOG 'Profile created for user ID: %', new.id;
  EXCEPTION WHEN unique_violation THEN
    -- If profile already exists (e.g. username taken), generate a unique one
    final_username := 'user_' || substr(new.id::text, 1, 12);
    
    INSERT INTO profiles (
      id, 
      username, 
      created_at, 
      updated_at,
      plan_type,
      avatar_frame,
      banner
    ) VALUES (
      new.id,
      final_username,
      now(),
      now(),
      'free',
      '',
      ''
    );
    RAISE LOG 'Profile created with alternate username for user ID: %', new.id;
  END;
  
  -- Calculate next Monday for ticket reset
  next_reset_date := now() + 
    CASE 
      WHEN EXTRACT(DOW FROM now()) = 1 THEN interval '7 days'
      WHEN EXTRACT(DOW FROM now()) = 0 THEN interval '1 day'
      ELSE interval '1 day' * (8 - EXTRACT(DOW FROM now())::integer)
    END;
  
  next_reset_date := date_trunc('day', next_reset_date);
  
  -- Create user_tickets record
  BEGIN
    INSERT INTO user_tickets (
      user_id,
      tickets_remaining,
      last_reset_at,
      next_reset,
      plan_type,
      created_at,
      updated_at
    ) VALUES (
      new.id,
      300,
      now(),
      next_reset_date,
      'free',
      now(),
      now()
    );
    RAISE LOG 'Tickets initialized for user ID: %', new.id;
  EXCEPTION WHEN unique_violation THEN
    -- If tickets already exist, update them
    UPDATE user_tickets
    SET 
      tickets_remaining = 300,
      last_reset_at = now(),
      next_reset = next_reset_date,
      updated_at = now()
    WHERE user_id = new.id;
    RAISE LOG 'Tickets updated for existing user ID: %', new.id;
  END;
  
  RETURN new;
EXCEPTION WHEN others THEN
  -- Comprehensive error logging
  RAISE LOG 'Error in handle_new_user: % (STATE: %, CONTEXT: %)', 
    SQLERRM, SQLSTATE, SQLCONTEXT;
  -- Still return new to avoid blocking auth flow
  RETURN new;
END;
$$;

-- Create trigger to execute function on new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Create or replace next_reset column in user_tickets if needed
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_tickets' AND column_name = 'next_reset'
  ) THEN
    ALTER TABLE user_tickets ADD COLUMN next_reset timestamptz;
    
    -- Initialize next_reset for existing records
    UPDATE user_tickets
    SET next_reset = last_reset_at + 
      CASE 
        WHEN EXTRACT(DOW FROM last_reset_at) = 1 THEN interval '7 days'
        ELSE interval '1 day' * (8 - EXTRACT(DOW FROM last_reset_at)::integer)
      END
    WHERE next_reset IS NULL;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_auth_users_id ON auth.users(id);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_tickets_user_id ON user_tickets(user_id);

-- Fix any existing users without profiles or tickets
INSERT INTO profiles (id, username, created_at, updated_at, plan_type)
SELECT 
  id, 
  COALESCE(
    (raw_user_meta_data->>'username')::text, 
    'user_' || substr(id::text, 1, 8)
  ),
  created_at,
  now(),
  'free'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- For any users without tickets, create default tickets
INSERT INTO user_tickets (
  user_id, 
  tickets_remaining, 
  last_reset_at, 
  next_reset,
  plan_type, 
  created_at, 
  updated_at
)
SELECT 
  id,
  300,
  now(),
  now() + 
    CASE 
      WHEN EXTRACT(DOW FROM now()) = 1 THEN interval '7 days'
      WHEN EXTRACT(DOW FROM now()) = 0 THEN interval '1 day'
      ELSE interval '1 day' * (8 - EXTRACT(DOW FROM now())::integer)
    END,
  'free',
  now(),
  now()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_tickets t WHERE t.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;