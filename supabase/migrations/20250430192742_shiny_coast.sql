/*
  # Fix get_all_movie_ids RPC function

  1. Changes
    - Rewrites get_all_movie_ids function to avoid DISTINCT + ORDER BY error
    - Uses subquery approach to generate random order
    - Maintains same functionality but fixes Postgres error

  2. Technical Details
    - Function still returns movie_ids for a given user
    - Uses random() in subquery to allow ORDER BY
    - Keeps 500 record limit for performance
*/

CREATE OR REPLACE FUNCTION public.get_all_movie_ids(
  user_id_input uuid
)
RETURNS TABLE(movie_id integer) 
LANGUAGE sql STABLE AS $$
  SELECT t.movie_id
  FROM (
    SELECT
      movie_id,
      random() AS rnd
    FROM user_movies
    WHERE user_id = user_id_input
  ) AS t
  ORDER BY t.rnd
  LIMIT 500;
$$;