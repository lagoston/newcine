/*
  # Fix Search Path for Indication Functions

  1. Problem
    - Functions have search_path set to 'public' (with quotes)
    - PostgreSQL interprets this as a schema named literally "public"
    - Causes "relation unified_profiles does not exist" error
    - RPC calls return 404 or fail with table not found

  2. Solution
    - Recreate all indication functions with correct search_path = public (no quotes)
    - This allows functions to access tables in the public schema

  3. Functions Fixed
    - count_user_indications_today
    - get_user_indication_limit
    - can_send_indication
    - count_unread_indications
    - delete_expired_indications
*/

-- Drop all indication functions
DROP FUNCTION IF EXISTS count_user_indications_today(uuid);
DROP FUNCTION IF EXISTS get_user_indication_limit(uuid);
DROP FUNCTION IF EXISTS can_send_indication(uuid);
DROP FUNCTION IF EXISTS count_unread_indications(uuid);
DROP FUNCTION IF EXISTS delete_expired_indications();

-- Recreate: count_user_indications_today
CREATE OR REPLACE FUNCTION count_user_indications_today(user_id_input uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  indication_count integer;
BEGIN
  SELECT COUNT(*)
  INTO indication_count
  FROM friend_indications
  WHERE from_user_id = user_id_input
    AND created_at >= CURRENT_DATE
    AND created_at < CURRENT_DATE + INTERVAL '1 day';
  
  RETURN COALESCE(indication_count, 0);
END;
$$;

-- Recreate: count_unread_indications
CREATE OR REPLACE FUNCTION count_unread_indications(user_id_input uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unread_count integer;
BEGIN
  SELECT COUNT(*)
  INTO unread_count
  FROM friend_indications
  WHERE to_user_id = user_id_input
    AND read = false;
  
  RETURN COALESCE(unread_count, 0);
END;
$$;

-- Recreate: get_user_indication_limit
CREATE OR REPLACE FUNCTION get_user_indication_limit(user_id_input uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_premium boolean;
BEGIN
  SELECT premium_status
  INTO is_premium
  FROM unified_profiles
  WHERE user_id = user_id_input;
  
  IF is_premium THEN
    RETURN 20; -- Premium: 20 per day
  ELSE
    RETURN 5; -- Free: 5 per day
  END IF;
END;
$$;

-- Recreate: can_send_indication
CREATE OR REPLACE FUNCTION can_send_indication(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count integer;
  user_limit integer;
BEGIN
  current_count := count_user_indications_today(user_id_input);
  user_limit := get_user_indication_limit(user_id_input);
  
  RETURN current_count < user_limit;
END;
$$;

-- Recreate: delete_expired_indications
CREATE OR REPLACE FUNCTION delete_expired_indications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM friend_indications
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Verify all functions were created successfully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'can_send_indication'
  ) THEN
    RAISE EXCEPTION 'Failed to create can_send_indication function';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_user_indication_limit'
  ) THEN
    RAISE EXCEPTION 'Failed to create get_user_indication_limit function';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'count_user_indications_today'
  ) THEN
    RAISE EXCEPTION 'Failed to create count_user_indications_today function';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'count_unread_indications'
  ) THEN
    RAISE EXCEPTION 'Failed to create count_unread_indications function';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'delete_expired_indications'
  ) THEN
    RAISE EXCEPTION 'Failed to create delete_expired_indications function';
  END IF;
END $$;

-- Add helpful comments
COMMENT ON FUNCTION can_send_indication IS 'Checks if user can send indication today (5/day free, 20/day premium)';
COMMENT ON FUNCTION count_user_indications_today IS 'Counts indications sent by user today';
COMMENT ON FUNCTION get_user_indication_limit IS 'Returns daily indication limit based on premium status';
COMMENT ON FUNCTION count_unread_indications IS 'Counts unread indications for user';
COMMENT ON FUNCTION delete_expired_indications IS 'Deletes indications older than 30 days';
