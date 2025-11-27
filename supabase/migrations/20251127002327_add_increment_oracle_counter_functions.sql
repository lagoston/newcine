/*
  # Add Oracle Counter Increment Functions

  1. New Functions
    - `increment_oracle_predictions(p_user_id)` - Increments predictions counter
    - `increment_oracle_recommendations(p_user_id)` - Increments recommendations counter
  
  2. Security
    - Functions can be called by service role
    - Safe increment operations with COALESCE for NULL handling
*/

-- Function to increment oracle predictions count
CREATE OR REPLACE FUNCTION increment_oracle_predictions(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET oracle_predictions_count = COALESCE(oracle_predictions_count, 0) + 1
  WHERE user_id = p_user_id;
END;
$$;

-- Function to increment oracle recommendations count
CREATE OR REPLACE FUNCTION increment_oracle_recommendations(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET oracle_recommendations_count = COALESCE(oracle_recommendations_count, 0) + 1
  WHERE user_id = p_user_id;
END;
$$;
