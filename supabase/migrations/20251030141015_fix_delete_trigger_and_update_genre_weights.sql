/*
  # Corrigir Trigger de DELETE e Atualizar Pesos dos Gêneros

  ## Correções
  1. Garantir que o trigger DELETE funciona corretamente
  2. Atualizar pesos dos gêneros com nova calibragem
  3. Adicionar gêneros faltantes (Family, Music)
  4. Recalcular todos os usuários

  ## Novos Pesos dos Gêneros (total = 5 pontos cada)
  - Drama: E=4, I=1, C=0, S=0, R=0
  - Comedy: E=0, I=0, C=0, S=0, R=5
  - Action: E=0, I=0, C=0, S=4, R=1
  - Adventure: E=0, I=0, C=3, S=0, R=2
  - Science Fiction: E=0, I=4, C=0, S=1, R=0
  - Thriller: E=0, I=5, C=0, S=0, R=0
  - Horror: E=0, I=0, C=0, S=5, R=0
  - Fantasy: E=0, I=0, C=0, S=4, R=1
  - Romance: E=5, I=0, C=0, S=0, R=0
  - Mystery: E=0, I=5, C=0, S=0, R=0
  - Documentary: E=0, I=0, C=5, S=0, R=0
  - History: E=0, I=0, C=5, S=0, R=0
  - War: E=0, I=0, C=5, S=0, R=0
  - Animation: E=0, I=0, C=0, S=0, R=5
  - Family: E=0, I=0, C=0, S=0, R=5
  - Music: E=0, I=0, C=0, S=5, R=0
*/

-- 1. Atualizar função de mapeamento de gêneros com TODOS os novos pesos
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
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 5.0  -- ATUALIZADO de 4.0 para 5.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0  -- NOVO
      WHEN 'Music' THEN 0.0   -- NOVO
      ELSE 0.0
    END as e,
    CASE genre_name
      WHEN 'Drama' THEN 1.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 4.0  -- ATUALIZADO de 3.0 para 4.0
      WHEN 'Thriller' THEN 5.0  -- ATUALIZADO de 3.0 para 5.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 5.0  -- ATUALIZADO de 4.0 para 5.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0  -- NOVO
      WHEN 'Music' THEN 0.0   -- NOVO
      ELSE 0.0
    END as i,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 3.0  -- ATUALIZADO de 1.0 para 3.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 5.0
      WHEN 'History' THEN 5.0  -- ATUALIZADO de 3.0 para 5.0
      WHEN 'War' THEN 5.0  -- ATUALIZADO de 2.0 para 5.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0  -- NOVO
      WHEN 'Music' THEN 0.0   -- NOVO
      ELSE 0.0
    END as c,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 4.0
      WHEN 'Adventure' THEN 0.0  -- ATUALIZADO de 1.0 para 0.0
      WHEN 'Science Fiction' THEN 1.0
      WHEN 'Thriller' THEN 0.0  -- ATUALIZADO de 1.0 para 0.0
      WHEN 'Horror' THEN 5.0  -- ATUALIZADO de 3.0 para 5.0
      WHEN 'Fantasy' THEN 4.0  -- ATUALIZADO de 1.0 para 4.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0  -- ATUALIZADO de 1.0 para 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0  -- ATUALIZADO de 1.0 para 0.0
      WHEN 'Animation' THEN 0.0  -- ATUALIZADO de 2.0 para 0.0
      WHEN 'Family' THEN 0.0  -- NOVO
      WHEN 'Music' THEN 5.0   -- NOVO
      ELSE 0.0
    END as s,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 5.0  -- ATUALIZADO de 4.0 para 5.0
      WHEN 'Action' THEN 1.0
      WHEN 'Adventure' THEN 2.0
      WHEN 'Science Fiction' THEN 0.0  -- ATUALIZADO de 1.0 para 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 1.0  -- ATUALIZADO de 3.0 para 1.0
      WHEN 'Romance' THEN 0.0  -- ATUALIZADO de 1.0 para 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0  -- ATUALIZADO de 1.0 para 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 5.0  -- ATUALIZADO de 2.0 para 5.0
      WHEN 'Family' THEN 5.0  -- NOVO
      WHEN 'Music' THEN 0.0   -- NOVO
      ELSE 0.0
    END as r;
