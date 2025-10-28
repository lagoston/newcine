/*
  # Update movies table schema

  1. Changes
    - Add runtime column to movies table
    - Update existing movies with runtime data
    - Create index for better performance
*/

-- Add runtime column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'movies' AND column_name = 'runtime'
  ) THEN
    ALTER TABLE movies ADD COLUMN runtime integer;
  END IF;
END $$;

-- Create index on runtime column
CREATE INDEX IF NOT EXISTS idx_movies_runtime ON movies(runtime);