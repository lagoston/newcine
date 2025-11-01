/*
  # Fix Tiebreaker Array Handling

  ## Problem
  The `calculate_subcategory_result` function returns `tied_categories` as a PostgreSQL array,
  but when passed through JSON, it needs proper array handling in the return type.

  ## Changes
  - Modify `calculate_subcategory_result` to return `tied_categories` as JSON array
  - Ensure compatibility with JavaScript array handling in frontend

  ## Testing
  After this migration, when a tie occurs:
  - `tied_categories` should be returned as proper JSON array: ["A", "B"]
  - Frontend can pass it directly to `get_tiebreaker_question`
*/

-- Drop and recreate calculate_subcategory_result with fixed JSON array handling
CREATE OR REPLACE FUNCTION calculate_subcategory_result(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scores RECORD;
  max_score integer;
  winner_count integer;
  tied_categories_array text[];
  winner_subcategory text;
  result json;
BEGIN
  -- Calcular pontuação por subcategoria
  WITH score_counts AS (
    SELECT
      subcategory_id,
      COUNT(*) as score
    FROM user_subcategory_responses
    WHERE session_id = p_session_id
      AND question_id <= 12  -- Apenas perguntas principais
    GROUP BY subcategory_id
  ),
  max_score_calc AS (
    SELECT MAX(score) as max_score FROM score_counts
  )
  SELECT
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'A' THEN sc.score ELSE 0 END), 0) as score_a,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'B' THEN sc.score ELSE 0 END), 0) as score_b,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'K' THEN sc.score ELSE 0 END), 0) as score_k,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'X' THEN sc.score ELSE 0 END), 0) as score_x,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'D' THEN sc.score ELSE 0 END), 0) as score_d,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'L' THEN sc.score ELSE 0 END), 0) as score_l,
    m.max_score
  INTO scores
  FROM score_counts sc
  CROSS JOIN max_score_calc m
  GROUP BY m.max_score;

  -- Se não houver max_score, significa que não há respostas
  IF scores.max_score IS NULL THEN
    RETURN json_build_object(
      'status', 'no_responses',
      'message', 'Nenhuma resposta registrada para esta sessão'
    );
  END IF;

  -- Contar quantas categorias têm a pontuação máxima
  SELECT COUNT(*) INTO winner_count
  FROM (
    SELECT unnest(ARRAY[scores.score_a, scores.score_b, scores.score_k,
                        scores.score_x, scores.score_d, scores.score_l]) as score
  ) s
  WHERE s.score = scores.max_score;

  -- Se há empate
  IF winner_count > 1 THEN
    -- Identificar categorias empatadas
    tied_categories_array := ARRAY[]::text[];

    IF scores.score_a = scores.max_score THEN tied_categories_array := tied_categories_array || 'A'; END IF;
    IF scores.score_b = scores.max_score THEN tied_categories_array := tied_categories_array || 'B'; END IF;
    IF scores.score_k = scores.max_score THEN tied_categories_array := tied_categories_array || 'K'; END IF;
    IF scores.score_x = scores.max_score THEN tied_categories_array := tied_categories_array || 'X'; END IF;
    IF scores.score_d = scores.max_score THEN tied_categories_array := tied_categories_array || 'D'; END IF;
    IF scores.score_l = scores.max_score THEN tied_categories_array := tied_categories_array || 'L'; END IF;

    -- Return with tied_categories as JSON array
    result := json_build_object(
      'status', 'tie',
      'scores', json_build_object(
        'A', scores.score_a,
        'B', scores.score_b,
        'K', scores.score_k,
        'X', scores.score_x,
        'D', scores.score_d,
        'L', scores.score_l
      ),
      'tied_categories', to_json(tied_categories_array),  -- Convert array to JSON
      'requires_tiebreaker', true
    );

    RETURN result;
  END IF;

  -- Determinar vencedor
  IF scores.score_a = scores.max_score THEN winner_subcategory := 'A';
  ELSIF scores.score_b = scores.max_score THEN winner_subcategory := 'B';
  ELSIF scores.score_k = scores.max_score THEN winner_subcategory := 'K';
  ELSIF scores.score_x = scores.max_score THEN winner_subcategory := 'X';
  ELSIF scores.score_d = scores.max_score THEN winner_subcategory := 'D';
  ELSIF scores.score_l = scores.max_score THEN winner_subcategory := 'L';
  END IF;

  -- Atualizar perfil do usuário com a subcategoria vencedora
  UPDATE profiles
  SET
    antagonistic_subcategory = winner_subcategory,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Retornar resultado
  result := json_build_object(
    'status', 'success',
    'subcategory', winner_subcategory,
    'scores', json_build_object(
      'A', scores.score_a,
      'B', scores.score_b,
      'K', scores.score_k,
      'X', scores.score_x,
      'D', scores.score_d,
      'L', scores.score_l
    ),
    'requires_tiebreaker', false
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION calculate_subcategory_result IS 'Calcula resultado e detecta empates - retorna tied_categories como JSON array';