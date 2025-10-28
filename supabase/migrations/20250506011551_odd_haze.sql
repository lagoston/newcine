/*
  # Fix User Signup System

  1. Changes
    - Make profiles.plan_type nullable with default 'free'
    - Add user_tickets defaults and constraints
    - Add custom profile/tickets initialization trigger
    - Add safety guards to prevent update loops
    
  2. Security
    - Preserve Supabase core functionality
    - Keep existing RLS policies
    - Maintain data consistency
*/

-- Make plan_type nullable and set default in profiles
ALTER TABLE profiles 
  ALTER COLUMN plan_type DROP NOT NULL,
  ALTER COLUMN plan_type SET DEFAULT 'free';

-- Ensure proper defaults for user_tickets
ALTER TABLE user_tickets
  ALTER COLUMN tickets_remaining SET DEFAULT 300,
  ALTER COLUMN plan_type SET DEFAULT 'free';

-- Add next_reset column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_tickets' 
    AND column_name = 'next_reset'
  ) THEN
    ALTER TABLE user_tickets 
    ADD COLUMN next_reset timestamptz;
  END IF;
END $$;

-- Create function to initialize profile and tickets
CREATE OR REPLACE FUNCTION public.init_profile_and_tickets()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
  -- Skip if profile already exists (idempotent)
  INSERT INTO profiles (
    id, 
    username, 
    created_at, 
    plan_type
  )
  VALUES (
    NEW.id, 
    split_part(NEW.email, '@', 1), 
    now(), 
    'free'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Initialize tickets
  INSERT INTO user_tickets (
    user_id, 
    tickets_remaining, 
    next_reset, 
    plan_type
  )
  VALUES (
    NEW.id, 
    300, 
    now() + interval '7 days', 
    'free'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create custom initialization trigger
DROP TRIGGER IF EXISTS init_profile_and_tickets ON auth.users;
CREATE TRIGGER init_profile_and_tickets
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.init_profile_and_tickets();

-- Add safety guard to subscription sync functions
CREATE OR REPLACE FUNCTION sync_subscription_status()
RETURNS trigger AS $$
BEGIN
  -- Prevent update loops
  IF TG_TABLE_NAME = 'user_tickets' THEN
    IF NEW.plan_type = OLD.plan_type THEN
      RETURN NEW;
    END IF;
    
    UPDATE profiles
    SET plan_type = NEW.plan_type
    WHERE id = NEW.user_id;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.plan_type = OLD.plan_type THEN
      RETURN NEW;
    END IF;
    
    UPDATE user_tickets
    SET plan_type = NEW.plan_type
    WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_tickets_plan_type 
ON user_tickets(plan_type);

CREATE INDEX IF NOT EXISTS idx_profiles_plan_type 
ON profiles(plan_type);