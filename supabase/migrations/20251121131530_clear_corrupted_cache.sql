/*
  # Clear corrupted movie cache

  1. Purpose
    - Clear all existing cached movies due to language bug
    - Movies will be re-cached automatically with correct data
    - Keeps table structure intact

  2. Notes
    - All movies will be fetched fresh from TMDB on next access
    - Cache will be rebuilt gradually as users access movies
    - No data loss - just cache refresh
*/

-- Clear all cached movies to force fresh fetch with correct language data
TRUNCATE TABLE movie_cache;

-- Add comment to track when cache was cleared
COMMENT ON TABLE movie_cache IS 'Local cache of TMDB movie data (cleared on 2025-11-21 for language bug fix)';
