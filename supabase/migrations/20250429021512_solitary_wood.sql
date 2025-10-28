/*
  # Add frame_id column to profiles table

  1. Changes
    - Add `frame_id` column to `profiles` table with default value 'default'
    - Column is nullable to allow for cases where no frame is selected
    
  2. Notes
    - Using DO block with IF NOT EXISTS check for safety
    - Default value ensures existing profiles get a valid frame
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'frame_id'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN frame_id text DEFAULT 'default';
  END IF;
END $$;