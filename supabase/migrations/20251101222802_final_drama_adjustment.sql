/*
  # Ajuste Final: Drama Equilibrado

  ## Mudança
  Drama: E=5 → E=4, I=0 → I=0, C=0 → C=0, S=0 → S=1, R=0 → R=0
  
  ## Objetivo
  Drama passa a ter 4 pontos emocionais + 1 ponto sensorial.
  Equilíbrio entre intensidade emocional e experiência sensorial.

  ## Distribuição Final
  - Emocional (E): 4 - Foco principal em emoções
  - Intelectual (I): 0 - Sem componente intelectual
  - Cultural (C): 0 - Sem componente cultural
  - Sensorial (S): 1 - Leve componente de experiência visual/sonora
  - Recreativo (R): 0 - Não é entretenimento leve
*/

-- Atualizar função get_genre_base_points com ajuste final do Drama
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz Gênero-Espectro (cada gênero distribui 5 pontos)
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 4.0  -- AJUSTE FINAL: 5.0 → 4.0 (Emocional principal + toque sensorial)
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 5.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0
      WHEN 'Music' THEN 0.0
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as e,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 4.0
      WHEN 'Thriller' THEN 5.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 5.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 1.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0
      WHEN 'Music' THEN 0.0
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as i,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 3.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 5.0
      WHEN 'History' THEN 4.0
      WHEN 'War' THEN 5.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0
      WHEN 'Music' THEN 0.0
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 5.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as c,
    CASE genre_name
      WHEN 'Drama' THEN 1.0  -- AJUSTE FINAL: 0.0 → 1.0 (Adiciona componente sensorial)
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 4.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 1.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 5.0
      WHEN 'Fantasy' THEN 4.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0
      WHEN 'Music' THEN 5.0
      WHEN 'Crime' THEN 2.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as s,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 5.0
      WHEN 'Action' THEN 1.0
      WHEN 'Adventure' THEN 2.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 1.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 5.0
      WHEN 'Family' THEN 5.0
      WHEN 'Music' THEN 0.0
      WHEN 'Crime' THEN 0.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 5.0
      ELSE 0.0
    END as r;
END;
$$;

COMMENT ON FUNCTION get_genre_base_points(text) IS 
  'Mapeia todos os 19 gêneros TMDB para pontos base nos 5 espectros (E, I, C, S, R). 
  Drama FINAL: E=4, I=0, C=0, S=1, R=0 - Emocional principal com toque sensorial.';

-- Executar recálculo AUTOMÁTICO de todos os usuários
SELECT auto_recalculate_after_rebalance('AJUSTE FINAL: Drama E=5→4, S=0→1 (Emocional + Sensorial equilibrado)');
