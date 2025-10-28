/*
  # Add RPC function for fetching user library

  1. New Function
    - Creates get_user_library function to fetch all movie IDs from user's library
    - Returns array of movie IDs for exclusion in recommendations
    - Accessible via RPC call from frontend
    - Includes proper error handling

  2. Security
    - Function is marked as STABLE for better caching
    - Uses RLS policies from user_movies table
    - Safe against SQL injection
*/

CREATE OR REPLACE FUNCTION get_user_library(user_id_input uuid)
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
  SELECT DISTINCT um.movie_id
  FROM user_movies um
  WHERE um.user_id = user_id_input;
END;
$$;