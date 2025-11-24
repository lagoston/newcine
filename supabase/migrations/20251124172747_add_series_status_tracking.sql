/*
  # Add series status tracking

  1. Changes
    - Add status column (text) to track if series is ended or returning
    - Add in_production column (boolean) to track if new episodes are being made
    - Add last_air_date column (date) for last episode aired
    
  2. Purpose
    - Enable auto-refresh for ongoing series (like movies with 0.0 rating)
    - Series that are "Returning Series" or "In Production" should check API for updates
*/

-- Add status tracking columns
ALTER TABLE movie_cache 
ADD COLUMN IF NOT EXISTS status text,
ADD COLUMN IF NOT EXISTS in_production boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_air_date date;

-- Create index for faster queries on ongoing series
CREATE INDEX IF NOT EXISTS idx_movie_cache_ongoing_series 
  ON movie_cache(media_type, in_production) 
  WHERE media_type = 'tv' AND (in_production = true OR status != 'Ended');