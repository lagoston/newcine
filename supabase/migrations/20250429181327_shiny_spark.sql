/*
  # Add banner column to profiles table

  1. Changes
    - Add `banner` column to `profiles` table with default empty string
    - Update public_profiles view to include banner column
    
  2. Notes
    - Using DO block with IF NOT EXISTS check for safety
    - Default empty string ensures existing profiles get a valid state
*/

-- Add banner column to profiles table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'banner'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN banner text DEFAULT '';
  END IF;
END $$;

-- Drop and recreate view with banner column
DROP VIEW IF EXISTS public_profiles CASCADE;

CREATE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.active_tag,
  ut.plan_type,
  p.avatar_frame,
  p.banner
FROM profiles p
LEFT JOIN user_tickets ut ON p.id = ut.user_id;

-- Grant access to authenticated users
GRANT SELECT ON public_profiles TO authenticated;