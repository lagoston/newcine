/*
  # Add Matrix Theme Assets

  1. Changes
    - Add support for Matrix-themed avatar frames and banners
    - Add indexes for avatar_frame and banner columns for better performance
    - Clean up any NULL or invalid values in these fields
    - Update display logic for premium customization options

  2. Security
    - No changes to RLS policies
    - Maintain existing access controls
*/

-- Ensure avatar_frame and banner columns exist
DO $$ 
BEGIN
  -- Check if avatar_frame column exists
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_frame'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_frame text DEFAULT '';
  END IF;

  -- Check if banner column exists
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'banner'
  ) THEN
    ALTER TABLE profiles ADD COLUMN banner text DEFAULT '';
  END IF;
END $$;

-- Fix empty or null values
UPDATE profiles 
SET 
  avatar_frame = CASE 
    WHEN avatar_frame IS NULL OR avatar_frame = 'none' THEN ''
    ELSE avatar_frame
  END,
  banner = CASE 
    WHEN banner IS NULL OR banner = 'none' THEN ''
    ELSE banner
  END
WHERE 
  avatar_frame IS NULL OR avatar_frame = 'none'
  OR banner IS NULL OR banner = 'none';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_frame ON profiles(avatar_frame);
CREATE INDEX IF NOT EXISTS idx_profiles_banner ON profiles(banner);

-- Update public_profiles view to include updated fields
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

-- Grant access to public_profiles
GRANT SELECT ON public_profiles TO PUBLIC;