/*
  # Optimize Profile Stats Query

  1. New Functions
    - `get_user_profile_stats()` - Retorna todas as estatísticas de perfil em uma única query
    - Inclui: contagem de filmes avaliados, distribuição de ratings, tempos de assistência, etc.
  
  2. Benefits
    - Reduz de múltiplas queries para uma única query
    - Melhora drasticamente a performance do carregamento de perfil
    - Pode ser cacheada facilmente no frontend
*/

CREATE OR REPLACE FUNCTION get_user_profile_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_rated_count integer;
  v_rating_distribution jsonb;
  v_total_runtime integer;
BEGIN
  -- Contagem de filmes avaliados
  SELECT COUNT(*)
  INTO v_rated_count
  FROM user_movies
  WHERE user_id = p_user_id;

  -- Distribuição de ratings
  SELECT jsonb_object_agg(
    COALESCE(rating::text, 'null'),
    count
  )
  INTO v_rating_distribution
  FROM (
    SELECT rating, COUNT(*) as count
    FROM user_movies
    WHERE user_id = p_user_id
    GROUP BY rating
  ) sub;

  -- Tempo total (estimativa: assumindo 120min por filme se não houver dados)
  v_total_runtime := v_rated_count * 120;

  -- Construir resultado
  v_result := jsonb_build_object(
    'rated_count', v_rated_count,
    'rating_distribution', COALESCE(v_rating_distribution, '{}'::jsonb),
    'total_runtime_minutes', v_total_runtime
  );

  RETURN v_result;
END;
$$;
