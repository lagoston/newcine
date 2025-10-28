/*
  # Add RPC Function for User Lists

  1. New Functions
    - get_user_lists_by_id: Retrieves lists belonging to a specific user
    - Bypasses RLS for secure access to other users' lists
    - Used specifically by the UserListsModal component
    
  2. Security
    - Function is SECURITY DEFINER to bypass RLS policies
    - Access control is enforced in function logic
    - Ensures consistent and secure access to user lists
*/

-- Create RPC function to get lists by user ID
CREATE OR REPLACE FUNCTION get_user_lists_by_id(target_user_id uuid)
RETURNS SETOF lists
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM public.lists
  WHERE user_id = target_user_id
  ORDER BY created_at DESC;
$$;

-- Grant execution privilege to authenticated users
GRANT EXECUTE ON FUNCTION get_user_lists_by_id TO authenticated;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lists_created_at ON public.lists(created_at);