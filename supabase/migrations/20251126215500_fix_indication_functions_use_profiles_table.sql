/*
  # Fix Indication Functions to Use Correct Table

  1. Problem
    - Functions reference non-existent table "unified_profiles"
    - Should use "profiles" table instead
    - Should check "plan_type" column (not "premium_status")
    - Plan types: 'free' or 'premium'

  2. Solution
    - Update get_user_indication_limit to query profiles table
    - Check plan_type = 'premium' instead of premium_status boolean

  3. Changes
    - FROM unified_profiles → FROM profiles
    - WHERE user_id = → WHERE id =
    - premium_status → plan_type = 'premium'
*/

-- Drop and recreate get_user_indication_limit with correct table reference
DROP FUNCTION IF EXISTS get_user_indication_limit(uuid);

CREATE OR REPLACE FUNCTION get_user_indication_limit(user_id_input uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_plan_type text;
BEGIN
  SELECT plan_type
  INTO user_plan_type
  FROM profiles
  WHERE id = user_id_input;
  
  IF user_plan_type = 'premium' THEN
    RETURN 20; -- Premium: 20 per day
  ELSE
    RETURN 5; -- Free: 5 per day
  END IF;
END;
$$;

-- Verify function works
DO $$
DECLARE
  test_result integer;
BEGIN
  -- Test with first user in profiles
  SELECT get_user_indication_limit(id) INTO test_result
  FROM profiles
  LIMIT 1;
  
  IF test_result IS NULL THEN
    RAISE EXCEPTION 'get_user_indication_limit function returned NULL';
  END IF;
  
  IF test_result NOT IN (5, 20) THEN
    RAISE EXCEPTION 'get_user_indication_limit returned invalid value: %', test_result;
  END IF;
END $$;

-- Add helpful comment
COMMENT ON FUNCTION get_user_indication_limit IS 'Returns daily indication limit: 5 for free users, 20 for premium users. Uses profiles.plan_type column.';
