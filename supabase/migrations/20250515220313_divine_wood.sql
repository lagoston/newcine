/*
  # Add Saw Theme

  1. New Visual Elements
    - Add "saw" avatar frame option
    - Add "saw" banner option
    - Add blood dripping animation effects

  2. Update
    - Add support for the new Saw horror theme
    - Add blood effect animations
    - Make premium exclusive
*/

-- This is a lightweight schema update that doesn't require any database changes
-- The changes are completely handled in the frontend code
-- We're just adding this migration file for documentation purposes

-- Verify that users have access to the profiles API
DO $$ 
BEGIN
  -- Ensure the profiles table exists with needed columns
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

-- Ensure RLS policies are in place
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;