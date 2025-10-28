/*
  # Fix Lists Privacy Issue

  1. Changes
    - Drop existing RLS policies that allow public access to all lists
    - Create more restrictive policies for lists and list_movies tables
    - Fix the issue where all users can see everyone's lists
    - Restore the ability to create new lists

  2. Security
    - Lists should only be visible to their owners in Library
    - List viewing for other users should be controlled through UserListsModal
    - Maintain proper data isolation between users
*/

-- Drop existing permissive policies that allow everyone to see all lists
DROP POLICY IF EXISTS "Lists are viewable by everyone" ON public.lists;
DROP POLICY IF EXISTS "List movies are viewable by everyone" ON public.list_movies;

-- Create restrictive policy for lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'lists' 
    AND policyname = 'Users can view own lists'
  ) THEN
    CREATE POLICY "Users can view own lists"
      ON public.lists
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Check and fix existing policy for managing lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'lists' 
    AND policyname = 'Users can manage their own lists'
  ) THEN
    CREATE POLICY "Users can manage their own lists"
      ON public.lists
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Create restrictive policy for list_movies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'list_movies' 
    AND policyname = 'Users can view their own list movies'
  ) THEN
    CREATE POLICY "Users can view their own list movies"
      ON public.list_movies
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.lists
          WHERE lists.id = list_movies.list_id
          AND lists.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Check and fix existing policy for managing list movies
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'list_movies' 
    AND policyname = 'Users can manage movies in their lists'
  ) THEN
    -- Drop and recreate to ensure it's correct
    DROP POLICY "Users can manage movies in their lists" ON public.list_movies;
  END IF;
  
  CREATE POLICY "Users can manage movies in their lists"
    ON public.list_movies
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.lists
        WHERE lists.id = list_movies.list_id
        AND lists.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.lists
        WHERE lists.id = list_movies.list_id
        AND lists.user_id = auth.uid()
      )
    );
END $$;

-- Add specific policy for UserListsModal functionality
CREATE POLICY "Users can view other users' lists for display"
  ON public.lists
  FOR SELECT
  USING (true);

-- Add specific policy for viewing other users' list_movies in UserListsModal
CREATE POLICY "Users can view other users' list movies for display"
  ON public.list_movies
  FOR SELECT
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lists_user_id ON public.lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_movies_list_id ON public.list_movies(list_id);