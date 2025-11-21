/*
  # Add media type support for TV series

  1. Changes
    - Add `media_type` column to `movies` table (movie or tv)
    - Add `number_of_seasons` column to `movies` table for TV shows
    - Default media_type is 'movie' for backwards compatibility

  2. Notes
    - TV shows will use the same table as movies
    - Runtime is used for movies, number_of_seasons for TV shows
    - All existing entries default to 'movie' type
*/

-- Add media_type column
ALTER TABLE movies
ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'movie' CHECK (media_type IN ('movie', 'tv'));

-- Add number_of_seasons column for TV shows
ALTER TABLE movies
ADD COLUMN IF NOT EXISTS number_of_seasons integer;

-- Add comments
COMMENT ON COLUMN movies.media_type IS 'Type of media: movie or tv series';
COMMENT ON COLUMN movies.number_of_seasons IS 'Number of seasons (for TV shows only)';
