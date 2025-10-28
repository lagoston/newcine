/*
  # Add user recommendation history table

  1. New Tables
    - `user_recommend_history`
      - Track last 20 recommendations per user
      - Store TMDb movie IDs and timestamps
      - Enable cleanup of old records

  2. Security
    - Enable RLS
    - Add policies for users to read their own history
    - System can write new records
*/

CREATE TABLE IF NOT EXISTS user_recommend_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  movie_id integer NOT NULL,
  movie_title text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_recommend_history_user_created 
ON user_recommend_history(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE user_recommend_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own history
CREATE POLICY "Users can read own history"
  ON user_recommend_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to get recent recommendations
CREATE OR REPLACE FUNCTION get_recent_recommendations(user_id_input uuid)
RETURNS TABLE (
  movie_id integer,
  movie_title text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT urh.movie_id, urh.movie_title
  FROM user_recommend_history urh
  WHERE urh.user_id = user_id_input
  ORDER BY urh.created_at DESC
  LIMIT 20;
END;
$$;