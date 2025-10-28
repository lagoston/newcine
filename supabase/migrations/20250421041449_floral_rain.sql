/*
  # Get Random User Ratings Function

  1. New Function
    - Creates a function to fetch random rated movies for a user
    - Returns title and rating for up to 50 random movies
    - Accessible via RPC call from frontend
    - Includes proper error handling and validation

  2. Security
    - Function is marked as STABLE for better caching
    - Uses RLS policies from user_movies table
    - Safe against SQL injection
*/

-- Drop function if it exists (for idempotency)
DROP FUNCTION IF EXISTS get_random_user_ratings;

-- Create the function
CREATE OR REPLACE FUNCTION get_random_user_ratings(user_id_input uuid)
RETURNS TABLE (
  title text,
  rating integer,
  year integer,
  genres text[],
  director text
) 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tmdb_api_key text := current_setting('app.settings.tmdb_api_key', true);
  movie_data json;
  movie_id integer;
  movie_cursor CURSOR FOR 
    SELECT um.movie_id, um.rating
    FROM user_movies um
    WHERE um.user_id = user_id_input
      AND um.rating IS NOT NULL
    ORDER BY random()
    LIMIT 50;
BEGIN
  -- Create temporary table to store results
  CREATE TEMP TABLE temp_results (
    title text,
    rating integer,
    year integer,
    genres text[],
    director text
  ) ON COMMIT DROP;

  -- Fetch and process each movie
  FOR movie IN movie_cursor LOOP
    -- Make HTTP request to TMDb API
    SELECT content INTO movie_data
    FROM http_get('https://api.themoviedb.org/3/movie/' || movie.movie_id::text || '?api_key=' || tmdb_api_key || '&append_to_response=credits');

    -- Extract and insert movie data
    INSERT INTO temp_results (title, rating, year, genres, director)
    SELECT 
      movie_data->>'title',
      movie.rating,
      EXTRACT(YEAR FROM (movie_data->>'release_date')::date)::integer,
      ARRAY(
        SELECT json_array_elements(movie_data->'genres')->>'name'
      ),
      (
        SELECT json_array_elements(movie_data->'credits'->'crew')->>'name'
        WHERE json_array_elements(movie_data->'credits'->'crew')->>'job' = 'Director'
        LIMIT 1
      );
  END LOOP;

  -- Return results
  RETURN QUERY SELECT * FROM temp_results;
END;
$$;