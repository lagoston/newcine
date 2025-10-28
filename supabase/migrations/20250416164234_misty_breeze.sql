/*
  # Update RLS policies for user_movies table

  1. Security
    - Enable RLS on user_movies table (if not already enabled)
    - Add policies for authenticated users to:
      - Insert their own movies
      - Read their own movies
      - Update their own movies
      - Delete their own movies
    
  Note: Uses IF NOT EXISTS to handle cases where policies are already present
*/

-- Enable RLS (idempotent operation)
ALTER TABLE user_movies ENABLE ROW LEVEL SECURITY;

-- Policy for inserting movies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_movies' 
        AND policyname = 'Users can add movies'
    ) THEN
        CREATE POLICY "Users can add movies"
        ON user_movies
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

-- Policy for reading movies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_movies' 
        AND policyname = 'Users can read own movies'
    ) THEN
        CREATE POLICY "Users can read own movies"
        ON user_movies
        FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id);
    END IF;
END
$$;

-- Policy for updating movies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_movies' 
        AND policyname = 'Users can update own movies'
    ) THEN
        CREATE POLICY "Users can update own movies"
        ON user_movies
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

-- Policy for deleting movies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_movies' 
        AND policyname = 'Users can delete own movies'
    ) THEN
        CREATE POLICY "Users can delete own movies"
        ON user_movies
        FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id);
    END IF;
END
$$;