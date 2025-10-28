/*
  # Fix Premium Crown Visibility

  1. Changes
    - Ensure plan_type column is consistently accessible across all views
    - Fix relationships between profiles and follows tables
    - Update public_profiles view to properly expose plan_type
    - Add indexes for better query performance

  2. Security
    - Maintain existing RLS policies
    - Ensure proper visibility of premium status
*/

-- Ensure plan_type exists and has correct default in profiles
DO $$ 
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    -- Check if plan_type column exists
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'plan_type'
    ) THEN
      ALTER TABLE profiles ADD COLUMN plan_type text DEFAULT 'free';
    END IF;
  END IF;
END $$;

-- Fix public_profiles view to properly expose plan_type
DROP VIEW IF EXISTS public_profiles;

CREATE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.updated_at,
  p.plan_type,
  p.avatar_frame,
  p.banner,
  p.active_tag
FROM profiles p;

-- Grant access to public_profiles
GRANT SELECT ON public_profiles TO authenticated;
GRANT SELECT ON public_profiles TO public;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON profiles(plan_type);
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

-- Ensure proper foreign keys in follows table
DO $$
BEGIN
  -- Check if follows table has proper foreign keys
  IF NOT EXISTS (
    SELECT FROM pg_constraint 
    WHERE conname = 'follows_follower_id_fkey' 
    AND conrelid = 'public.follows'::regclass
  ) THEN
    ALTER TABLE follows
    ADD CONSTRAINT follows_follower_id_fkey
    FOREIGN KEY (follower_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_constraint 
    WHERE conname = 'follows_following_id_fkey' 
    AND conrelid = 'public.follows'::regclass
  ) THEN
    ALTER TABLE follows
    ADD CONSTRAINT follows_following_id_fkey
    FOREIGN KEY (following_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add SELECT policy for public access to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Public profiles are viewable by everyone'
  ) THEN
    CREATE POLICY "Public profiles are viewable by everyone"
      ON profiles
      FOR SELECT
      USING (true);
  END IF;
END $$;