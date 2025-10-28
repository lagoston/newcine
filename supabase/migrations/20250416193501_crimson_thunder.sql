/*
  # User Profiles and Follow System

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `username` (text, unique)
      - `avatar_url` (text)
      - `bio` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `follows`
      - `follower_id` (uuid, references profiles)
      - `following_id` (uuid, references profiles)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for:
      - Public read access to profiles
      - Users can update their own profile
      - Users can follow/unfollow others
      - Users can view follow relationships
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  avatar_url text,
  bio text CHECK (char_length(bio) <= 160),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create follows table
CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid REFERENCES profiles ON DELETE CASCADE,
  following_id uuid REFERENCES profiles ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Follows policies
CREATE POLICY "Anyone can view follow relationships"
  ON follows
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can follow others"
  ON follows
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON follows
  FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id,
    'user_' || substr(new.id::text, 1, 8)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();