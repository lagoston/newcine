/*
  # Corrigir função bulk_recalculate e executar processo completo

  ## Correções
  1. Corrigir SELECT DISTINCT com ORDER BY
  2. Popular cache de gêneros
  3. Recalcular todos os usuários
*/

-- 1. Corrigir função bulk_recalculate_all_users
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
  SELECT COUNT(*) INTO total_users
  FROM (
    SELECT DISTINCT p.id
    FROM profiles p
    INNER JOIN user_movies um ON um.user_id = p.id
    WHERE um.rating IS NOT NULL
  ) subq;
  
  RAISE NOTICE 'Total de usuários para processar: %', total_users;
  
  -- Processar cada usuário
  FOR user_record IN
    SELECT p.id, p.username, p.created_at
    FROM profiles p
    WHERE EXISTS (
      SELECT 1 FROM user_movies um 
      WHERE um.user_id = p.id AND um.rating IS NOT NULL
    )
    ORDER BY p.created_at ASC
  LOOP
    BEGIN
      -- Recalcular usando função com cache
      user_result := recalculate_user_spectrogram_with_cache(user_record.id);
      successful := successful + 1;
      
      IF (successful % 5 = 0) THEN
        RAISE NOTICE 'Progresso: %/%', successful, total_users;
      END IF;
        
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

-- 2. Popular cache de gêneros a partir da tabela movies
DO $$
DECLARE
  movie_record RECORD;
  total_cached integer := 0;
  total_skipped integer := 0;
BEGIN
  RAISE NOTICE '=== POPULANDO CACHE DE GÊNEROS ===';
  RAISE NOTICE 'Buscando filmes da tabela movies...';
  
  FOR movie_record IN
    SELECT DISTINCT m.id, m.genres
    FROM movies m
    INNER JOIN user_movies um ON um.movie_id = m.id
    WHERE um.rating IS NOT NULL
      AND m.genres IS NOT NULL
      AND array_length(m.genres, 1) > 0
      AND NOT EXISTS (
        SELECT 1 FROM movie_genres_cache mgc WHERE mgc.movie_id = m.id
      )
  LOOP
    BEGIN
      -- Converter array de text para jsonb
      INSERT INTO movie_genres_cache (movie_id, genres, cached_at, updated_at)
      VALUES (
        movie_record.id,
        to_jsonb(movie_record.genres),
        NOW(),
        NOW()
      )
      ON CONFLICT (movie_id) DO UPDATE SET
        genres = EXCLUDED.genres,
        updated_at = NOW();
      
      total_cached := total_cached + 1;
      
      IF (total_cached % 50 = 0) THEN
        RAISE NOTICE 'Cacheados: %', total_cached;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Erro ao cachear filme %: %', movie_record.id, SQLERRM;
      total_skipped := total_skipped + 1;
    END;
  END LOOP;
  
  RAISE NOTICE 'Cache populado! Total: %, Ignorados: %', total_cached, total_skipped;
  RAISE NOTICE '';
END $$;

-- 3. Verificar status do cache
DO $$
DECLARE
  status_result json;
BEGIN
  status_result := check_cache_status();
  
  RAISE NOTICE '=== STATUS DO CACHE ===';
  RAISE NOTICE 'Filmes únicos avaliados: %', status_result->>'total_movies_rated';
  RAISE NOTICE 'Filmes com gêneros em cache: %', status_result->>'movies_cached';
  RAISE NOTICE 'Filmes sem cache: %', status_result->>'uncached_movies';
  RAISE NOTICE 'Cobertura do cache: %%%', status_result->>'cache_coverage_percent';
  RAISE NOTICE '';
END $$;

-- 4. Recalcular TODOS os usuários
DO $$
DECLARE
  recalc_result json;
BEGIN
  RAISE NOTICE '=== RECALCULANDO TODOS OS USUÁRIOS ===';
  
  recalc_result := bulk_recalculate_all_users();
  
  RAISE NOTICE '';
  RAISE NOTICE '=== RESULTADO DO RECÁLCULO ===';
  RAISE NOTICE 'Total de usuários: %', recalc_result->>'total_users';
  RAISE NOTICE 'Processados com sucesso: %', recalc_result->>'successful';
  RAISE NOTICE 'Falhas: %', recalc_result->>'failed';
  RAISE NOTICE 'Taxa de sucesso: %%%', recalc_result->>'success_rate_percent';
  RAISE NOTICE '';
END $$;

-- 5. Mostrar amostra de usuários
DO $$
DECLARE
  sample_user RECORD;
  users_with_points integer;
BEGIN
  SELECT COUNT(*) INTO users_with_points
  FROM profiles
  WHERE pontos_e != 0 OR pontos_i != 0 OR pontos_c != 0 OR pontos_s != 0 OR pontos_r != 0;
  
  RAISE NOTICE '=== VERIFICAÇÃO FINAL ===';
  RAISE NOTICE 'Usuários com pontos calculados: %', users_with_points;
  RAISE NOTICE '';
  RAISE NOTICE 'Amostra dos primeiros 5 usuários:';
  
  FOR sample_user IN
    SELECT 
      username,
      pontos_e,
      pontos_i,
      pontos_c,
      pontos_s,
      pontos_r,
      arquetipo_id,
      personalidade_completa
    FROM profiles
    WHERE pontos_e != 0 OR pontos_i != 0 OR pontos_c != 0 OR pontos_s != 0 OR pontos_r != 0
    ORDER BY created_at ASC
    LIMIT 5
  LOOP
    RAISE NOTICE '  %: E=%, I=%, C=%, S=%, R=% | %',
      sample_user.username,
      ROUND(sample_user.pontos_e, 2),
      ROUND(sample_user.pontos_i, 2),
      ROUND(sample_user.pontos_c, 2),
      ROUND(sample_user.pontos_s, 2),
      ROUND(sample_user.pontos_r, 2),
      COALESCE(sample_user.personalidade_completa, sample_user.arquetipo_id, 'Sem personalidade');
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ PROCESSO COMPLETO! Todos os usuários foram recalculados.';
END $$;