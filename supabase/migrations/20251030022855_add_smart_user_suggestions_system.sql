/*
  # Sistema de Sugestões Inteligentes de Usuários

  ## Objetivo
  Criar sistema que sugere usuários relevantes limitando quantidade total exibida.
  
  ## Estratégia de Sugestões
  1. Usuários com seguidores em comum (maior prioridade)
  2. Usuários seguidos pelo próprio usuário
  3. Usuários que seguem o usuário
  4. Usuários aleatórios para descoberta
  
  ## Limites
  - Máximo 30 usuários sugeridos
  - Diversificação nas sugestões
*/

-- Função para obter sugestões inteligentes de usuários
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
    -- IDs que o usuário segue
    SELECT following_id 
    FROM follows 
    WHERE follower_id = p_user_id
  ),
  user_followers AS (
    -- IDs que seguem o usuário
    SELECT follower_id 
    FROM follows 
    WHERE following_id = p_user_id
  ),
  common_followers_profiles AS (
    -- Usuários com seguidores em comum (maior prioridade)
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
    -- Usuários que o usuário já segue
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
    -- Usuários que seguem o usuário
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
    INNER JOIN user_followers ufl ON ufl.follower_id = p.id
    WHERE p.id != p_user_id
      AND p.id NOT IN (SELECT following_id FROM user_following)
    LIMIT 5
  ),
  random_profiles AS (
    -- Usuários aleatórios para descoberta
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
      'discover' as suggestion_type
    FROM profiles p
    WHERE p.id != p_user_id
      AND p.id NOT IN (SELECT following_id FROM user_following)
      AND p.id NOT IN (SELECT id FROM common_followers_profiles)
      AND p.id NOT IN (SELECT id FROM follower_profiles)
    ORDER BY RANDOM()
    LIMIT 10
  ),
  all_suggestions AS (
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
    COALESCE((SELECT COUNT(*) FROM follows WHERE following_id = s.id), 0) as followers_count,
    COALESCE((SELECT COUNT(*) FROM follows WHERE follower_id = s.id), 0) as following_count,
    s.common_count as common_followers_count,
    EXISTS(SELECT 1 FROM user_following WHERE following_id = s.id) as is_following,
    EXISTS(SELECT 1 FROM user_followers WHERE follower_id = s.id) as is_follower,
    s.suggestion_type
  FROM all_suggestions s
  ORDER BY 
    -- Priorizar: seguidores em comum > seguindo > seguidores > aleatórios
    CASE s.suggestion_type
      WHEN 'common_followers' THEN 1
      WHEN 'following' THEN 2
      WHEN 'follower' THEN 3
      WHEN 'discover' THEN 4
    END,
    s.common_count DESC,
    RANDOM()
  LIMIT p_limit;
END;
$$;

-- Comentários
COMMENT ON FUNCTION get_suggested_users IS 'Retorna sugestões inteligentes de usuários com limite configurável';

-- Estatísticas
DO $$
BEGIN
  RAISE NOTICE '=== Sistema de Sugestões Inteligentes ===';
  RAISE NOTICE 'Função criada: get_suggested_users(user_id, limit)';
  RAISE NOTICE '';
  RAISE NOTICE 'Estratégia de Sugestões:';
  RAISE NOTICE '  1. Usuários com seguidores em comum (10 max)';
  RAISE NOTICE '  2. Usuários seguidos (5 max)';
  RAISE NOTICE '  3. Usuários que seguem (5 max)';
  RAISE NOTICE '  4. Usuários aleatórios (10 max)';
  RAISE NOTICE '';
  RAISE NOTICE 'Limite padrão: 30 usuários';
  RAISE NOTICE 'Uso: SELECT * FROM get_suggested_users(''user-uuid'', 30);';
END $$;