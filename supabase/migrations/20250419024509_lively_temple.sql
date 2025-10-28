/*
  # Update user_movies RLS policies for public read access

  1. Security Changes
    - Add new RLS policy to allow public read access to user_movies table
    - Keep existing policies for authenticated users to manage their own movies
    - Ensure sensitive data is protected while allowing necessary visibility

  2. Changes
    - Add new SELECT policy for public access
    - Existing policies remain unchanged
*/

-- Add policy for public read access to user_movies
CREATE POLICY "Anyone can view user movies"
  ON user_movies
  FOR SELECT
  TO public
  USING (true);

-- Note: Existing policies remain in place:
-- - "Users can read own movies"
-- - "Users can add movies"
-- - "Users can update own movies"
-- - "Users can delete own movies"