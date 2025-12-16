/*
  # Filter Unverified Email Accounts from Community

  1. Changes to Functions
    - `get_visible_profiles`: Now only shows profiles with verified emails
    - `search_visible_profiles`: Now only shows profiles with verified emails
  
  2. Security
    - Unverified email accounts are hidden from the community
    - Only verified accounts appear in public visibility lists
    - Unverified users still see their own profile and can continue using the app
    - Once email is verified, user automatically appears in community

  3. Notes
    - Uses auth.users.email_confirmed_at field to check verification status
    - Unverified accounts can still access their profile and use private features
    - Spam attempts without email verification are completely hidden
*/

-- Update get_visible_profiles to filter unverified emails
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
  INNER JOIN auth.users u ON p.id = u.id
  WHERE 
    -- Only show profiles with verified emails (or current user)
    (u.email_confirmed_at IS NOT NULL OR p.id = p_user_id)
    AND
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
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Update search_visible_profiles to filter unverified emails
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
  INNER JOIN auth.users u ON p.id = u.id
  WHERE 
    -- Only show profiles with verified emails (or current user)
    (u.email_confirmed_at IS NOT NULL OR p.id = p_user_id)
    AND
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
