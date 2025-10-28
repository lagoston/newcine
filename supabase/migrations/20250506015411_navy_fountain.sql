-- Drop existing triggers and functions with CASCADE
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP TRIGGER IF EXISTS init_profile_and_tickets ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.init_profile_and_tickets() CASCADE;

-- Recreate profiles table
DROP TABLE IF EXISTS public.profiles CASCADE;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  avatar_url text,
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  plan_type text DEFAULT 'free',
  avatar_frame text DEFAULT '',
  banner text DEFAULT ''
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Public profiles are viewable by everyone'
  ) THEN
    CREATE POLICY "Public profiles are viewable by everyone"
      ON public.profiles
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile"
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  username_from_metadata text;
  final_username text;
BEGIN
  -- Get username from metadata
  username_from_metadata := (new.raw_user_meta_data->>'username')::text;
  
  -- Use metadata username or generate one
  IF username_from_metadata IS NOT NULL AND length(username_from_metadata) > 0 THEN
    final_username := username_from_metadata;
  ELSE
    final_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;

  -- Create profile
  INSERT INTO public.profiles (
    id,
    username,
    created_at,
    updated_at
  ) VALUES (
    new.id,
    final_username,
    now(),
    now()
  );

  -- Initialize tickets
  INSERT INTO public.user_tickets (
    user_id,
    tickets_remaining,
    plan_type,
    last_reset_at
  ) VALUES (
    new.id,
    300,
    'free',
    now()
  );

  RETURN new;
EXCEPTION WHEN others THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN null;
END;
$$;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);