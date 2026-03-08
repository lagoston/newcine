/*
  # Fix delete_user_account function

  1. Problem
    - Function body references tables that don't exist:
      - personal_lists (correct name: lists)
      - user_archetypes (doesn't exist; data lives in profiles columns)
      - user_subcategory_answers (correct name: user_subcategory_responses)
      - unified_profiles (doesn't exist)
    - Function returns void but frontend expects jsonb with success field

  2. Solution
    - Drop and recreate with correct table names
    - Return jsonb so the caller can confirm success
*/

DROP FUNCTION IF EXISTS delete_user_account(uuid);

CREATE OR REPLACE FUNCTION delete_user_account(user_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security check: only allow users to delete their own account
  IF auth.uid() IS DISTINCT FROM user_id_param THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Delete friend indications
  DELETE FROM friend_indications
  WHERE from_user_id = user_id_param OR to_user_id = user_id_param;

  -- Delete follows
  DELETE FROM follows
  WHERE follower_id = user_id_param OR following_id = user_id_param;

  -- Delete follower notification logs
  DELETE FROM follower_notifications_log
  WHERE from_user_id = user_id_param OR to_user_id = user_id_param;

  -- Delete list movies for user's lists, then lists
  DELETE FROM list_movies
  WHERE list_id IN (SELECT id FROM lists WHERE user_id = user_id_param);

  DELETE FROM lists
  WHERE user_id = user_id_param;

  -- Delete user reviews
  DELETE FROM reviews
  WHERE user_id = user_id_param;

  -- Delete user movies and ratings
  DELETE FROM user_movies
  WHERE user_id = user_id_param;

  -- Delete user tickets
  DELETE FROM user_tickets
  WHERE user_id = user_id_param;

  -- Delete subcategory responses
  DELETE FROM user_subcategory_responses
  WHERE user_id = user_id_param;

  -- Delete recommendation history
  DELETE FROM user_recommendation_history
  WHERE user_id = user_id_param;

  -- Delete watched episodes
  DELETE FROM watched_episodes
  WHERE user_id = user_id_param;

  -- Delete daily recommendation entry
  DELETE FROM daily_recommendation
  WHERE user_id = user_id_param;

  -- Delete stripe data
  DELETE FROM stripe_subscriptions
  WHERE customer_id IN (SELECT customer_id FROM stripe_customers WHERE user_id = user_id_param);

  DELETE FROM stripe_customers
  WHERE user_id = user_id_param;

  -- Delete profile
  DELETE FROM profiles
  WHERE id = user_id_param;

  -- Delete auth user (cascades to remaining references)
  DELETE FROM auth.users
  WHERE id = user_id_param;

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_user_account(uuid) TO authenticated;
