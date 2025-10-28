/*
  # Add plan_type to profiles table

  1. Changes
    - Add plan_type column to profiles table
    - Create trigger to keep plan_type in sync with user_tickets
    - Update public_profiles view to use profiles.plan_type
    - Backfill existing plan_type data from user_tickets

  2. Security
    - Maintain existing RLS policies
    - Keep view permissions intact
*/

-- Add plan_type column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'free';

-- Create function to sync plan_type
CREATE OR REPLACE FUNCTION sync_profile_plan_type()
RETURNS trigger AS $$
BEGIN
  UPDATE profiles
  SET plan_type = NEW.plan_type
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to keep plan_type in sync
DROP TRIGGER IF EXISTS sync_profile_plan_type ON user_tickets;
CREATE TRIGGER sync_profile_plan_type
  AFTER UPDATE OF plan_type ON user_tickets
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_plan_type();

-- Backfill existing plan_type data
UPDATE profiles p
SET plan_type = COALESCE(ut.plan_type, 'free')
FROM user_tickets ut
WHERE p.id = ut.user_id;

-- Drop existing view
DROP VIEW IF EXISTS public_profiles;

-- Recreate view using profiles.plan_type
CREATE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.active_tag,
  p.avatar_frame,
  p.banner,
  p.plan_type
FROM profiles p;

-- Grant access to authenticated users
GRANT SELECT ON public_profiles TO authenticated;