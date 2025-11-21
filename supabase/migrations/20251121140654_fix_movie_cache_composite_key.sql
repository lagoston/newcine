/*
  # Fix movie_cache to support both movies and TV shows with same TMDB ID

  1. Problem
    - Movies and TV shows can have the same TMDB ID (e.g., Breaking Bad TV=1396, Mirror Movie=1396)
    - Current primary key is just `id`, causing conflicts
    - Need composite key (tmdb_id + media_type)

  2. Changes
    - Drop current primary key
    - Create composite primary key on (tmdb_id, media_type)
    - Recreate unique constraint on tmdb_id alone (removed)
    - Keep all data intact

  3. Migration Strategy
    - Save existing data
    - Drop constraints
    - Add new composite primary key
    - Restore data
*/

-- First, drop the existing constraints
ALTER TABLE movie_cache DROP CONSTRAINT IF EXISTS movie_cache_pkey;
ALTER TABLE movie_cache DROP CONSTRAINT IF EXISTS movie_cache_tmdb_id_key;

-- Now create a composite primary key
ALTER TABLE movie_cache 
ADD CONSTRAINT movie_cache_pkey PRIMARY KEY (tmdb_id, media_type);

-- Update comment
COMMENT ON TABLE movie_cache IS 'Local cache of TMDB movie and TV show data. Uses composite key (tmdb_id, media_type) to handle ID conflicts.';
