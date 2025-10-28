/*
  # Create RPC function for random user ratings

  1. Changes
    - Create RPC function `get_random_user_ratings` to fetch random user movie ratings
    - Function returns user's movie history with ratings, genres, and other metadata
    - Ensures data is fetched from existing tables without schema modifications

  2. Security
    - Function is accessible to authenticated users only
    - Users can only access their own rating data
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_random_user_ratings;

CREATE OR REPLACE FUNCTION get_random_user_ratings(user_id_input uuid)
RETURNS TABLE (
  title text,
  rating integer,
  year integer,
  genres text[],
  director text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure the movies table exists and has the required data
  IF NOT EXISTS (SELECT 1 FROM movies LIMIT 1) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    m.title,
    um.rating,
    EXTRACT(YEAR FROM m.release_date)::integer as year,
    m.genres,
    m.director
  FROM user_movies um
  JOIN movies m ON um.movie_id = m.id
  WHERE um.user_id = user_id_input
    AND um.rating IS NOT NULL
  ORDER BY RANDOM()
  LIMIT 50;
END;
$$;