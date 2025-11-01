/*
  # Teste do Sistema Automático de Rebalanceamento

  ## Alteração
  Drama: E=3→4, I=1→0 (redistribuição para focar mais em emocional puro)

  ## Objetivo
  Testar se o sistema automático de recálculo funciona corretamente após
  esta alteração nos pesos do gênero Drama.

  Antes: Drama E=3, I=1, C=0, S=1, R=0
  Depois: Drama E=4, I=0, C=0, S=1, R=0
*/

-- Atualizar função com o novo peso de Drama
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz Gênero-Espectro (cada gênero distribui 5 pontos)
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 4.0  -- AJUSTADO: 3.0 → 4.0
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
      WHEN 'Drama' THEN 0.0  -- AJUSTADO: 1.0 → 0.0
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
      WHEN 'Drama' THEN 1.0
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

-- Executar recálculo automático (sistema testado!)
SELECT auto_recalculate_after_rebalance('TESTE: Drama E=3→4, I=1→0 para focar em emocional puro');
