/*
  # Adicionar Pesos para Gêneros Faltantes

  ## Novos Gêneros
  
  1. **Crime**
     - E=1 (Emocional): Crimes frequentemente envolvem drama pessoal
     - I=1 (Intelectual): Investigação e dedução
     - C=1 (Cultural): Reflexo de questões sociais
     - S=2 (Sensorial): Ação e tensão
     - R=0 (Recreativo): Não é entretenimento leve
  
  2. **Western**
     - E=0 (Emocional): Foco em ação, não emoção
     - I=0 (Intelectual): Narrativas diretas
     - C=5 (Cultural): Fortemente ligado à cultura americana
     - S=0 (Sensorial): Não é o foco principal
     - R=0 (Recreativo): Não é entretenimento leve
  
  3. **TV Movie**
     - E=0 (Emocional): Geralmente mais genéricos
     - I=0 (Intelectual): Não requerem análise profunda
     - C=0 (Cultural): Não têm valor cultural específico
     - S=0 (Sensorial): Produção mais simples
     - R=5 (Recreativo): Entretenimento casual

  ## Alteração
  Atualizar a função `get_genre_base_points` para incluir os novos gêneros.
*/

-- Atualizar função para incluir Crime, Western e TV Movie
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz Gênero-Espectro (cada gênero distribui 5 pontos)
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 4.0
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
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
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
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as i,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
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
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 5.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as c,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
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
      WHEN 'Crime' THEN 2.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
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
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 2.0
      WHEN 'Crime' THEN 0.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 5.0
      ELSE 0.0
    END as r;
END;
$$;