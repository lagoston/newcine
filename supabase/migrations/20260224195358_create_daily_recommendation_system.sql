/*
  # Create Daily Recommendation System

  ## Summary
  Creates the infrastructure for a global "Recomendação do Dia" (Daily Recommendation)
  that shows the same movie to all users for a 24-hour period.

  ## New Tables
  - `daily_recommendation`: Stores one record per calendar day with the selected movie_id.
    - `id` (uuid): Primary key
    - `movie_id` (integer): TMDB movie ID for the day
    - `recommendation_date` (date): The calendar date (unique - one per day)
    - `created_at` (timestamptz): When the record was created

  ## New Functions
  - `get_or_create_daily_recommendation()`: Atomically retrieves today's movie or
    selects a new random one from the Bogart and Fincher random-surprise pools.

  ## Security
  - RLS enabled on the table
  - Authenticated users can read the daily recommendation
  - Only the function (SECURITY DEFINER) can insert new records
*/

CREATE TABLE IF NOT EXISTS daily_recommendation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id integer NOT NULL,
  recommendation_date date NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_recommendation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read daily recommendation"
  ON daily_recommendation
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION get_or_create_daily_recommendation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date date := CURRENT_DATE;
  existing_movie_id integer;
  all_movie_ids jsonb;
  pool_size integer;
  random_index integer;
  random_movie_id integer;
BEGIN
  SELECT movie_id INTO existing_movie_id
  FROM daily_recommendation
  WHERE recommendation_date = today_date;

  IF existing_movie_id IS NOT NULL THEN
    RETURN existing_movie_id;
  END IF;

  SELECT jsonb_agg(elem::integer)
  INTO all_movie_ids
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(movie_ids)::integer AS elem
    FROM recommendation_pools
    WHERE card_type IN ('bogart', 'fincher')
      AND mood_key = 'random-surprise'
  ) subq;

  IF all_movie_ids IS NULL OR jsonb_array_length(all_movie_ids) = 0 THEN
    RETURN NULL;
  END IF;

  pool_size := jsonb_array_length(all_movie_ids);
  random_index := floor(random() * pool_size)::integer;
  random_movie_id := (all_movie_ids->>random_index)::integer;

  INSERT INTO daily_recommendation (movie_id, recommendation_date)
  VALUES (random_movie_id, today_date)
  ON CONFLICT (recommendation_date) DO NOTHING;

  SELECT movie_id INTO existing_movie_id
  FROM daily_recommendation
  WHERE recommendation_date = today_date;

  RETURN existing_movie_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_daily_recommendation() TO authenticated;
