/*
  # Create Special Tags System

  1. New Tables
    - `special_tags`: Stores available special/seasonal tags
      - `id` (text, primary key): Unique tag identifier
      - `name` (text): Display name of the tag
      - `emoji` (text): Emoji for the tag
      - `description` (text): Description of what the tag represents
      - `requirement_description` (text): Description of how to unlock
      - `starts_at` (timestamptz): When the tag becomes available
      - `ends_at` (timestamptz): When the tag window closes (null = permanent)
      - `requirement_type` (text): Type of requirement (account_exists, movie_rating, etc.)
      - `requirement_data` (jsonb): Additional data for the requirement
      - `created_at` (timestamptz)
    
    - `user_special_tags`: Stores which users have unlocked which special tags
      - `user_id` (uuid): Reference to profiles
      - `tag_id` (text): Reference to special_tags
      - `unlocked_at` (timestamptz): When the tag was unlocked
      - `is_permanent` (boolean): Whether the tag is permanently saved

  2. Security
    - RLS enabled on both tables
    - Users can read all special_tags
    - Users can only see/modify their own unlocked tags

  3. Initial Data
    - Beta Tester tag: Available for all users who create account before June 19, 2026
*/

-- Create special_tags table
CREATE TABLE IF NOT EXISTS special_tags (
  id text PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL,
  description text NOT NULL,
  requirement_description text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  requirement_type text NOT NULL CHECK (requirement_type IN ('account_exists', 'movie_rating', 'genre_rating', 'custom')),
  requirement_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create user_special_tags table
CREATE TABLE IF NOT EXISTS user_special_tags (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id text NOT NULL REFERENCES special_tags(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  is_permanent boolean DEFAULT false,
  PRIMARY KEY (user_id, tag_id)
);

-- Enable RLS
ALTER TABLE special_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_special_tags ENABLE ROW LEVEL SECURITY;

-- Policies for special_tags (everyone can read)
CREATE POLICY "Anyone can read special_tags"
  ON special_tags FOR SELECT
  TO authenticated
  USING (true);

-- Policies for user_special_tags
CREATE POLICY "Users can read own special tags"
  ON user_special_tags FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own special tags"
  ON user_special_tags FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own special tags"
  ON user_special_tags FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Insert Beta Tester tag (ends June 19, 2026 - 3 months from now)
INSERT INTO special_tags (id, name, emoji, description, requirement_description, starts_at, ends_at, requirement_type, requirement_data)
VALUES (
  'beta-tester',
  'Beta Tester',
  '🧿',
  'Participated in the Cine Oracle beta',
  'Create an account during the beta period',
  '2025-01-01 00:00:00+00',
  '2026-06-19 23:59:59+00',
  'account_exists',
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Create function to auto-unlock Beta Tester tag for existing users
CREATE OR REPLACE FUNCTION unlock_beta_tester_for_existing_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_special_tags (user_id, tag_id, unlocked_at, is_permanent)
  SELECT 
    p.id,
    'beta-tester',
    COALESCE(p.created_at, now()),
    true
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM user_special_tags ust 
    WHERE ust.user_id = p.id AND ust.tag_id = 'beta-tester'
  );
END;
$$;

-- Execute the function to unlock for all existing users
SELECT unlock_beta_tester_for_existing_users();

-- Create trigger to auto-unlock Beta Tester for new users during beta period
CREATE OR REPLACE FUNCTION auto_unlock_beta_tester()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  beta_ends_at timestamptz;
BEGIN
  SELECT ends_at INTO beta_ends_at FROM special_tags WHERE id = 'beta-tester';
  
  IF beta_ends_at IS NULL OR now() <= beta_ends_at THEN
    INSERT INTO user_special_tags (user_id, tag_id, unlocked_at, is_permanent)
    VALUES (NEW.id, 'beta-tester', now(), true)
    ON CONFLICT (user_id, tag_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_unlock_beta_tester ON profiles;
CREATE TRIGGER trigger_auto_unlock_beta_tester
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_unlock_beta_tester();

-- Add comment
COMMENT ON TABLE special_tags IS 'Special/seasonal tags with time-limited availability. Tags can be permanently saved by users who meet requirements during the availability window.';
COMMENT ON TABLE user_special_tags IS 'Tracks which users have unlocked special tags. Once unlocked and marked as permanent, the tag is available forever even after the event ends.';