/*
  # Sistema de Cache de Gêneros e Triggers para Espectrograma

  ## Estratégia
  Como user_movies não tem movie_genres, vamos:
  1. Criar uma tabela de cache para gêneros dos filmes
  2. Criar triggers para atualizar espectrograma quando avaliação muda
  3. Frontend será responsável por fornecer gêneros ao avaliar

  ## Tabelas
  - movie_genres_cache: Cache de gêneros por filme (TMDB ID)
*/

-- 1. Criar tabela de cache de gêneros
CREATE TABLE IF NOT EXISTS movie_genres_cache (
  movie_id integer PRIMARY KEY,
  genres jsonb NOT NULL,
  cached_at timestamptz DEFAULT NOW() NOT NULL,
  updated_at timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movie_genres_cache_updated ON movie_genres_cache(updated_at);

-- 2. Função para obter gêneros de um filme (do cache ou retornar null)
CREATE OR REPLACE FUNCTION get_movie_genres(p_movie_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cached_genres jsonb;
BEGIN
  SELECT genres INTO cached_genres
  FROM movie_genres_cache
  WHERE movie_id = p_movie_id;
  
  RETURN cached_genres;
END;
$$;

-- 3. Função para adicionar/atualizar gêneros no cache
CREATE OR REPLACE FUNCTION cache_movie_genres(
  p_movie_id integer,
  p_genres jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO movie_genres_cache (movie_id, genres, cached_at, updated_at)
  VALUES (p_movie_id, p_genres, NOW(), NOW())
  ON CONFLICT (movie_id)
  DO UPDATE SET
    genres = EXCLUDED.genres,
    updated_at = NOW();
END;
$$;

-- 4. Trigger function para atualizar espectrograma quando rating muda
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
  movie_genres := get_movie_genres(NEW.movie_id);
  
  -- Se não temos gêneros cacheados, não podemos calcular
  IF movie_genres IS NULL THEN
    RETURN NEW;
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
    
  -- DELETE: Avaliação removida
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

-- 5. Criar trigger em user_movies
DROP TRIGGER IF EXISTS trigger_user_movies_spectrogram ON user_movies;

CREATE TRIGGER trigger_user_movies_spectrogram
  AFTER INSERT OR UPDATE OR DELETE ON user_movies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_spectrogram_on_rating_change();

-- 6. Função para popular cache de gêneros em lote (será chamada pelo frontend)
CREATE OR REPLACE FUNCTION bulk_cache_movie_genres(
  movies_data jsonb  -- Array de objetos: [{ movie_id: 123, genres: [...] }, ...]
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  movie_item jsonb;
  cached_count integer := 0;
BEGIN
  FOR movie_item IN SELECT * FROM jsonb_array_elements(movies_data)
  LOOP
    PERFORM cache_movie_genres(
      (movie_item->>'movie_id')::integer,
      movie_item->'genres'
    );
    cached_count := cached_count + 1;
  END LOOP;
  
  RETURN json_build_object(
    'cached_count', cached_count,
    'status', 'success'
  );
END;
$$;

-- 7. Função para recalcular com cache existente
CREATE OR REPLACE FUNCTION recalculate_user_spectrogram_with_cache(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_rating RECORD;
  movie_genres jsonb;
  total_ratings integer := 0;
  processed integer := 0;
  skipped integer := 0;
  result json;
BEGIN
  -- Resetar pontos do usuário
  UPDATE profiles
  SET 
    pontos_e = 0,
    pontos_i = 0,
    pontos_c = 0,
    pontos_s = 0,
    pontos_r = 0,
    arquetipo_primario = NULL,
    arquetipo_secundario = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Contar total de avaliações
  SELECT COUNT(*) INTO total_ratings
  FROM user_movies
  WHERE user_id = p_user_id
    AND rating IS NOT NULL;
  
  -- Processar cada avaliação do usuário
  FOR user_rating IN
    SELECT um.movie_id, um.rating
    FROM user_movies um
    WHERE um.user_id = p_user_id
      AND um.rating IS NOT NULL
  LOOP
    -- Buscar gêneros do cache
    movie_genres := get_movie_genres(user_rating.movie_id);
    
    IF movie_genres IS NOT NULL THEN
      -- Atualizar pontos para esta avaliação
      PERFORM update_user_spectrogram_points(
        p_user_id,
        movie_genres,
        user_rating.rating::numeric,
        NULL
      );
      processed := processed + 1;
    ELSE
      skipped := skipped + 1;
    END IF;
  END LOOP;
  
  -- Construir resultado
  result := json_build_object(
    'user_id', p_user_id,
    'total_ratings', total_ratings,
    'processed_ratings', processed,
    'skipped_ratings', skipped,
    'cache_coverage_percent', ROUND((processed::numeric / NULLIF(total_ratings, 0)::numeric * 100), 2),
    'status', 'completed'
  );
  
  RETURN result;
END;
$$;

-- 8. RLS para movie_genres_cache
ALTER TABLE movie_genres_cache ENABLE ROW LEVEL SECURITY;

-- Todos podem ler o cache
CREATE POLICY "Anyone can read movie genres cache"
  ON movie_genres_cache
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Apenas autenticados podem adicionar ao cache
CREATE POLICY "Authenticated users can cache genres"
  ON movie_genres_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Comentários
COMMENT ON TABLE movie_genres_cache IS 'Cache de gêneros dos filmes do TMDB';
COMMENT ON FUNCTION cache_movie_genres IS 'Adiciona ou atualiza gêneros de um filme no cache';
COMMENT ON FUNCTION get_movie_genres IS 'Obtém gêneros de um filme do cache';
COMMENT ON FUNCTION bulk_cache_movie_genres IS 'Popular cache de gêneros em lote via frontend';
COMMENT ON FUNCTION recalculate_user_spectrogram_with_cache IS 'Recalcula espectrograma usando cache de gêneros';
COMMENT ON FUNCTION trigger_update_spectrogram_on_rating_change IS 'Trigger para atualizar espectrograma automaticamente';

-- Verificar status do cache
DO $$
DECLARE
  total_movies_rated bigint;
  movies_cached bigint;
  cache_percent numeric;
BEGIN
  SELECT COUNT(DISTINCT movie_id) INTO total_movies_rated
  FROM user_movies
  WHERE rating IS NOT NULL;
  
  SELECT COUNT(*) INTO movies_cached
  FROM movie_genres_cache;
  
  IF total_movies_rated > 0 THEN
    cache_percent := ROUND((movies_cached::numeric / total_movies_rated::numeric * 100), 2);
  ELSE
    cache_percent := 0;
  END IF;
  
  RAISE NOTICE '=== Espectrograma Cinematográfico - Status ===';
  RAISE NOTICE 'Filmes únicos avaliados: %', total_movies_rated;
  RAISE NOTICE 'Filmes com gêneros em cache: %', movies_cached;
  RAISE NOTICE 'Cobertura do cache: %%%', cache_percent;
  RAISE NOTICE '';
  
  IF cache_percent < 100 THEN
    RAISE NOTICE 'PRÓXIMOS PASSOS:';
    RAISE NOTICE '1. Frontend deve popular cache de gêneros ao avaliar filmes';
    RAISE NOTICE '2. Use bulk_cache_movie_genres() para popular em lote';
    RAISE NOTICE '3. Após popular, execute recalculate_user_spectrogram_with_cache()';
  ELSE
    RAISE NOTICE 'Cache completo! Sistema pronto para uso.';
  END IF;
END $$;