/*
  # Helpers para Popular Cache de Gêneros e Recalcular Usuários

  ## Funções
  1. get_uncached_movie_ids - Retorna IDs de filmes que não têm gêneros em cache
  2. bulk_recalculate_all_users - Recalcula espectrograma de todos os usuários após cache populado
  
  ## Processo
  1. Edge function popula cache de gêneros via TMDB
  2. Esta migration permite recalcular todos os usuários de uma vez
*/

-- 1. Função para obter IDs de filmes que não têm gêneros em cache
CREATE OR REPLACE FUNCTION get_uncached_movie_ids()
RETURNS TABLE (movie_id integer)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT um.movie_id
  FROM user_movies um
  WHERE um.rating IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 
      FROM movie_genres_cache mgc 
      WHERE mgc.movie_id = um.movie_id
    )
  ORDER BY um.movie_id;
END;
$$;

-- 2. Função para recalcular TODOS os usuários de uma vez
CREATE OR REPLACE FUNCTION bulk_recalculate_all_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
  total_users integer := 0;
  successful integer := 0;
  failed integer := 0;
  user_result json;
BEGIN
  RAISE NOTICE 'Iniciando recálculo em massa de todos os usuários...';
  
  -- Contar total de usuários com avaliações
  SELECT COUNT(DISTINCT um.user_id) INTO total_users
  FROM user_movies um
  WHERE um.rating IS NOT NULL;
  
  RAISE NOTICE 'Total de usuários para processar: %', total_users;
  
  -- Processar cada usuário
  FOR user_record IN
    SELECT DISTINCT p.id, p.username
    FROM profiles p
    INNER JOIN user_movies um ON um.user_id = p.id
    WHERE um.rating IS NOT NULL
    ORDER BY p.created_at ASC
  LOOP
    BEGIN
      -- Recalcular usando função com cache
      user_result := recalculate_user_spectrogram_with_cache(user_record.id);
      successful := successful + 1;
      
      RAISE NOTICE 'Usuário % (%) processado: %', 
        user_record.username, 
        user_record.id, 
        user_result->>'processed_ratings';
        
    EXCEPTION WHEN OTHERS THEN
      failed := failed + 1;
      RAISE WARNING 'Erro ao processar usuário % (%): %', 
        user_record.username, 
        user_record.id, 
        SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Recálculo completo! Sucesso: %, Falhas: %, Total: %', 
    successful, failed, total_users;
  
  RETURN json_build_object(
    'status', 'completed',
    'total_users', total_users,
    'successful', successful,
    'failed', failed,
    'success_rate_percent', ROUND((successful::numeric / NULLIF(total_users, 0)::numeric * 100), 2)
  );
END;
$$;

-- 3. Função auxiliar para verificar status do cache
CREATE OR REPLACE FUNCTION check_cache_status()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  total_movies_rated bigint;
  movies_cached bigint;
  cache_percent numeric;
  uncached_count bigint;
BEGIN
  SELECT COUNT(DISTINCT movie_id) INTO total_movies_rated
  FROM user_movies
  WHERE rating IS NOT NULL;
  
  SELECT COUNT(*) INTO movies_cached
  FROM movie_genres_cache;
  
  SELECT COUNT(*) INTO uncached_count
  FROM get_uncached_movie_ids();
  
  IF total_movies_rated > 0 THEN
    cache_percent := ROUND((movies_cached::numeric / total_movies_rated::numeric * 100), 2);
  ELSE
    cache_percent := 0;
  END IF;
  
  RETURN json_build_object(
    'total_movies_rated', total_movies_rated,
    'movies_cached', movies_cached,
    'uncached_movies', uncached_count,
    'cache_coverage_percent', cache_percent,
    'ready_for_recalculation', cache_percent = 100
  );
END;
$$;

-- 4. Comentários
COMMENT ON FUNCTION get_uncached_movie_ids() IS 'Retorna IDs de filmes avaliados que não têm gêneros em cache';
COMMENT ON FUNCTION bulk_recalculate_all_users() IS 'Recalcula espectrograma de TODOS os usuários de uma vez (usar após popular cache)';
COMMENT ON FUNCTION check_cache_status() IS 'Verifica status do cache de gêneros e se está pronto para recalcular';

-- 5. Verificar status atual
DO $$
DECLARE
  status_result json;
BEGIN
  status_result := check_cache_status();
  
  RAISE NOTICE '=== STATUS DO CACHE DE GÊNEROS ===';
  RAISE NOTICE 'Filmes únicos avaliados: %', status_result->>'total_movies_rated';
  RAISE NOTICE 'Filmes com gêneros em cache: %', status_result->>'movies_cached';
  RAISE NOTICE 'Filmes sem cache: %', status_result->>'uncached_movies';
  RAISE NOTICE 'Cobertura do cache: %%%', status_result->>'cache_coverage_percent';
  RAISE NOTICE '';
  
  IF (status_result->>'ready_for_recalculation')::boolean THEN
    RAISE NOTICE 'Cache completo! Execute: SELECT bulk_recalculate_all_users();';
  ELSE
    RAISE NOTICE 'PRÓXIMOS PASSOS:';
    RAISE NOTICE '1. Chame a edge function: populate-genres-cache';
    RAISE NOTICE '2. Após completar, execute: SELECT bulk_recalculate_all_users();';
  END IF;
END $$;