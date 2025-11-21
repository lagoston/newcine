/*
  # Add Portuguese poster support to movie cache

  1. Changes
    - Add `poster_path_pt` column to store Portuguese poster
    - Keep `poster_path` for English poster
    - This allows proper multilingual poster support
*/

-- Add Portuguese poster column
ALTER TABLE movie_cache
ADD COLUMN IF NOT EXISTS poster_path_pt text;

COMMENT ON COLUMN movie_cache.poster_path_pt IS 'Poster URL in Portuguese';
COMMENT ON COLUMN movie_cache.poster_path IS 'Poster URL in English';
