/*
  # Add Delete Account Functionality

  1. New Functions
    - `delete_user_account(user_id_param uuid)` - Permanently deletes all user data
    
  2. Details
    - Deletes from ALL tables that reference the user
    - Includes: recommendations, follows, lists, user_movies, user_tickets, profiles, etc.
    - Also deletes Stripe data: stripe_customers, stripe_subscriptions
    - Deletes auth.users record (cascade handles remaining references)
    - Operation is IRREVERSIBLE and COMPLETE
    
  3. Security
    - Function is SECURITY DEFINER to allow deletion of auth.users
    - User can only delete their own account
    - All deletions are permanent
*/

-- Create function to permanently delete user account and all associated data
CREATE OR REPLACE FUNCTION delete_user_account(user_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  customer_id_var text;
  rows_count integer;
  total_deleted integer := 0;
BEGIN
  -- Security check: user can only delete their own account
  IF auth.uid() != user_id_param THEN
    RAISE EXCEPTION 'Unauthorized: You can only delete your own account';
  END IF;

  -- Get customer_id before deleting stripe_customers
  SELECT customer_id INTO customer_id_var
  FROM stripe_customers
  WHERE user_id = user_id_param;

  -- Delete recommendations (sent and received)
  DELETE FROM recommendations WHERE from_user_id = user_id_param OR to_user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete follower notifications
  DELETE FROM follower_notifications_log WHERE from_user_id = user_id_param OR to_user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete follows (following and followers)
  DELETE FROM follows WHERE follower_id = user_id_param OR following_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete list_movies for user's lists
  DELETE FROM list_movies WHERE list_id IN (SELECT id FROM lists WHERE user_id = user_id_param);
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete lists
  DELETE FROM lists WHERE user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete user_movies (ratings)
  DELETE FROM user_movies WHERE user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete user_subcategory_responses
  DELETE FROM user_subcategory_responses WHERE user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete user_recommendation_history
  DELETE FROM user_recommendation_history WHERE user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete feedback
  DELETE FROM feedback WHERE user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete user_tickets
  DELETE FROM user_tickets WHERE user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete stripe_subscriptions (if customer_id exists)
  IF customer_id_var IS NOT NULL THEN
    DELETE FROM stripe_subscriptions WHERE customer_id = customer_id_var;
    GET DIAGNOSTICS rows_count = ROW_COUNT;
    total_deleted := total_deleted + rows_count;
  END IF;

  -- Delete stripe_customers
  DELETE FROM stripe_customers WHERE user_id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Delete profile (this will cascade to any remaining references)
  DELETE FROM profiles WHERE id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Finally, delete the auth.users record (CASCADE will handle any remaining references)
  DELETE FROM auth.users WHERE id = user_id_param;
  GET DIAGNOSTICS rows_count = ROW_COUNT;
  total_deleted := total_deleted + rows_count;

  -- Return summary of deleted data
  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_id_param,
    'deleted_at', now(),
    'total_rows_deleted', total_deleted,
    'message', 'Account and all associated data permanently deleted'
  );

EXCEPTION WHEN OTHERS THEN
  -- If anything fails, return error
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'user_id', user_id_param
  );
END;
$$;

-- Add comment
COMMENT ON FUNCTION delete_user_account IS 'Permanently deletes a user account and ALL associated data. This operation is irreversible.';