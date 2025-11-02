/*
  # Create Oracle Recommendations History Table

  1. New Tables
    - `oracle_recommendations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `movie_id` (integer) - TMDB movie ID
      - `mood` (text) - The mood used for recommendation
      - `card_type` (text) - bogart, fincher, or cypher
      - `recommendation_text` (text) - The AI-generated recommendation
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `oracle_recommendations` table
    - Add policy for users to read their own recommendations
    - Add policy for authenticated users to insert their own recommendations

  3. Indexes
    - Index on user_id for fast lookups
    - Index on created_at for sorting recent recommendations
*/

CREATE TABLE IF NOT EXISTS oracle_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  movie_id integer NOT NULL,
  mood text NOT NULL,
  card_type text NOT NULL CHECK (card_type IN ('bogart', 'fincher', 'cypher')),
  recommendation_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE oracle_recommendations ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their own recommendations
CREATE POLICY "Users can read own oracle recommendations"
  ON oracle_recommendations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for service role to insert recommendations
CREATE POLICY "Service role can insert oracle recommendations"
  ON oracle_recommendations
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_oracle_recommendations_user_id 
  ON oracle_recommendations(user_id);

CREATE INDEX IF NOT EXISTS idx_oracle_recommendations_created_at 
  ON oracle_recommendations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oracle_recommendations_user_created 
  ON oracle_recommendations(user_id, created_at DESC);