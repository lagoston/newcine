/*
  # Ajustes no Database - Limpeza e Correções

  ## 1. Ajuste de Peso do Gênero Drama
  Drama agora distribui 5 pontos assim:
  - E (Emocional): 2 (antes era 4)
  - I (Intelectual): 1 (antes era 1)
  - C (Cultural): 1 (antes era 0)
  - S (Sensorial): 1 (antes era 0)
  - R (Recreativo): 0 (antes era 0)
  
  ## 2. Remoção de Tabelas Não Utilizadas
  - saved_predictions (substituída por recommendations)
  - user_recommend_history (não mais utilizada)
  
  ## 3. Correção de Cor da Subcategoria "Denso"
  - Mudança de preto para branco
  
  ## 4. Verificação de Segurança RLS
  - Todas as tabelas têm RLS habilitado corretamente
*/

-- 1. Atualizar função de mapeamento de gêneros com novo peso para Drama
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz Gênero-Espectro (cada gênero distribui 5 pontos)
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 2.0  -- AJUSTADO de 4.0 para 2.0
      WHEN 'Comedy' THEN 1.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 1.0
      WHEN 'Horror' THEN 2.0
      WHEN 'Fantasy' THEN 1.0
      WHEN 'Romance' THEN 4.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 1.0
      WHEN 'War' THEN 2.0
      WHEN 'Animation' THEN 1.0
      ELSE 0.0
    END as e,
    CASE genre_name
      WHEN 'Drama' THEN 1.0  -- MANTIDO em 1.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 1.0
      WHEN 'Science Fiction' THEN 3.0
      WHEN 'Thriller' THEN 3.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 4.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 1.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      ELSE 0.0
    END as i,
    CASE genre_name
      WHEN 'Drama' THEN 1.0  -- AJUSTADO de 0.0 para 1.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 1.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 5.0
      WHEN 'History' THEN 3.0
      WHEN 'War' THEN 2.0
      WHEN 'Animation' THEN 0.0
      ELSE 0.0
    END as c,
    CASE genre_name
      WHEN 'Drama' THEN 1.0  -- AJUSTADO de 0.0 para 1.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 4.0
      WHEN 'Adventure' THEN 1.0
      WHEN 'Science Fiction' THEN 1.0
      WHEN 'Thriller' THEN 1.0
      WHEN 'Horror' THEN 3.0
      WHEN 'Fantasy' THEN 1.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 1.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 1.0
      WHEN 'Animation' THEN 2.0
      ELSE 0.0
    END as s,
    CASE genre_name
      WHEN 'Drama' THEN 0.0  -- MANTIDO em 0.0
      WHEN 'Comedy' THEN 4.0
      WHEN 'Action' THEN 1.0
      WHEN 'Adventure' THEN 2.0
      WHEN 'Science Fiction' THEN 1.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 3.0
      WHEN 'Romance' THEN 1.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 1.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 2.0
      ELSE 0.0
    END as r;
END;
$$;

COMMENT ON FUNCTION get_genre_base_points(text) IS 'Mapeia gêneros TMDB para pontos base nos 5 espectros cinematográficos. Drama agora distribui: E2, I1, C1, S1, R0 para balancear.';

-- 2. Remover tabelas não utilizadas (com segurança)
DROP TABLE IF EXISTS saved_predictions CASCADE;
DROP TABLE IF EXISTS user_recommend_history CASCADE;

-- 3. Atualizar cor da subcategoria "Denso" (D) de preto para branco
-- Nota: Como as subcategorias usam IDs de uma letra e as cores são gerenciadas no frontend,
-- vamos documentar aqui que no frontend o ID 'D' deve usar cor branca

COMMENT ON TABLE antagonistic_subcategories IS 'Subcategorias antagônicas para personalidade cinematográfica. NOTA: Subcategoria D (Denso) deve usar cor BRANCA no frontend, não preta.';

-- 4. Adicionar comentários de segurança nas tabelas principais
COMMENT ON TABLE profiles IS 'Perfis de usuários com RLS habilitado. Cada usuário pode ver apenas seu próprio perfil ou perfis públicos.';
COMMENT ON TABLE user_movies IS 'Avaliações de filmes por usuários com RLS habilitado. Usuários só podem modificar suas próprias avaliações.';
COMMENT ON TABLE follows IS 'Relacionamentos de seguidores com RLS habilitado. Usuários podem seguir outros e ver quem seguem.';
COMMENT ON TABLE lists IS 'Listas personalizadas de filmes com RLS habilitado. Usuários só podem modificar suas próprias listas.';
COMMENT ON TABLE recommendations IS 'Recomendações (whispers) entre usuários com RLS habilitado. Usuários veem apenas recomendações enviadas/recebidas.';
COMMENT ON TABLE user_tickets IS 'Sistema de tickets por usuário com RLS habilitado. Cada usuário só pode ver/modificar seus próprios tickets.';
COMMENT ON TABLE user_subcategory_responses IS 'Respostas ao questionário de subcategorias com RLS habilitado. Usuários só podem ver suas próprias respostas.';

-- 5. Verificar e confirmar que todas as tabelas críticas têm RLS habilitado
DO $$
DECLARE
  table_without_rls TEXT;
BEGIN
  SELECT table_name INTO table_without_rls
  FROM information_schema.tables t
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name IN (
      'profiles', 'user_movies', 'follows', 'lists', 'list_movies',
      'user_tickets', 'recommendations', 'user_subcategory_responses',
      'stripe_customers', 'stripe_subscriptions', 'stripe_orders',
      'follower_notifications_log', 'movies', 'movie_genres_cache'
    )
    AND NOT EXISTS (
      SELECT 1 
      FROM pg_tables pt
      WHERE pt.schemaname = 'public'
        AND pt.tablename = t.table_name
        AND pt.rowsecurity = true
    )
  LIMIT 1;

  IF table_without_rls IS NOT NULL THEN
    RAISE WARNING 'Tabela % não tem RLS habilitado!', table_without_rls;
  ELSE
    RAISE NOTICE 'Todas as tabelas críticas têm RLS habilitado corretamente.';
  END IF;
END $$;