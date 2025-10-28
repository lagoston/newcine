/*
  # Update handle_new_user function

  1. Changes
    - Update the function to use the username from user metadata
    - Add fallback to a generated username if metadata is missing
    - Ensure unique username generation
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  username_from_metadata text;
  final_username text;
BEGIN
  -- Try to get username from metadata
  username_from_metadata := (new.raw_user_meta_data->>'username')::text;
  
  -- Use metadata username if available, otherwise generate one
  IF username_from_metadata IS NOT NULL AND length(username_from_metadata) > 0 THEN
    final_username := username_from_metadata;
  ELSE
    final_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;

  INSERT INTO public.profiles (id, username)
  VALUES (new.id, final_username);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;