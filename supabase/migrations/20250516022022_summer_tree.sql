/*
  # Update Lists RLS Policy for Public Viewing

  1. Changes
    - Add policy to allow public reading of lists
    - Update policy on list_movies to allow public viewing
    - Maintain existing policies for management

  2. Security
    - Only allows reading (SELECT), not modification
    - Keeps user management capabilities unchanged
*/

-- Add policy for public reading of lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'lists' 
    AND policyname = 'Lists are viewable by everyone'
  ) THEN
    CREATE POLICY "Lists are viewable by everyone"
      ON lists
      FOR SELECT
      TO public
      USING (true);
  END IF;
END $$;

-- Add policy for public reading of list_movies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'list_movies' 
    AND policyname = 'List movies are viewable by everyone'
  ) THEN
    CREATE POLICY "List movies are viewable by everyone"
      ON list_movies
      FOR SELECT
      TO public
      USING (true);
  END IF;
END $$;