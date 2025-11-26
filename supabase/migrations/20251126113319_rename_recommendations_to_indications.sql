/*
  # Rename Friend Recommendations to Indications
  
  1. Overview
    - Renames the friend recommendation system to "indications"
    - Updates table name, column names, and function names
    - Changes daily limit from 10/week to 5/day for free users
    - Maintains all existing functionality with new terminology
  
  2. Changes
    - Rename `recommendations` table to `friend_indications`
    - Update all related functions with new naming
    - Change limit logic from weekly to daily (5 per day)
    - Premium users: 20 per day (was 50 per week)
    - Keep `recommendation_pools` separate (Oracle recommendations)
  
  3. Notes
    - Oracle recommendations remain unchanged
    - This only affects friend-to-friend movie suggestions
    - All existing data is preserved
*/

-- Rename the recommendations table to friend_indications
ALTER TABLE IF EXISTS recommendations RENAME TO friend_indications;

-- Update the daily limit functions
DROP FUNCTION IF EXISTS count_user_recommendations_this_week(uuid);
DROP FUNCTION IF EXISTS can_send_recommendation(uuid);
DROP FUNCTION IF EXISTS get_user_recommendation_limit(uuid);
DROP FUNCTION IF EXISTS count_unread_recommendations(uuid);
DROP FUNCTION IF EXISTS delete_expired_recommendations();

-- Function to count indications sent today
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

-- Function to count unread indications
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

-- Function to get user indication limit (5 per day for free, 20 for premium)
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

-- Function to check if user can send indication
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

-- Function to delete expired indications (older than 30 days)
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

-- Update cron job if it exists
DO $$
BEGIN
  -- Try to unschedule old job
  BEGIN
    PERFORM cron.unschedule('delete-expired-recommendations');
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
  
  -- Schedule new job for indications
  BEGIN
    PERFORM cron.schedule(
      'delete-expired-indications',
      '0 2 * * *', -- Runs at 2am every day
      'SELECT delete_expired_indications();'
    );
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END $$;

-- Add comment to table
COMMENT ON TABLE friend_indications IS 'Friend-to-friend movie/series indications (formerly recommendations). Separate from Oracle recommendations.';
