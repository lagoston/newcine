/*
  # Fix Lists Table Permissions

  1. Changes
    - Set up proper RLS policies for lists and list_movies tables
    - Ensure users can manage only their own lists
    - Allow public viewing of all lists for the UserListsModal
    - Add database indexes for better performance

  2. Security
    - Maintain proper permissions separation
    - Enable public reading while restricting management to owners
*/

-- Use DO blocks with existence checks to safely modify policies
DO $$
BEGIN
  -- Drop specific policies if they exist
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own lists' AND tablename = 'lists') THEN
    DROP POLICY "Users can view own lists" ON lists;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view other users'' lists for display' AND tablename = 'lists') THEN
    DROP POLICY "Users can view other users' lists for display" ON lists;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own list movies' AND tablename = 'list_movies') THEN
    DROP POLICY "Users can view their own list movies" ON list_movies;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view other users'' list movies for display' AND tablename = 'list_movies') THEN
    DROP POLICY "Users can view other users' list movies for display" ON list_movies;
  END IF;
  
  -- Only create the policies if they don't already exist
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own lists' AND tablename = 'lists') THEN
    CREATE POLICY "Users can manage their own lists"
    ON lists
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view lists' AND tablename = 'lists') THEN
    CREATE POLICY "Users can view lists"
    ON lists
    FOR SELECT
    TO public
    USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view list movies' AND tablename = 'list_movies') THEN
    CREATE POLICY "Users can view list movies"
    ON list_movies
    FOR SELECT
    TO public
    USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage movies in their lists' AND tablename = 'list_movies') THEN
    CREATE POLICY "Users can manage movies in their lists"
    ON list_movies
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM lists
        WHERE lists.id = list_movies.list_id
        AND lists.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM lists
        WHERE lists.id = list_movies.list_id
        AND lists.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Create indexes for better performance (these automatically check for existence)
CREATE INDEX IF NOT EXISTS idx_lists_user_id ON lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_movies_list_id ON list_movies(list_id);
CREATE INDEX IF NOT EXISTS idx_lists_created_at ON lists(created_at);