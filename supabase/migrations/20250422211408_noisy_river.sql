/*
  # Add saved predictions table

  1. New Tables
    - `saved_predictions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `movie_name` (text)
      - `prediction` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on saved_predictions table
    - Add policies for:
      - Users can read their own predictions
      - Users can create predictions
      - Anyone can read shared predictions
*/

CREATE TABLE IF NOT EXISTS saved_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  movie_name text NOT NULL,
  prediction text NOT NULL,
  created_at timestamptz DEFAULT now(),
  is_public boolean DEFAULT false
);

ALTER TABLE saved_predictions ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their own predictions
CREATE POLICY "Users can read own predictions"
  ON saved_predictions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for users to create predictions
CREATE POLICY "Users can create predictions"
  ON saved_predictions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy for public access to shared predictions
CREATE POLICY "Anyone can read public predictions"
  ON saved_predictions
  FOR SELECT
  TO public
  USING (is_public = true);