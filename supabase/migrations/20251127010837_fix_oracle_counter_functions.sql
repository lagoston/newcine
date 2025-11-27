/*
  # Fix Oracle Counter Functions

  1. Changes
    - Fix increment_oracle_predictions to use correct column name (id instead of user_id)
    - Fix increment_oracle_recommendations to use correct column name (id instead of user_id)
  
  2. Notes
    - profiles table uses 'id' as primary key, not 'user_id'
*/

-- Drop and recreate function to increment oracle predictions count
DROP FUNCTION IF EXISTS increment_oracle_predictions(UUID);

CREATE FUNCTION increment_oracle_predictions(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET oracle_predictions_count = COALESCE(oracle_predictions_count, 0) + 1
  WHERE id = p_user_id;
END;
$$;

-- Drop and recreate function to increment oracle recommendations count
DROP FUNCTION IF EXISTS increment_oracle_recommendations(UUID);

CREATE FUNCTION increment_oracle_recommendations(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET oracle_recommendations_count = COALESCE(oracle_recommendations_count, 0) + 1
  WHERE id = p_user_id;
END;
$$;
