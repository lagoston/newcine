/*
  # Add Avatar Frame and Banner columns to profiles table

  1. Changes
    - Add avatar_frame column with default 'none'
    - Add banner_slug column with default 'none'
    - Update public_profiles view to include new columns
*/

-- Add columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'avatar_frame'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_frame text DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'banner_slug'
  ) THEN
    ALTER TABLE profiles ADD COLUMN banner_slug text DEFAULT 'none';
  END IF;
END $$;

-- Drop and recreate public_profiles view to include new columns
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
  p.banner_slug
FROM profiles p
LEFT JOIN user_tickets ut ON p.id = ut.user_id;