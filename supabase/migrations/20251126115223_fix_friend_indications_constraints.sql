/*
  # Fix Friend Indications Foreign Key Constraints

  1. Problem
    - Foreign key constraint names still reference old "recommendations" table
    - This causes JOIN errors in queries
    - WhispersModal can't load data
    - Indication sending fails

  2. Solution
    - Drop old foreign key constraints
    - Create new constraints with correct naming
    - Maintain same relationships (from_user_id, to_user_id -> profiles)

  3. Changes
    - Drop: recommendations_from_user_id_fkey
    - Drop: recommendations_to_user_id_fkey
    - Create: friend_indications_from_user_id_fkey
    - Create: friend_indications_to_user_id_fkey
*/

-- Drop old constraints
ALTER TABLE friend_indications 
  DROP CONSTRAINT IF EXISTS recommendations_from_user_id_fkey;

ALTER TABLE friend_indications 
  DROP CONSTRAINT IF EXISTS recommendations_to_user_id_fkey;

-- Create new constraints with correct naming
ALTER TABLE friend_indications
  ADD CONSTRAINT friend_indications_from_user_id_fkey
  FOREIGN KEY (from_user_id)
  REFERENCES profiles(id)
  ON DELETE CASCADE;

ALTER TABLE friend_indications
  ADD CONSTRAINT friend_indications_to_user_id_fkey
  FOREIGN KEY (to_user_id)
  REFERENCES profiles(id)
  ON DELETE CASCADE;

-- Verify constraints exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'friend_indications_from_user_id_fkey'
    AND table_name = 'friend_indications'
  ) THEN
    RAISE EXCEPTION 'Failed to create friend_indications_from_user_id_fkey constraint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'friend_indications_to_user_id_fkey'
    AND table_name = 'friend_indications'
  ) THEN
    RAISE EXCEPTION 'Failed to create friend_indications_to_user_id_fkey constraint';
  END IF;
END $$;

-- Add helpful comment
COMMENT ON TABLE friend_indications IS 'Friend-to-friend movie/series indications. Separate from Oracle recommendations in recommendation_pools.';
