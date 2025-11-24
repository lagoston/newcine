/*
  # Add media_type to recommendations table

  1. Problem
    - Recommendations (whispers) don't store media_type
    - When user recommends Twin Peaks (TV 1920), it opens as movie 1920
    - Need to distinguish between movies and TV shows in recommendations

  2. Changes
    - Add media_type column to recommendations table
    - Default to 'movie' for existing recommendations
    - Allow 'movie' or 'tv' values
*/

-- Add media_type column
ALTER TABLE recommendations 
ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'movie' CHECK (media_type = ANY (ARRAY['movie'::text, 'tv'::text]));

COMMENT ON COLUMN recommendations.media_type IS 'Type of media being recommended: movie or tv series';
