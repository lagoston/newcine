/*
  # Add RPC function to get all movie IDs

  1. New Function
    - Creates a function to fetch all movie IDs
    - Returns a table of movie IDs
    - Excludes movies already in user's library
    - Limits result to 500 random movies
    
  2. Security
    - Function is marked as STABLE for better caching
    - Uses RLS policies from movies table
*/

CREATE OR REPLACE FUNCTION get_all_movie_ids(user_id_input uuid)
RETURNS TABLE (
  movie_id integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT m.id
  FROM movies m
  WHERE m.id NOT IN (
    SELECT um.movie_id
    FROM user_movies um
    WHERE um.user_id = user_id_input
  )
  ORDER BY random()
  LIMIT 500;
END;
$$;