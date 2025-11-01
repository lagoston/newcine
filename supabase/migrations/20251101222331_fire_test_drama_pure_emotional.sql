/*
  # 🔥 TESTE DE FOGO: Drama Puramente Emocional

  ## Mudança Solicitada
  Drama: E=3 → **E=5**, I=1 → **I=0**, C=0 → **C=0**, S=1 → **S=0**, R=0 → **R=0**
  
  ## Objetivo
  Testar o sistema automático de recálculo após mudança de pesos.
  Drama passa a ser 100% emocional, sem componentes intelectuais ou sensoriais.

  ## Expectativa
  - Sistema automaticamente recalcula todos os 13 usuários
  - Usuários com muitos dramas terão aumento significativo em pontos Emocionais
  - Arquétipos podem mudar para refletir a nova distribuição
  
  ## Impacto Esperado
  Usuários como Bruno (176 filmes) e Math (93 filmes) que têm muitos dramas
  verão grande aumento em E.
*/

-- 1. Atualizar função get_genre_base_points com Drama puramente emocional
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz Gênero-Espectro (cada gênero distribui 5 pontos)
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 5.0  -- 🔥 TESTE DE FOGO: 3.0 → 5.0 (PURAMENTE EMOCIONAL)
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
      WHEN 'Drama' THEN 0.0  -- 🔥 TESTE DE FOGO: 1.0 → 0.0 (SEM COMPONENTE INTELECTUAL)
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
      WHEN 'Drama' THEN 0.0  -- 🔥 TESTE DE FOGO: 1.0 → 0.0 (SEM COMPONENTE SENSORIAL)
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
  '🔥 TESTE DE FOGO: Drama ajustado para E=5 puro (sem I, C, S, R).
  Todos os 19 gêneros TMDB mapeados para pontos base nos 5 espectros.';

-- 2. Executar recálculo AUTOMÁTICO de todos os usuários
SELECT auto_recalculate_after_rebalance('🔥 TESTE DE FOGO: Drama E=3→5, I=1→0, S=1→0 (PURAMENTE EMOCIONAL)');
