/*
  # Sistema de Populaç ão Manual de Gêneros

  ## Objetivo
  Permitir popular manualmente gêneros de filmes que não foram buscados do TMDB

  ## Solução
  1. Função para adicionar gêneros manualmente
  2. Popular filme 448341 com gêneros comuns como fallback temporário
     (será atualizado quando a edge function rodar)

  ## Nota
  O usuário deve chamar a edge function `populate-genres-cache` para buscar
  os gêneros corretos do TMDB. Esta é apenas uma solução temporária.
*/

-- 1. Função para popular gêneros manualmente
CREATE OR REPLACE FUNCTION manually_populate_movie_genres(
  p_movie_id integer,
  p_genre_names text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  genres_jsonb jsonb;
BEGIN
  -- Converter array de nomes para formato JSONB esperado
  genres_jsonb := jsonb_agg(jsonb_build_object('name', genre_name))
    FROM unnest(p_genre_names) AS genre_name;
  
  -- Inserir ou atualizar no cache
  INSERT INTO movie_genres_cache (movie_id, genres, cached_at, updated_at)
  VALUES (p_movie_id, genres_jsonb, NOW(), NOW())
  ON CONFLICT (movie_id) 
  DO UPDATE SET
    genres = genres_jsonb,
    updated_at = NOW();
  
  RETURN json_build_object(
    'success', true,
    'movie_id', p_movie_id,
    'genres', genres_jsonb,
    'message', 'Gêneros adicionados manualmente. Chame populate-genres-cache edge function para atualizar com dados reais do TMDB.'
  );
END;
$$;

COMMENT ON FUNCTION manually_populate_movie_genres(integer, text[]) IS 
  'Adiciona gêneros manualmente para um filme. Útil para fallback temporário enquanto aguarda população via TMDB API.';

-- 2. Popular filme 448341 com gêneros genéricos como fallback temporário
-- TMDB 448341 é geralmente um filme de Drama/Thriller
SELECT manually_populate_movie_genres(
  448341,
  ARRAY['Drama', 'Thriller']
);

-- 3. Recalcular Gustavo especificamente
DO $$
DECLARE
  gustavo_id uuid;
  result json;
BEGIN
  -- Encontrar ID do Gustavo
  SELECT id INTO gustavo_id
  FROM profiles
  WHERE username = 'Gustavo';
  
  IF gustavo_id IS NOT NULL THEN
    -- Recalcular
    result := recalculate_user_spectrogram_with_cache(gustavo_id);
    
    RAISE NOTICE 'Gustavo recalculado: %', result;
  ELSE
    RAISE NOTICE 'Usuário Gustavo não encontrado';
  END IF;
END $$;
