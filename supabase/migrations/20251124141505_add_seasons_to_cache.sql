/*
  # Add seasons data to movie_cache

  1. Changes
    - Add seasons_data column (jsonb) to store seasons and episodes information
    - Only TV shows will have this data populated
  
  2. Structure
    - seasons_data will contain array of seasons with their episodes
    - Each season has: season_number, name, episode_count, episodes array
    - Each episode has: episode_number, name, air_date, runtime
*/

-- Add seasons_data column
ALTER TABLE movie_cache 
ADD COLUMN IF NOT EXISTS seasons_data jsonb;