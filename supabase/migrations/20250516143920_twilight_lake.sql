/*
  # Fix Lists Creation and Permissions

  1. Changes
    - Drop existing problematic policies for lists and list_movies tables
    - Create new, simplified policies that properly handle both creation and viewing
    - Add specific RPC function for retrieving lists safely
    - Create proper indexes for better performance

  2. Security
    - Allow users to manage their own lists
    - Allow everyone to view all lists (for both personal and community use)
    - Ensure consistent permissions across the application
*/

-- Drop all existing policies to start with a clean slate
DROP POLICY IF EXISTS "Users can view own lists" ON public.lists;
DROP POLICY IF EXISTS "Users can view other users' lists for display" ON public.lists;
DROP POLICY IF EXISTS "Users can manage their own lists" ON public.lists;
DROP POLICY IF EXISTS "Users can view lists" ON public.lists;
DROP POLICY IF EXISTS "Lists are viewable by everyone" ON public.lists;
DROP POLICY IF EXISTS "Anyone can view lists" ON public.lists;
DROP POLICY IF EXISTS "Users can manage own lists" ON public.lists;

DROP POLICY IF EXISTS "Users can view their own list movies" ON public.list_movies;
DROP POLICY IF EXISTS "Users can view other users' list movies for display" ON public.list_movies;
DROP POLICY IF EXISTS "Users can manage movies in their lists" ON public.list_movies;
DROP POLICY IF EXISTS "Users can view list movies" ON public.list_movies;
DROP POLICY IF EXISTS "List movies are viewable by everyone" ON public.list_movies;
DROP POLICY IF EXISTS "Anyone can view list movies" ON public.list_movies;
DROP POLICY IF EXISTS "Users can manage own list movies" ON public.list_movies;

-- Add simplified policies with clear security rules

-- For lists table
CREATE POLICY "Users can create and manage own lists"
ON public.lists
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view all lists"
ON public.lists
FOR SELECT
TO public
USING (true);

-- For list_movies table
CREATE POLICY "Users can manage own list movies"
ON public.list_movies
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lists
    WHERE lists.id = list_id
    AND lists.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM lists
    WHERE lists.id = list_id
    AND lists.user_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view all list movies"
ON public.list_movies
FOR SELECT
TO public
USING (true);

-- Create or replace the get_user_lists_by_id function
CREATE OR REPLACE FUNCTION get_user_lists_by_id(target_user_id uuid)
RETURNS SETOF lists
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM public.lists
  WHERE user_id = target_user_id
  ORDER BY created_at DESC;
$$;

-- Grant execution privilege to authenticated users
GRANT EXECUTE ON FUNCTION get_user_lists_by_id TO authenticated;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lists_user_id ON public.lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_movies_list_id ON public.list_movies(list_id);