/*
  # Add TV show runtime calculation fields to movie_cache

  1. Problem
    - TV shows don't have total runtime, only episode_run_time
    - Watch time calculation doesn't work for TV shows
    - Need to store episode count and average episode duration

  2. Changes
    - Add number_of_episodes column (total episodes across all seasons)
    - Add episode_run_time column (average minutes per episode)
    - Keep existing runtime column (will be calculated for TV: episodes × avg_runtime)
*/

-- Add episode count
ALTER TABLE movie_cache 
ADD COLUMN IF NOT EXISTS number_of_episodes integer;

-- Add average episode runtime
ALTER TABLE movie_cache 
ADD COLUMN IF NOT EXISTS episode_run_time integer;

-- Add origin country
ALTER TABLE movie_cache
ADD COLUMN IF NOT EXISTS origin_country text[];

COMMENT ON COLUMN movie_cache.number_of_episodes IS 'Total number of episodes (for TV shows)';
COMMENT ON COLUMN movie_cache.episode_run_time IS 'Average episode duration in minutes (for TV shows)';
COMMENT ON COLUMN movie_cache.runtime IS 'Total runtime in minutes. For movies: single runtime. For TV: calculated as number_of_episodes × episode_run_time';
COMMENT ON COLUMN movie_cache.origin_country IS 'Origin country codes (e.g., ["US", "GB"])';
