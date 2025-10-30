/*
  # Corrigir Formato do Cache de Gêneros e Recalcular

  ## Problema Identificado
  O cache de gêneros está com dois formatos diferentes:
  - Formato 1: ["Drama", "Comedy"] (da tabela movies)
  - Formato 2: [{"name": "Drama"}, {"name": "Comedy"}] (esperado pela função)

  ## Solução
  1. Corrigir todos os registros do cache para o formato esperado
  2. Recalcular todos os usuários novamente
*/

-- 1. Atualizar formato dos gêneros no cache
DO $$
DECLARE
  cache_record RECORD;
  fixed_count integer := 0;
  genres_array jsonb;
  genre_text text;
  new_genres jsonb;
BEGIN
  RAISE NOTICE 'Corrigindo formato dos gêneros no cache...';
  
  FOR cache_record IN
    SELECT movie_id, genres
    FROM movie_genres_cache
    WHERE jsonb_typeof(genres) = 'array'
  LOOP
    -- Verificar se já está no formato correto (tem campo "name")
    IF jsonb_typeof(cache_record.genres->0) = 'object' AND 
       cache_record.genres->0 ? 'name' THEN
      -- Já está no formato correto, pular
      CONTINUE;
    END IF;
    
    -- Está no formato errado (array de strings), converter
    new_genres := '[]'::jsonb;
    
    FOR genre_text IN
      SELECT jsonb_array_elements_text(cache_record.genres)
    LOOP
      new_genres := new_genres || jsonb_build_object('name', genre_text);
    END LOOP;
    
    -- Atualizar o registro
    UPDATE movie_genres_cache
    SET genres = new_genres, updated_at = NOW()
    WHERE movie_id = cache_record.movie_id;
    
    fixed_count := fixed_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Formato corrigido para % filmes', fixed_count;
END $$;

-- 2. Recalcular todos os usuários novamente com o formato correto
DO $$
DECLARE
  recalc_result json;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== RECALCULANDO TODOS OS USUÁRIOS (FORMATO CORRIGIDO) ===';
  
  recalc_result := bulk_recalculate_all_users();
  
  RAISE NOTICE '';
  RAISE NOTICE 'Total de usuários: %', recalc_result->>'total_users';
  RAISE NOTICE 'Sucesso: %', recalc_result->>'successful';
  RAISE NOTICE 'Falhas: %', recalc_result->>'failed';
  RAISE NOTICE 'Taxa de sucesso: %%%', recalc_result->>'success_rate_percent';
END $$;

-- 3. Verificar resultados
DO $$
DECLARE
  sample_user RECORD;
  users_with_points integer;
  total_users_with_ratings integer;
BEGIN
  -- Contar usuários com pontos
  SELECT COUNT(*) INTO users_with_points
  FROM profiles
  WHERE (pontos_e != 0 OR pontos_i != 0 OR pontos_c != 0 OR pontos_s != 0 OR pontos_r != 0)
    AND (pontos_e::numeric + pontos_i::numeric + pontos_c::numeric + pontos_s::numeric + pontos_r::numeric) != 0;
  
  -- Contar usuários que deveriam ter pontos
  SELECT COUNT(DISTINCT p.id) INTO total_users_with_ratings
  FROM profiles p
  INNER JOIN user_movies um ON um.user_id = p.id
  WHERE um.rating IS NOT NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICAÇÃO FINAL ===';
  RAISE NOTICE 'Usuários com avaliações: %', total_users_with_ratings;
  RAISE NOTICE 'Usuários com pontos calculados: %', users_with_points;
  RAISE NOTICE '';
  
  IF users_with_points > 0 THEN
    RAISE NOTICE 'Amostra de usuários (primeiros 5):';
    FOR sample_user IN
      SELECT 
        username,
        ROUND(pontos_e::numeric, 1) as e,
        ROUND(pontos_i::numeric, 1) as i,
        ROUND(pontos_c::numeric, 1) as c,
        ROUND(pontos_s::numeric, 1) as s,
        ROUND(pontos_r::numeric, 1) as r,
        arquetipo_id
      FROM profiles
      WHERE (pontos_e != 0 OR pontos_i != 0 OR pontos_c != 0 OR pontos_s != 0 OR pontos_r != 0)
        AND (pontos_e::numeric + pontos_i::numeric + pontos_c::numeric + pontos_s::numeric + pontos_r::numeric) != 0
      ORDER BY created_at ASC
      LIMIT 5
    LOOP
      RAISE NOTICE '  %: E=%, I=%, C=%, S=%, R=% | %',
        sample_user.username,
        sample_user.e,
        sample_user.i,
        sample_user.c,
        sample_user.s,
        sample_user.r,
        sample_user.arquetipo_id;
    END LOOP;
    RAISE NOTICE '';
    RAISE NOTICE '✅ SUCESSO! Usuários têm pontos calculados corretamente.';
  ELSE
    RAISE WARNING '⚠️ ATENÇÃO: Nenhum usuário tem pontos. Verifique os dados.';
  END IF;
END $$;