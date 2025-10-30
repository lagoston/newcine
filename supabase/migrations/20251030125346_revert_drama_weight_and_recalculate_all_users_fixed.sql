/*
  # Reverter Peso do Drama e Recalcular Todos os Usuários

  ## Mudanças
  1. Reverter peso do Drama para original: E4, I1, C0, S0, R0
  2. Recalcular pontos de todos os usuários existentes baseado em suas avaliações
  3. Atualizar arquétipos primário e secundário

  ## Lógica
  - Buscar todas as avaliações de cada usuário
  - Aplicar fórmula: (nota - 5.0) / 5.0 × pontos_base_do_gênero
  - Somar pontos em cada espectro (E/I/C/S/R)
  - Determinar arquétipo primário (maior pontuação) e secundário (segunda maior)
*/

-- 1. Reverter função de mapeamento de gêneros para peso original do Drama
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz Gênero-Espectro (cada gênero distribui 5 pontos)
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 4.0  -- REVERTIDO para 4.0
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
      WHEN 'Drama' THEN 1.0
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
      WHEN 'Drama' THEN 0.0  -- REVERTIDO para 0.0
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
      WHEN 'Drama' THEN 0.0  -- REVERTIDO para 0.0
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
      WHEN 'Drama' THEN 0.0
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

-- 2. Criar função para recalcular pontos de um usuário específico
CREATE OR REPLACE FUNCTION recalculate_user_spectrogram(user_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_e numeric := 0;
  total_i numeric := 0;
  total_c numeric := 0;
  total_s numeric := 0;
  total_r numeric := 0;
  primary_archetype text;
  secondary_archetype text;
  max_value numeric;
  second_max_value numeric;
  archetype_combo text;
BEGIN
  -- Calcular pontos baseado nas avaliações do usuário
  SELECT 
    COALESCE(SUM(points.e), 0),
    COALESCE(SUM(points.i), 0),
    COALESCE(SUM(points.c), 0),
    COALESCE(SUM(points.s), 0),
    COALESCE(SUM(points.r), 0)
  INTO total_e, total_i, total_c, total_s, total_r
  FROM user_movies um
  CROSS JOIN LATERAL (
    SELECT 
      movie_id,
      rating,
      ((rating - 5.0) / 5.0) as multiplier
  ) calc
  CROSS JOIN LATERAL (
    SELECT 
      jsonb_array_elements_text(mgc.genres) as genre_name
    FROM movie_genres_cache mgc
    WHERE mgc.movie_id = um.movie_id
  ) genres
  CROSS JOIN LATERAL (
    SELECT * FROM get_genre_base_points(genres.genre_name)
  ) points
  CROSS JOIN LATERAL (
    SELECT
      points.e * calc.multiplier as e,
      points.i * calc.multiplier as i,
      points.c * calc.multiplier as c,
      points.s * calc.multiplier as s,
      points.r * calc.multiplier as r
  ) weighted_points
  WHERE um.user_id = user_id_param
    AND um.rating IS NOT NULL;

  -- Determinar arquétipo primário (maior pontuação)
  SELECT spectrum, value INTO primary_archetype, max_value
  FROM (
    SELECT 'E' as spectrum, total_e as value
    UNION ALL SELECT 'I', total_i
    UNION ALL SELECT 'C', total_c
    UNION ALL SELECT 'S', total_s
    UNION ALL SELECT 'R', total_r
  ) spectrums
  ORDER BY value DESC, spectrum ASC
  LIMIT 1;

  -- Determinar arquétipo secundário (segunda maior pontuação)
  SELECT spectrum, value INTO secondary_archetype, second_max_value
  FROM (
    SELECT 'E' as spectrum, total_e as value
    UNION ALL SELECT 'I', total_i
    UNION ALL SELECT 'C', total_c
    UNION ALL SELECT 'S', total_s
    UNION ALL SELECT 'R', total_r
  ) spectrums
  WHERE spectrum != primary_archetype
  ORDER BY value DESC, spectrum ASC
  LIMIT 1;

  -- Construir arquétipo combinado
  IF primary_archetype IS NOT NULL AND secondary_archetype IS NOT NULL THEN
    archetype_combo := primary_archetype || secondary_archetype;
  END IF;

  -- Atualizar perfil do usuário
  UPDATE profiles
  SET 
    pontos_e = total_e,
    pontos_i = total_i,
    pontos_c = total_c,
    pontos_s = total_s,
    pontos_r = total_r,
    arquetipo_primario = primary_archetype,
    arquetipo_secundario = secondary_archetype,
    arquetipo_id = archetype_combo,
    updated_at = now()
  WHERE id = user_id_param;

  RAISE NOTICE 'Recalculado usuário %: E=%, I=%, C=%, S=%, R=%, Arquétipo=%', 
    user_id_param, total_e, total_i, total_c, total_s, total_r, archetype_combo;
END;
$$;

-- 3. Recalcular pontos de TODOS os usuários que têm avaliações
DO $$
DECLARE
  user_record RECORD;
  users_count integer := 0;
BEGIN
  RAISE NOTICE 'Iniciando recalculação de todos os usuários...';
  
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
      PERFORM recalculate_user_spectrogram(user_record.id);
      users_count := users_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Erro ao recalcular usuário % (%): %', user_record.username, user_record.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Recalculação completa! Total de usuários processados: %', users_count;
END $$;

-- 4. Adicionar comentário
COMMENT ON FUNCTION recalculate_user_spectrogram(uuid) IS 'Recalcula completamente o espectrograma cinematográfico de um usuário baseado em todas suas avaliações.';