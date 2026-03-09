/*
  # Create prediction_cache table

  ## Purpose
  Cache AI-generated predictions per user per movie for 7 days. When a user
  requests a prediction for a movie they already predicted within 7 days, the
  cached response is returned immediately without consuming a ticket or calling
  the AI.

  ## New Tables
  - `prediction_cache`
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users, cascade delete)
    - `movie_id` (integer, TMDB movie ID)
    - `prediction` (text, the two-line oracle prediction text)
    - `created_at` (timestamptz, when the prediction was generated)
    - `expires_at` (timestamptz, 7 days after creation)

  ## Constraints
  - Unique constraint on (user_id, movie_id) — one active prediction per user per movie
  - On conflict, update prediction and reset expiry (covers re-prediction after expiry)

  ## Security
  - RLS enabled; authenticated users can only access their own rows
  - Service role (used by edge functions) bypasses RLS
*/

CREATE TABLE IF NOT EXISTS prediction_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id integer NOT NULL,
  prediction text NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  CONSTRAINT prediction_cache_user_movie_unique UNIQUE (user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS prediction_cache_user_id_idx ON prediction_cache (user_id);
CREATE INDEX IF NOT EXISTS prediction_cache_expires_at_idx ON prediction_cache (expires_at);

ALTER TABLE prediction_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own prediction cache"
  ON prediction_cache FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prediction cache"
  ON prediction_cache FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prediction cache"
  ON prediction_cache FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own prediction cache"
  ON prediction_cache FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
