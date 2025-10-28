/*
  # Add avatar_frame column to profiles table

  1. Changes
    - Add `avatar_frame` column to `profiles` table with default empty string
    - Column allows storing the selected frame identifier
    
  2. Notes
    - Using DO block with IF NOT EXISTS check for safety
    - Default empty string ensures existing profiles get a valid state
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'avatar_frame'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN avatar_frame text DEFAULT '';
  END IF;
END $$;