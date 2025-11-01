/*
  # Sistema de População de Cache via Frontend

  ## Objetivo
  Permitir que o frontend popule o cache de gêneros quando buscar filmes do TMDB

  ## Como Funciona
  1. Frontend busca filme do TMDB (já faz isso)
  2. Frontend chama função RPC para cachear os gêneros
  3. Backend usa cache para cálculos

  ## Uso
  Quando o frontend chamar getMovieDetails(), deve também chamar:
  supabase.rpc('cache_movie_genres_from_frontend', {
    p_movie_id: movieId,
    p_genres_json: movie.genres
  })
*/

-- Função para o frontend popular o cache quando buscar do TMDB
CREATE OR REPLACE FUNCTION cache_movie_genres_from_frontend(
  p_movie_id integer,
  p_genres_json jsonb  -- Formato: [{"id": 18, "name": "Drama"}, {"id": 53, "name": "Thriller"}]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  genres_array jsonb;
BEGIN
  -- Extrair apenas os nomes dos gêneros
  genres_array := (
    SELECT jsonb_agg(jsonb_build_object('name', g->>'name'))
    FROM jsonb_array_elements(p_genres_json) AS g
  );
  
  -- Inserir ou atualizar no cache
  INSERT INTO movie_genres_cache (movie_id, genres, cached_at, updated_at)
  VALUES (p_movie_id, genres_array, NOW(), NOW())
  ON CONFLICT (movie_id) 
  DO UPDATE SET
    genres = genres_array,
    updated_at = NOW();
  
  RETURN json_build_object(
    'success', true,
    'movie_id', p_movie_id,
    'genres', genres_array,
    'message', 'Gêneros cacheados com sucesso'
  );
END;
$$;

COMMENT ON FUNCTION cache_movie_genres_from_frontend(integer, jsonb) IS 
  'Permite frontend cachear gêneros quando busca filme do TMDB. Garante sincronização entre frontend e backend.';

-- Dar permissão para usuários autenticados chamarem esta função
GRANT EXECUTE ON FUNCTION cache_movie_genres_from_frontend(integer, jsonb) TO authenticated;

-- View para monitorar efetividade do cache
CREATE OR REPLACE VIEW cache_effectiveness AS
SELECT 
  (SELECT COUNT(DISTINCT movie_id) FROM user_movies WHERE rating IS NOT NULL) as total_movies_rated,
  (SELECT COUNT(*) FROM movie_genres_cache WHERE jsonb_array_length(genres) > 0) as movies_cached_correctly,
  (SELECT COUNT(*) FROM get_movies_needing_cache()) as movies_needing_cache,
  CASE 
    WHEN (SELECT COUNT(DISTINCT movie_id) FROM user_movies WHERE rating IS NOT NULL) = 0 THEN 100
    ELSE ROUND(
      (SELECT COUNT(*) FROM movie_genres_cache WHERE jsonb_array_length(genres) > 0)::numeric / 
      (SELECT COUNT(DISTINCT movie_id) FROM user_movies WHERE rating IS NOT NULL)::numeric * 100, 
      2
    )
  END as cache_coverage_percent;

COMMENT ON VIEW cache_effectiveness IS 
  'Mostra efetividade do cache de gêneros';
