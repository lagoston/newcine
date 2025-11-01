/*
  # Remover Cache Incorreto e Usar TMDB API Diretamente

  ## Problema Real
  O cache foi populado manualmente com gêneros INCORRETOS (Drama/Thriller) para o filme 448341.
  O frontend busca gêneros corretamente do TMDB via API, mas o backend usa cache incorreto.

  ## Solução
  1. Deletar cache incorreto
  2. Modificar sistema para buscar gêneros do TMDB quando não há cache
  3. Edge function populate-genres-cache deve ser chamada para popular corretamente

  ## Importante
  Não vamos mais adivinhar gêneros. Se não há cache, o sistema deve:
  - Alertar que precisa popular o cache via edge function
  - OU buscar diretamente do TMDB durante o cálculo
*/

-- 1. Deletar cache incorreto do filme 448341
DELETE FROM movie_genres_cache WHERE movie_id = 448341;

-- 2. Função para verificar filmes que precisam de cache
CREATE OR REPLACE FUNCTION get_movies_needing_cache()
RETURNS TABLE (
  movie_id integer,
  movie_title text,
  users_affected integer,
  total_ratings integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    um.movie_id,
    COALESCE(m.title, 'Movie ' || um.movie_id::text) as movie_title,
    COUNT(DISTINCT um.user_id)::integer as users_affected,
    COUNT(*)::integer as total_ratings
  FROM user_movies um
  LEFT JOIN movies m ON m.id = um.movie_id
  LEFT JOIN movie_genres_cache mgc ON mgc.movie_id = um.movie_id
  WHERE um.rating IS NOT NULL
    AND (mgc.movie_id IS NULL OR mgc.genres = '[]'::jsonb OR jsonb_array_length(mgc.genres) = 0)
  GROUP BY um.movie_id, m.title
  ORDER BY total_ratings DESC, users_affected DESC;
END;
$$;

COMMENT ON FUNCTION get_movies_needing_cache() IS 
  'Lista filmes avaliados que não têm gêneros no cache e precisam ser populados via TMDB API';

-- 3. Resetar Gustavo para zero temporariamente até que o cache seja populado
UPDATE profiles
SET 
  pontos_e = 0,
  pontos_i = 0,
  pontos_c = 0,
  pontos_s = 0,
  pontos_r = 0,
  arquetipo_primario = NULL,
  arquetipo_secundario = NULL
WHERE username = 'Gustavo';
