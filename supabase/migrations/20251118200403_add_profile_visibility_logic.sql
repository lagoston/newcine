/*
  # Add Profile Visibility Logic

  1. New Functions
    - `get_visible_profiles`: Returns profiles visible to the current user
      - Shows all 'public' profiles
      - Shows 'followers_only' profiles only if user follows them
      - Always shows user's own profile

  2. Security
    - Function respects profile_visibility setting
    - Only shows profiles user has permission to see
*/

-- Function to get profiles visible to current user
CREATE OR REPLACE FUNCTION get_visible_profiles(
  p_user_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  plan_type text,
  avatar_frame text,
  banner text,
  active_tag jsonb,
  profile_visibility text,
  followers_count bigint,
  following_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.avatar_url,
    p.bio,
    p.plan_type,
    p.avatar_frame,
    p.banner,
    p.active_tag,
    p.profile_visibility,
    (SELECT count(*) FROM follows WHERE following_id = p.id) as followers_count,
    (SELECT count(*) FROM follows WHERE follower_id = p.id) as following_count
  FROM profiles p
  WHERE 
    -- Always show own profile
    p.id = p_user_id
    OR
    -- Show public profiles
    p.profile_visibility = 'public'
    OR
    -- Show followers_only profiles if user follows them
    (
      p.profile_visibility = 'followers_only' 
      AND EXISTS (
        SELECT 1 FROM follows 
        WHERE follower_id = p_user_id 
        AND following_id = p.id
      )
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to search profiles with visibility respect
CREATE OR REPLACE FUNCTION search_visible_profiles(
  p_user_id uuid,
  p_search_query text,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  plan_type text,
  avatar_frame text,
  banner text,
  active_tag jsonb,
  profile_visibility text,
  followers_count bigint,
  following_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.avatar_url,
    p.bio,
    p.plan_type,
    p.avatar_frame,
    p.banner,
    p.active_tag,
    p.profile_visibility,
    (SELECT count(*) FROM follows WHERE following_id = p.id) as followers_count,
    (SELECT count(*) FROM follows WHERE follower_id = p.id) as following_count
  FROM profiles p
  WHERE 
    (
      -- Always show own profile
      p.id = p_user_id
      OR
      -- Show public profiles
      p.profile_visibility = 'public'
      OR
      -- Show followers_only profiles if user follows them
      (
        p.profile_visibility = 'followers_only' 
        AND EXISTS (
          SELECT 1 FROM follows 
          WHERE follower_id = p_user_id 
          AND following_id = p.id
        )
      )
    )
    AND
    (
      -- Search in username or bio
      p.username ILIKE '%' || p_search_query || '%'
      OR
      p.bio ILIKE '%' || p_search_query || '%'
    )
  ORDER BY p.username
  LIMIT p_limit;
END;
$$;
