/*
  # Fix profile and follows table relationships

  1. Changes
    - Ensure proper foreign key relationships between profiles and follows tables
    - Fix issues with profiles table and public_profiles view
    - Add proper indexes for better query performance
    - Ensure correct RLS policies are in place
*/

-- Make sure the profiles table has all necessary columns with correct defaults
DO $$ 
BEGIN
  -- Check if profiles table exists first
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    -- Make sure plan_type exists and has correct default
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'plan_type'
    ) THEN
      ALTER TABLE profiles ADD COLUMN plan_type text DEFAULT 'free';
    END IF;
    
    -- Make sure avatar_frame exists and has correct default
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_frame'
    ) THEN
      ALTER TABLE profiles ADD COLUMN avatar_frame text DEFAULT '';
    END IF;
    
    -- Make sure banner exists and has correct default
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'banner'
    ) THEN
      ALTER TABLE profiles ADD COLUMN banner text DEFAULT '';
    END IF;
    
    -- Make sure active_tag exists
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active_tag'
    ) THEN
      ALTER TABLE profiles ADD COLUMN active_tag jsonb DEFAULT NULL;
    END IF;
  END IF;
END $$;

-- Re-create the follows table with correct foreign keys
DO $$
BEGIN
  -- Check if follows table exists
  IF EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'follows'
  ) THEN
    -- If it has wrong or missing constraints, drop and recreate it
    IF NOT EXISTS (
      SELECT FROM pg_constraint
      WHERE conname = 'follows_follower_id_fkey'
      AND conrelid = 'public.follows'::regclass
      AND confrelid = 'public.profiles'::regclass
    ) OR NOT EXISTS (
      SELECT FROM pg_constraint
      WHERE conname = 'follows_following_id_fkey'
      AND conrelid = 'public.follows'::regclass
      AND confrelid = 'public.profiles'::regclass
    ) THEN
      -- Save existing follows data
      CREATE TEMP TABLE follows_backup AS SELECT * FROM follows;
      
      -- Drop follows table
      DROP TABLE follows;
      
      -- Recreate follows table with proper constraints
      CREATE TABLE follows (
        follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
        following_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now(),
        PRIMARY KEY (follower_id, following_id),
        CHECK (follower_id <> following_id)
      );
      
      -- Restore data
      INSERT INTO follows
      SELECT * FROM follows_backup
      ON CONFLICT DO NOTHING;
      
      -- Drop backup table
      DROP TABLE follows_backup;
    END IF;
  ELSE
    -- Create follows table if it doesn't exist
    CREATE TABLE follows (
      follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      following_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id)
    );
  END IF;
END $$;

-- Ensure RLS is enabled on follows table
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Create or update RLS policies for follows table
DO $$
BEGIN
  -- Check and create select policy
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE tablename = 'follows' AND policyname = 'Anyone can view follow relationships'
  ) THEN
    CREATE POLICY "Anyone can view follow relationships"
      ON follows
      FOR SELECT
      USING (true);
  END IF;

  -- Check and create insert policy
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE tablename = 'follows' AND policyname = 'Authenticated users can follow others'
  ) THEN
    CREATE POLICY "Authenticated users can follow others"
      ON follows
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = follower_id);
  END IF;

  -- Check and create delete policy
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE tablename = 'follows' AND policyname = 'Users can unfollow'
  ) THEN
    CREATE POLICY "Users can unfollow"
      ON follows
      FOR DELETE
      TO authenticated
      USING (auth.uid() = follower_id);
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON profiles(plan_type);

-- Fix public_profiles view
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