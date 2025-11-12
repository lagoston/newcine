/*
  # Incluir Perfil Próprio na Comunidade
  
  1. Alterações
    - Modifica `get_suggested_users` para sempre incluir o perfil do usuário atual
    - O perfil próprio aparece com tipo de sugestão 'own_profile'
    - Mantém todas as outras funcionalidades intactas
  
  2. Motivo
    - Usuários devem ver seu próprio perfil na lista da comunidade
    - Facilita navegação para o próprio perfil
*/

CREATE OR REPLACE FUNCTION get_suggested_users(p_user_id uuid, p_limit integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz,
  plan_type text,
  avatar_frame text,
  banner text,
  active_tag jsonb,
  followers_count bigint,
  following_count bigint,
  common_followers_count bigint,
  is_following boolean,
  is_follower boolean,
  suggestion_type text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH user_following AS (
    SELECT following_id 
    FROM follows 
    WHERE follower_id = p_user_id
  ),
  user_followers AS (
    SELECT follower_id 
    FROM follows 
    WHERE following_id = p_user_id
  ),
  own_profile AS (
    -- SEMPRE incluir o próprio perfil primeiro
    SELECT 
      p.id,
      p.username,
      p.avatar_url,
      p.bio,
      p.created_at,
      p.updated_at,
      p.plan_type,
      p.avatar_frame,
      p.banner,
      p.active_tag,
      0::bigint as common_count,
      'own_profile' as suggestion_type
    FROM profiles p
    WHERE p.id = p_user_id
  ),
  common_followers_profiles AS (
    SELECT DISTINCT 
      p.id,
      p.username,
      p.avatar_url,
      p.bio,
      p.created_at,
      p.updated_at,
      p.plan_type,
      p.avatar_frame,
      p.banner,
      p.active_tag,
      COUNT(DISTINCT cf.follower_id) as common_count,
      'common_followers' as suggestion_type
    FROM profiles p
    INNER JOIN follows f ON f.following_id = p.id
    INNER JOIN follows cf ON cf.following_id = f.follower_id
    WHERE cf.follower_id = p_user_id
      AND p.id != p_user_id
      AND p.id NOT IN (SELECT following_id FROM user_following)
    GROUP BY p.id, p.username, p.avatar_url, p.bio, p.created_at, p.updated_at, 
             p.plan_type, p.avatar_frame, p.banner, p.active_tag
    HAVING COUNT(DISTINCT cf.follower_id) > 0
    ORDER BY common_count DESC
    LIMIT 10
  ),
  following_profiles AS (
    SELECT 
      p.id,
      p.username,
      p.avatar_url,
      p.bio,
      p.created_at,
      p.updated_at,
      p.plan_type,
      p.avatar_frame,
      p.banner,
      p.active_tag,
      0 as common_count,
      'following' as suggestion_type
    FROM profiles p
    INNER JOIN user_following uf ON uf.following_id = p.id
    WHERE p.id != p_user_id
    LIMIT 5
  ),
  follower_profiles AS (
    SELECT 
      p.id,
      p.username,
      p.avatar_url,
      p.bio,
      p.created_at,
      p.updated_at,
      p.plan_type,
      p.avatar_frame,
      p.banner,
      p.active_tag,
      0 as common_count,
      'follower' as suggestion_type
    FROM profiles p
    INNER JOIN user_followers ufr ON ufr.follower_id = p.id
    WHERE p.id != p_user_id
      AND p.id NOT IN (SELECT following_id FROM user_following)
    LIMIT 5
  ),
  random_profiles AS (
    SELECT 
      p.id,
      p.username,
      p.avatar_url,
      p.bio,
      p.created_at,
      p.updated_at,
      p.plan_type,
      p.avatar_frame,
      p.banner,
      p.active_tag,
      0 as common_count,
      'random' as suggestion_type
    FROM profiles p
    WHERE p.id != p_user_id
      AND p.id NOT IN (SELECT following_id FROM user_following)
      AND p.id NOT IN (SELECT id FROM common_followers_profiles)
      AND p.id NOT IN (SELECT id FROM follower_profiles)
    ORDER BY RANDOM()
    LIMIT 10
  ),
  all_suggestions AS (
    SELECT * FROM own_profile
    UNION ALL
    SELECT * FROM common_followers_profiles
    UNION ALL
    SELECT * FROM following_profiles
    UNION ALL
    SELECT * FROM follower_profiles
    UNION ALL
    SELECT * FROM random_profiles
  )
  SELECT 
    s.id,
    s.username,
    s.avatar_url,
    s.bio,
    s.created_at,
    s.updated_at,
    s.plan_type,
    s.avatar_frame,
    s.banner,
    s.active_tag,
    COALESCE((SELECT COUNT(*)::bigint FROM follows WHERE following_id = s.id), 0) as followers_count,
    COALESCE((SELECT COUNT(*)::bigint FROM follows WHERE follower_id = s.id), 0) as following_count,
    s.common_count as common_followers_count,
    EXISTS(SELECT 1 FROM user_following WHERE following_id = s.id) as is_following,
    EXISTS(SELECT 1 FROM user_followers WHERE follower_id = s.id) as is_follower,
    s.suggestion_type
  FROM all_suggestions s
  LIMIT p_limit;
END;
$$;
