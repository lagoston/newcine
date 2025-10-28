-- First, make sure profiles table exists with correct schema
DO $$ 
BEGIN
  -- Check if profiles table exists
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      username text UNIQUE NOT NULL,
      avatar_url text,
      bio text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      plan_type text DEFAULT 'free',
      avatar_frame text DEFAULT '',
      banner text DEFAULT '',
      active_tag jsonb DEFAULT NULL
    );
  ELSE
    -- Make sure active_tag column exists
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active_tag'
    ) THEN
      ALTER TABLE public.profiles ADD COLUMN active_tag jsonb DEFAULT NULL;
    END IF;
  END IF;
END $$;

-- Enable RLS on profiles if not already enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create or update policies
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Public profiles are viewable by everyone') THEN
    CREATE POLICY "Public profiles are viewable by everyone"
      ON public.profiles
      FOR SELECT
      USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert their own profile') THEN
    CREATE POLICY "Users can insert their own profile"
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- If follows table doesn't exist or has incorrect foreign keys, create/modify it
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'follows') THEN
    CREATE TABLE IF NOT EXISTS public.follows (
      follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      following_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id)
    );
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

-- Create public_profiles view - Now with proper column check
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

GRANT SELECT ON public_profiles TO PUBLIC;

-- Drop existing user creation trigger and function 
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create new function for handling new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  username_from_metadata text;
  final_username text;
BEGIN
  -- Extract username from metadata or generate one
  username_from_metadata := (new.raw_user_meta_data->>'username')::text;
  
  IF username_from_metadata IS NOT NULL AND length(username_from_metadata) > 0 THEN
    final_username := username_from_metadata;
  ELSE
    final_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;
  
  -- Insert the new profile
  INSERT INTO public.profiles (id, username, created_at, updated_at)
  VALUES (new.id, final_username, now(), now());
  
  -- Initialize tickets if needed
  INSERT INTO public.user_tickets (user_id, tickets_remaining, plan_type, last_reset_at)
  VALUES (new.id, 300, 'free', now())
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN new; -- Still return new to not block user creation
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);

-- Verify and fix existing users without profiles
INSERT INTO profiles (id, username, created_at, updated_at)
SELECT 
  id, 
  COALESCE(
    (raw_user_meta_data->>'username')::text, 
    'user_' || substr(id::text, 1, 8)
  ),
  created_at,
  now()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- Ensure user_tickets exist for all users
INSERT INTO user_tickets (user_id, tickets_remaining, last_reset_at, plan_type)
SELECT 
  id,
  300,
  now(),
  'free'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_tickets t WHERE t.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;