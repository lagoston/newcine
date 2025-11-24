/*
  # Replace popularity with vote_count in movie_cache

  1. Changes
    - Add vote_count column (integer)
    - Remove popularity column
    - Update existing data will be handled by repopulate function
  
  2. Notes
    - vote_count represents the number of votes/ratings a movie has on TMDB
    - More accurate metric for "hidden gem" detection than popularity score
*/

-- Add vote_count column
ALTER TABLE movie_cache 
ADD COLUMN IF NOT EXISTS vote_count integer;

-- Remove popularity column
ALTER TABLE movie_cache 
DROP COLUMN IF EXISTS popularity;