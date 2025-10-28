/*
  # Update saved predictions policies

  1. Changes
    - Drop existing policies if they exist
    - Create or update policies for:
      - Users reading their own predictions
      - Users creating predictions
      - Users deleting their own predictions
      - Public access to shared predictions
*/

-- Drop existing policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can read own predictions" ON saved_predictions;
    DROP POLICY IF EXISTS "Users can create predictions" ON saved_predictions;
    DROP POLICY IF EXISTS "Users can delete own predictions" ON saved_predictions;
    DROP POLICY IF EXISTS "Anyone can read public predictions" ON saved_predictions;
EXCEPTION
    WHEN undefined_table THEN
        -- Create the table if it doesn't exist
        CREATE TABLE IF NOT EXISTS saved_predictions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid REFERENCES auth.users NOT NULL,
            movie_name text NOT NULL,
            prediction text NOT NULL,
            created_at timestamptz DEFAULT now(),
            is_public boolean DEFAULT false
        );
END $$;

-- Enable RLS
ALTER TABLE saved_predictions ENABLE ROW LEVEL SECURITY;

-- Recreate policies
CREATE POLICY "Users can read own predictions"
    ON saved_predictions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create predictions"
    ON saved_predictions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own predictions"
    ON saved_predictions
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read public predictions"
    ON saved_predictions
    FOR SELECT
    TO public
    USING (is_public = true);