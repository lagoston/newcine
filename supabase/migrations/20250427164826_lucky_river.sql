/*
  # Add foreign key constraint for movies table

  1. Changes
    - Create function to handle missing movies
    - Add foreign key constraint from user_movies.movie_id to movies.id
    - Add index on user_movies.movie_id for better query performance

  2. Security
    - No changes to RLS policies
*/

-- Create a view to identify missing movies
CREATE OR REPLACE VIEW missing_movies AS
SELECT DISTINCT um.movie_id
FROM user_movies um
LEFT JOIN movies m ON um.movie_id = m.id
WHERE m.id IS NULL;

-- Insert placeholder records for missing movies
INSERT INTO movies (id, title, release_date)
SELECT movie_id, 'Movie ' || movie_id::text, NULL
FROM missing_movies
ON CONFLICT (id) DO NOTHING;

-- Add foreign key constraint
ALTER TABLE user_movies
ADD CONSTRAINT user_movies_movie_id_fkey
FOREIGN KEY (movie_id) REFERENCES movies(id);

-- Create index for better join performance
CREATE INDEX IF NOT EXISTS idx_user_movies_movie_id 
ON user_movies(movie_id);