/*
  # Initial Schema Setup for Cine Oracle

  1. New Tables
    - `user_movies`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `movie_id` (integer, TMDb movie ID)
      - `rating` (integer, 0-10)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `user_movies` table
    - Add policies for authenticated users to:
      - Read their own movie entries
      - Create new movie entries
      - Update their movie ratings
      - Delete their movie entries
*/

CREATE TABLE IF NOT EXISTS user_movies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  movie_id integer NOT NULL,
  rating integer CHECK (rating >= 0 AND rating <= 10),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, movie_id)
);

ALTER TABLE user_movies ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read their own movie entries
CREATE POLICY "Users can read own movies"
  ON user_movies
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy to allow users to insert their own movie entries
CREATE POLICY "Users can add movies"
  ON user_movies
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to update their own movie entries
CREATE POLICY "Users can update own movies"
  ON user_movies
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to delete their own movie entries
CREATE POLICY "Users can delete own movies"
  ON user_movies
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);