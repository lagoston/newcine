/*
  # Fix User Profile and Follows Relationship

  1. Changes
    - Ensure proper foreign key constraints between profiles and follows tables
    - Fix the issue with profile navigation from community page
    - Resolve relationship errors in the database schema
    - Reset and rebuild the follows table if needed

  2. Security
    - Maintain existing RLS policies
    - Ensure data consistency
*/

-- First check if follows table exists and has proper foreign keys
DO $$ 
BEGIN
  -- Check if follows table exists
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'follows') THEN
    -- Create follows table with proper foreign keys
    CREATE TABLE public.follows (
      follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id)
    );
  ELSE
    -- Check if follows table has proper foreign keys
    -- First, check follower_id foreign key
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'follows_follower_id_fkey' 
      AND contype = 'f' 
      AND conrelid = 'public.follows'::regclass
    ) THEN
      -- Drop the constraint if it exists with another name
      DO $inner$ 
      BEGIN
        EXECUTE (
          SELECT 'ALTER TABLE public.follows DROP CONSTRAINT ' || conname
          FROM pg_constraint
          WHERE contype = 'f'
          AND conrelid = 'public.follows'::regclass
          AND array_to_string(conkey, ',') = (
            SELECT array_to_string(a.attnum, ',')
            FROM pg_attribute a
            WHERE a.attrelid = 'public.follows'::regclass
            AND a.attname = 'follower_id'
          )
          LIMIT 1
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $inner$;
      
      -- Add the proper foreign key
      ALTER TABLE public.follows 
      ADD CONSTRAINT follows_follower_id_fkey 
      FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;

    -- Then, check following_id foreign key
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'follows_following_id_fkey' 
      AND contype = 'f' 
      AND conrelid = 'public.follows'::regclass
    ) THEN
      -- Drop the constraint if it exists with another name
      DO $inner$ 
      BEGIN
        EXECUTE (
          SELECT 'ALTER TABLE public.follows DROP CONSTRAINT ' || conname
          FROM pg_constraint
          WHERE contype = 'f'
          AND conrelid = 'public.follows'::regclass
          AND array_to_string(conkey, ',') = (
            SELECT array_to_string(a.attnum, ',')
            FROM pg_attribute a
            WHERE a.attrelid = 'public.follows'::regclass
            AND a.attname = 'following_id'
          )
          LIMIT 1
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $inner$;
      
      -- Add the proper foreign key
      ALTER TABLE public.follows 
      ADD CONSTRAINT follows_following_id_fkey 
      FOREIGN KEY (following_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Enable RLS on follows table
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Create policies for follows table
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'follows' AND policyname = 'Anyone can view follow relationships') THEN
    CREATE POLICY "Anyone can view follow relationships"
      ON follows
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'follows' AND policyname = 'Authenticated users can follow others') THEN
    CREATE POLICY "Authenticated users can follow others"
      ON follows
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = follower_id);
  END IF;

  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'follows' AND policyname = 'Users can unfollow') THEN
    CREATE POLICY "Users can unfollow"
      ON follows
      FOR DELETE
      TO authenticated
      USING (auth.uid() = follower_id);
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

-- Make sure public_profiles view is properly defined
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

-- Grant access to public_profiles view
GRANT SELECT ON public_profiles TO authenticated;
GRANT SELECT ON public_profiles TO public;