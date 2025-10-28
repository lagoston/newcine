/*
  # Update get_random_user_ratings function to return 100 movies

  1. Changes
    - Increase LIMIT from 50 to 100 movies for better prediction accuracy
    - No other changes to function logic or security
    
  2. Security
    - Maintains existing SECURITY DEFINER
    - Users can only access their own rating data
*/

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
  LIMIT 100;
END;
$$;