/*
  # Fix Tiebreaker Array Handling - Correct Array Concatenation

  ## Problem
  PostgreSQL array concatenation using || operator requires proper casting and array syntax.
  The error "malformed array literal" occurs when trying to concatenate text to array incorrectly.

  ## Solution
  Use array_append() function instead of || operator for adding elements to arrays.

  ## Changes
  - Replace `array || 'element'` with `array_append(array, 'element')`
  - Ensure proper array handling throughout the function
*/

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
      AND question_id <= 12
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

  IF scores.max_score IS NULL THEN
    RETURN json_build_object(
      'status', 'no_responses',
      'message', 'Nenhuma resposta registrada para esta sessão'
    );
  END IF;

  SELECT COUNT(*) INTO winner_count
  FROM (
    SELECT unnest(ARRAY[scores.score_a, scores.score_b, scores.score_k,
                        scores.score_x, scores.score_d, scores.score_l]) as score
  ) s
  WHERE s.score = scores.max_score;

  IF winner_count > 1 THEN
    tied_categories_array := ARRAY[]::text[];

    -- Use array_append instead of || for proper array concatenation
    IF scores.score_a = scores.max_score THEN 
      tied_categories_array := array_append(tied_categories_array, 'A'); 
    END IF;
    IF scores.score_b = scores.max_score THEN 
      tied_categories_array := array_append(tied_categories_array, 'B'); 
    END IF;
    IF scores.score_k = scores.max_score THEN 
      tied_categories_array := array_append(tied_categories_array, 'K'); 
    END IF;
    IF scores.score_x = scores.max_score THEN 
      tied_categories_array := array_append(tied_categories_array, 'X'); 
    END IF;
    IF scores.score_d = scores.max_score THEN 
      tied_categories_array := array_append(tied_categories_array, 'D'); 
    END IF;
    IF scores.score_l = scores.max_score THEN 
      tied_categories_array := array_append(tied_categories_array, 'L'); 
    END IF;

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
      'tied_categories', to_json(tied_categories_array),
      'requires_tiebreaker', true
    );

    RETURN result;
  END IF;

  IF scores.score_a = scores.max_score THEN winner_subcategory := 'A';
  ELSIF scores.score_b = scores.max_score THEN winner_subcategory := 'B';
  ELSIF scores.score_k = scores.max_score THEN winner_subcategory := 'K';
  ELSIF scores.score_x = scores.max_score THEN winner_subcategory := 'X';
  ELSIF scores.score_d = scores.max_score THEN winner_subcategory := 'D';
  ELSIF scores.score_l = scores.max_score THEN winner_subcategory := 'L';
  END IF;

  UPDATE profiles
  SET
    antagonistic_subcategory = winner_subcategory,
    updated_at = NOW()
  WHERE id = p_user_id;

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

COMMENT ON FUNCTION calculate_subcategory_result IS 'Calcula resultado e detecta empates usando array_append para concatenação';