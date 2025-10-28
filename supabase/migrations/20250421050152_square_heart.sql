/*
  # Backfill Movies Data Migration

  1. Purpose
    - Create a function to populate movies table with metadata
    - Support retroactive data population
    - Maintain data consistency

  2. Changes
    - Create function to insert/update movie data
    - Add indexes for better query performance
    - Enable proper error handling
*/

-- Create or replace the function to update movie data
CREATE OR REPLACE FUNCTION upsert_movie_metadata(
  p_movie_id integer,
  p_title text,
  p_release_date date,
  p_genres text[],
  p_director text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO movies (
    id,
    title,
    release_date,
    genres,
    director
  )
  VALUES (
    p_movie_id,
    p_title,
    p_release_date,
    p_genres,
    p_director
  )
  ON CONFLICT (id) DO UPDATE
  SET
    title = EXCLUDED.title,
    release_date = EXCLUDED.release_date,
    genres = EXCLUDED.genres,
    director = EXCLUDED.director;
END;
$$;

-- Create index on movie_id for better join performance
CREATE INDEX IF NOT EXISTS idx_user_movies_movie_id ON user_movies(movie_id);

-- Create index on genres for faster genre-based queries
CREATE INDEX IF NOT EXISTS idx_movies_genres ON movies USING gin(genres);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION upsert_movie_metadata TO authenticated;

-- Create a view to identify missing movies
CREATE OR REPLACE VIEW missing_movies AS
SELECT DISTINCT um.movie_id
FROM user_movies um
LEFT JOIN movies m ON um.movie_id = m.id
WHERE m.id IS NULL;