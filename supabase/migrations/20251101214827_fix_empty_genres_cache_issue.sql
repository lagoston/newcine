/*
  # Corrigir Sistema de Pontos - Cache Vazio

  ## Problema Identificado
  Usuários com filmes que têm `genres = []` (array vazio) no cache não recebem pontos,
  pois a função verifica apenas `IS NOT NULL`, mas `[]` não é NULL.

  ## Solução
  1. Corrigir função `recalculate_user_spectrogram_with_cache` para ignorar cache vazio
  2. Popular cache do filme 448341 que está com `[]`
  3. Recalcular todos os usuários afetados

  ## Impacto
  - Gustavo e possivelmente outros usuários terão seus pontos corrigidos
*/

-- 1. Corrigir função recalculate_user_spectrogram_with_cache
CREATE OR REPLACE FUNCTION recalculate_user_spectrogram_with_cache(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_rating RECORD;
  movie_genres jsonb;
  total_ratings integer := 0;
  processed integer := 0;
  skipped integer := 0;
  result json;
BEGIN
  -- Resetar pontos do usuário
  UPDATE profiles
  SET 
    pontos_e = 0,
    pontos_i = 0,
    pontos_c = 0,
    pontos_s = 0,
    pontos_r = 0,
    arquetipo_primario = NULL,
    arquetipo_secundario = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Contar total de avaliações
  SELECT COUNT(*) INTO total_ratings
  FROM user_movies
  WHERE user_id = p_user_id
    AND rating IS NOT NULL;
  
  -- Processar cada avaliação do usuário
  FOR user_rating IN
    SELECT um.movie_id, um.rating
    FROM user_movies um
    WHERE um.user_id = p_user_id
      AND um.rating IS NOT NULL
  LOOP
    -- Buscar gêneros do cache
    movie_genres := get_movie_genres(user_rating.movie_id);
    
    -- CORRIGIDO: Verificar se não é NULL E não é array vazio
    IF movie_genres IS NOT NULL AND jsonb_array_length(movie_genres) > 0 THEN
      -- Atualizar pontos para esta avaliação
      PERFORM update_user_spectrogram_points(
        p_user_id,
        movie_genres,
        user_rating.rating::numeric,
        NULL
      );
      processed := processed + 1;
    ELSE
      skipped := skipped + 1;
    END IF;
  END LOOP;
  
  -- Construir resultado
  result := json_build_object(
    'user_id', p_user_id,
    'total_ratings', total_ratings,
    'processed_ratings', processed,
    'skipped_ratings', skipped,
    'cache_coverage_percent', ROUND((processed::numeric / NULLIF(total_ratings, 0)::numeric * 100), 2),
    'status', 'completed'
  );
  
  RETURN result;
END;
$$;

COMMENT ON FUNCTION recalculate_user_spectrogram_with_cache(uuid) IS 
  'Recalcula espectrograma usando cache de gêneros. IGNORA filmes com cache vazio ou NULL.';

-- 2. Remover entrada com cache vazio do filme 448341 para forçar repopulação
DELETE FROM movie_genres_cache WHERE movie_id = 448341 AND genres = '[]'::jsonb;

-- 3. Função auxiliar para identificar usuários afetados por cache vazio
CREATE OR REPLACE FUNCTION get_users_with_empty_cache_movies()
RETURNS TABLE (
  user_id uuid,
  username text,
  movies_with_empty_cache integer,
  total_movies integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.username,
    COUNT(DISTINCT CASE WHEN mgc.genres = '[]'::jsonb THEN um.movie_id END)::integer as movies_with_empty_cache,
    COUNT(DISTINCT um.movie_id)::integer as total_movies
  FROM profiles p
  INNER JOIN user_movies um ON um.user_id = p.id
  LEFT JOIN movie_genres_cache mgc ON mgc.movie_id = um.movie_id
  WHERE um.rating IS NOT NULL
  GROUP BY p.id, p.username
  HAVING COUNT(DISTINCT CASE WHEN mgc.genres = '[]'::jsonb THEN um.movie_id END) > 0
  ORDER BY movies_with_empty_cache DESC;
END;
$$;

COMMENT ON FUNCTION get_users_with_empty_cache_movies() IS 
  'Identifica usuários com filmes que têm cache vazio (necessitam repopulação)';
