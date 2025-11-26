/*
  # Fix Delete Account Function - Update Indications Reference

  1. Problem
    - delete_user_account() function still references old "recommendations" table
    - Should reference new "friend_indications" table

  2. Solution
    - Drop and recreate function with correct table reference
    - Maintain all other functionality
*/

-- Drop existing function
DROP FUNCTION IF EXISTS delete_user_account(uuid);

-- Recreate the delete account function with correct table reference
CREATE OR REPLACE FUNCTION delete_user_account(user_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete friend indications (sent and received)
  DELETE FROM friend_indications 
  WHERE from_user_id = user_id_param OR to_user_id = user_id_param;

  -- Delete follows (follower and following)
  DELETE FROM follows 
  WHERE follower_id = user_id_param OR following_id = user_id_param;

  -- Delete user's personal lists and list movies
  DELETE FROM list_movies 
  WHERE list_id IN (SELECT id FROM personal_lists WHERE user_id = user_id_param);
  
  DELETE FROM personal_lists 
  WHERE user_id = user_id_param;

  -- Delete user's movies and ratings
  DELETE FROM user_movies 
  WHERE user_id = user_id_param;

  -- Delete user's tickets
  DELETE FROM user_tickets 
  WHERE user_id = user_id_param;

  -- Delete user's archetype data
  DELETE FROM user_archetypes 
  WHERE user_id = user_id_param;

  -- Delete user's subcategory answers
  DELETE FROM user_subcategory_answers 
  WHERE user_id = user_id_param;

  -- Delete user's recommendation history
  DELETE FROM user_recommendation_history 
  WHERE user_id = user_id_param;

  -- Delete watched episodes
  DELETE FROM watched_episodes 
  WHERE user_id = user_id_param;

  -- Delete follower notification logs
  DELETE FROM follower_notifications_log 
  WHERE from_user_id = user_id_param OR to_user_id = user_id_param;

  -- Delete unified profile
  DELETE FROM unified_profiles 
  WHERE user_id = user_id_param;

  -- Delete profile
  DELETE FROM profiles 
  WHERE id = user_id_param;

  -- Delete auth user (this should cascade to everything else)
  DELETE FROM auth.users 
  WHERE id = user_id_param;
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION delete_user_account IS 'Deletes all user data including friend_indications, follows, lists, ratings, etc. Use with caution!';
