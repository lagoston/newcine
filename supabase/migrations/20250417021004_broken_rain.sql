/*
  # Movie Lists Feature

  1. New Tables
    - `lists`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text, unique per user)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `list_movies`
      - `list_id` (uuid, references lists)
      - `movie_id` (integer)
      - `added_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for:
      - Users can CRUD their own lists
      - Users can read lists they have access to
      - Users can manage movies in their lists
*/

-- Create lists table
CREATE TABLE IF NOT EXISTS lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Create list_movies table
CREATE TABLE IF NOT EXISTS list_movies (
  list_id uuid REFERENCES lists ON DELETE CASCADE,
  movie_id integer NOT NULL,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (list_id, movie_id)
);

-- Enable RLS
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_movies ENABLE ROW LEVEL SECURITY;

-- Lists policies
CREATE POLICY "Users can manage their own lists"
  ON lists
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- List movies policies
CREATE POLICY "Users can manage movies in their lists"
  ON list_movies
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_id
      AND lists.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lists
      WHERE lists.id = list_id
      AND lists.user_id = auth.uid()
    )
  );