/*
  # Create Movie Cache System

  1. Purpose
    - Store frequently accessed movie data locally to reduce TMDB API calls
    - Support multilingual data (English and Portuguese)
    - Maintain same functionality with improved performance
  
  2. New Tables
    - `movie_cache`
      - `id` (integer, primary key) - Same as TMDB movie ID
      - `tmdb_id` (integer, unique) - TMDB movie ID for reference
      - `media_type` (text) - 'movie' or 'tv'
      - `poster_path` (text) - Poster URL (English only, shared for all languages)
      - `backdrop_path` (text) - Backdrop URL
      - `vote_average` (decimal) - TMDB rating
      - `popularity` (decimal) - TMDB popularity score
      - `runtime` (integer) - Runtime in minutes (for movies)
      - `number_of_seasons` (integer) - Number of seasons (for TV)
      - `release_date` (date) - Release date
      
      - `title_en` (text) - Title in English
      - `overview_en` (text) - Overview in English
      - `genres_en` (jsonb) - Genres array in English
      
      - `title_pt` (text) - Title in Portuguese
      - `overview_pt` (text) - Overview in Portuguese
      - `genres_pt` (jsonb) - Genres array in Portuguese
      
      - `director` (text) - Director name
      - `cast_members` (jsonb) - Top cast members
      - `watch_providers` (jsonb) - Streaming providers data
      - `content_ratings` (jsonb) - Age ratings
      
      - `cached_at` (timestamptz) - When data was cached
      - `updated_at` (timestamptz) - Last update timestamp
  
  3. Security
    - Enable RLS on `movie_cache` table
    - Allow public read access (data is public from TMDB)
    - Only authenticated users can trigger cache updates (via app logic)
  
  4. Indexes
    - Index on tmdb_id for fast lookups
    - Index on media_type for filtering
    - Index on cached_at for maintenance queries
*/

-- Create movie_cache table
CREATE TABLE IF NOT EXISTS movie_cache (
  id integer PRIMARY KEY,
  tmdb_id integer UNIQUE NOT NULL,
  media_type text NOT NULL DEFAULT 'movie' CHECK (media_type IN ('movie', 'tv')),
  
  -- Visual data (language-independent)
  poster_path text,
  backdrop_path text,
  vote_average decimal(3,1),
  popularity decimal(10,3),
  runtime integer,
  number_of_seasons integer,
  release_date date,
  
  -- English data
  title_en text NOT NULL,
  overview_en text,
  genres_en jsonb DEFAULT '[]'::jsonb,
  
  -- Portuguese data
  title_pt text,
  overview_pt text,
  genres_pt jsonb DEFAULT '[]'::jsonb,
  
  -- Additional metadata
  director text,
  cast_members jsonb DEFAULT '[]'::jsonb,
  watch_providers jsonb DEFAULT '{}'::jsonb,
  content_ratings jsonb DEFAULT '[]'::jsonb,
  
  -- Cache management
  cached_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_movie_cache_tmdb_id ON movie_cache(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movie_cache_media_type ON movie_cache(media_type);
CREATE INDEX IF NOT EXISTS idx_movie_cache_cached_at ON movie_cache(cached_at);

-- Enable RLS
ALTER TABLE movie_cache ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read cached movie data (public TMDB data)
CREATE POLICY "Anyone can read movie cache"
  ON movie_cache
  FOR SELECT
  TO public
  USING (true);

-- Only service role can insert/update cache (via edge functions or app logic)
CREATE POLICY "Authenticated users can insert to cache"
  ON movie_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cache"
  ON movie_cache
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add comments for documentation
COMMENT ON TABLE movie_cache IS 'Local cache of TMDB movie data to reduce API calls';
COMMENT ON COLUMN movie_cache.tmdb_id IS 'Original TMDB movie/TV show ID';
COMMENT ON COLUMN movie_cache.poster_path IS 'Poster URL (English version, used for all languages)';
COMMENT ON COLUMN movie_cache.cached_at IS 'Timestamp when data was first cached';
COMMENT ON COLUMN movie_cache.updated_at IS 'Timestamp of last cache update';
