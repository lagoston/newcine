/*
  # Fix delete_user_account function

  ## Problem
  The function tries to DELETE FROM daily_recommendation WHERE user_id = user_id_param,
  but the daily_recommendation table is a global table with no user_id column
  (columns: id, movie_id, recommendation_date, created_at).
  This causes: column "user_id" does not exist.

  ## Solution
  Remove the daily_recommendation DELETE line since it is a global table,
  not per-user data.
*/

CREATE OR REPLACE FUNCTION delete_user_account(user_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM user_id_param THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  DELETE FROM friend_indications
  WHERE from_user_id = user_id_param OR to_user_id = user_id_param;

  DELETE FROM follows
  WHERE follower_id = user_id_param OR following_id = user_id_param;

  DELETE FROM follower_notifications_log
  WHERE from_user_id = user_id_param OR to_user_id = user_id_param;

  DELETE FROM list_movies
  WHERE list_id IN (SELECT id FROM lists WHERE user_id = user_id_param);

  DELETE FROM lists
  WHERE user_id = user_id_param;

  DELETE FROM reviews
  WHERE user_id = user_id_param;

  DELETE FROM user_movies
  WHERE user_id = user_id_param;

  DELETE FROM user_tickets
  WHERE user_id = user_id_param;

  DELETE FROM user_subcategory_responses
  WHERE user_id = user_id_param;

  DELETE FROM user_recommendation_history
  WHERE user_id = user_id_param;

  DELETE FROM watched_episodes
  WHERE user_id = user_id_param;

  DELETE FROM stripe_subscriptions
  WHERE customer_id IN (SELECT customer_id FROM stripe_customers WHERE user_id = user_id_param);

  DELETE FROM stripe_customers
  WHERE user_id = user_id_param;

  DELETE FROM profiles
  WHERE id = user_id_param;

  DELETE FROM auth.users
  WHERE id = user_id_param;

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_user_account(uuid) TO authenticated;