END;
$$;

COMMENT ON FUNCTION get_genre_base_points(text) IS 'Mapeia gêneros TMDB para pontos base nos 5 espectros. Atualizado com nova calibragem e gêneros Family e Music.';

-- 2. Recriar trigger para garantir que funciona no DELETE
DROP TRIGGER IF EXISTS trigger_user_movies_spectrogram ON user_movies;

CREATE TRIGGER trigger_user_movies_spectrogram
  AFTER INSERT OR UPDATE OR DELETE ON user_movies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_spectrogram_on_rating_change();

-- 3. Adicionar log para debug (temporário)
CREATE OR REPLACE FUNCTION trigger_update_spectrogram_on_rating_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  movie_genres jsonb;
BEGIN
  -- Buscar gêneros do filme
  IF TG_OP = 'DELETE' THEN
    movie_genres := get_movie_genres(OLD.movie_id);
  ELSE
    movie_genres := get_movie_genres(NEW.movie_id);
  END IF;
  
  -- Se não temos gêneros cacheados, não podemos calcular
  IF movie_genres IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  
  -- INSERT: Nova avaliação
  IF TG_OP = 'INSERT' THEN
    IF NEW.rating IS NOT NULL THEN
      PERFORM update_user_spectrogram_points(
        NEW.user_id,
        movie_genres,
        NEW.rating::numeric,
        NULL
      );
    END IF;
    
  -- UPDATE: Avaliação modificada
  ELSIF TG_OP = 'UPDATE' THEN
    -- Se rating mudou
    IF (OLD.rating IS DISTINCT FROM NEW.rating) THEN
      -- Se ambos não são nulos, atualizar com nota antiga
      IF OLD.rating IS NOT NULL AND NEW.rating IS NOT NULL THEN
        PERFORM update_user_spectrogram_points(
          NEW.user_id,
          movie_genres,
          NEW.rating::numeric,
          OLD.rating::numeric
        );
      -- Se tinha nota e agora não tem, remover pontos
      ELSIF OLD.rating IS NOT NULL AND NEW.rating IS NULL THEN
        PERFORM remove_spectrogram_points_for_rating(
          OLD.user_id,
          movie_genres,
          OLD.rating::numeric
        );
      -- Se não tinha nota e agora tem, adicionar pontos
      ELSIF OLD.rating IS NULL AND NEW.rating IS NOT NULL THEN
        PERFORM update_user_spectrogram_points(
          NEW.user_id,
          movie_genres,
          NEW.rating::numeric,
          NULL
        );
      END IF;
    END IF;
    
  -- DELETE: Avaliação removida (EXCLUIR da biblioteca)
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.rating IS NOT NULL THEN
      PERFORM remove_spectrogram_points_for_rating(
        OLD.user_id,
        movie_genres,
        OLD.rating::numeric
      );
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Recalcular todos os usuários com os novos pesos
DO $$
DECLARE
  recalc_result json;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== RECALCULANDO COM NOVOS PESOS DOS GÊNEROS ===';
  
  recalc_result := bulk_recalculate_all_users();
  
  RAISE NOTICE '';
  RAISE NOTICE 'Total de usuários: %', recalc_result->>'total_users';
  RAISE NOTICE 'Sucesso: %', recalc_result->>'successful';
  RAISE NOTICE 'Falhas: %', recalc_result->>'failed';
  RAISE NOTICE 'Taxa de sucesso: %%%', recalc_result->>'success_rate_percent';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Recálculo completo! Novos pesos aplicados.';
END $$;