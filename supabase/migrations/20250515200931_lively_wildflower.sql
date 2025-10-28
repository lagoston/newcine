/*
  # Avatar Frames and Banners Fix

  1. Changes
    - Ensure avatar_frame and banner fields exist and use consistent defaults
    - Clean up any inconsistent or null values in these fields
    - Update premium users to have gold frames/banners if no selection made
    - Add proper indexes for performance

  2. Security
    - Maintain existing RLS policies
    - No changes to access control or permissions
*/

-- Check and fix banner and frame fields in profiles
DO $$ 
BEGIN
  -- First ensure the columns exist with the correct defaults
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_frame'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_frame text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'banner'
  ) THEN
    ALTER TABLE profiles ADD COLUMN banner text DEFAULT '';
  END IF;
END $$;

-- Fix empty columns or nulls
UPDATE profiles 
SET 
  avatar_frame = CASE 
    WHEN avatar_frame IS NULL THEN ''
    ELSE avatar_frame
  END,
  banner = CASE 
    WHEN banner IS NULL THEN '' 
    ELSE banner
  END;

-- Give premium users default gold frames and banners if they don't have any
UPDATE profiles
SET 
  avatar_frame = CASE 
    WHEN avatar_frame = '' OR avatar_frame IS NULL THEN 'gold'
    ELSE avatar_frame
  END,
  banner = CASE 
    WHEN banner = '' OR banner IS NULL THEN 'gold'
    ELSE banner
  END
WHERE plan_type = 'premium';

-- Fix any incorrect data in avatar_frame column (must be valid frame IDs)
UPDATE profiles
SET avatar_frame = ''
WHERE avatar_frame IS NOT NULL 
  AND avatar_frame NOT IN ('', 'default', 'gold', 'none')
  AND avatar_frame != 'gold'; -- preserve gold frames

-- Fix any incorrect data in banner column (must be valid banner IDs)
UPDATE profiles
SET banner = ''
WHERE banner IS NOT NULL
  AND banner NOT IN ('', 'default', 'gold', 'none')
  AND banner != 'gold'; -- preserve gold banners

-- Update public_profiles view to ensure it includes these fields
DROP VIEW IF EXISTS public_profiles;
CREATE VIEW public_profiles AS
SELECT 
  id,
  username,
  avatar_url,
  bio,
  created_at,
  updated_at,
  plan_type,
  avatar_frame,
  banner,
  active_tag
FROM profiles;

-- Grant access to public_profiles view
GRANT SELECT ON public_profiles TO PUBLIC;

-- Create or update indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_frame ON profiles(avatar_frame);
CREATE INDEX IF NOT EXISTS idx_profiles_banner ON profiles(banner);