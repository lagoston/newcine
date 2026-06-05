/*
  # Bônus Cultural para Filmes Clássicos (anterior a 1980)

  Filmes com data de lançamento <= 1979 ganham 2 pontos extras em Cultural,
  seguindo o mesmo multiplicador de nota: positivo (6–10), neutro (5), negativo (0–4).

  Mudanças:
  - Nova função helper: get_movie_release_year(integer)
  - update_user_spectrogram_points: aceita p_release_year, aplica bônus vintage
  - remove_spectrogram_points_for_rating: aceita p_release_year, reverte bônus
  - trigger_update_spectrogram_on_rating_change: busca e repassa release_year
  - recalculate_user_spectrogram_with_cache: busca e repassa release_year no loop
*/

-- Helper: retorna o ano de lançamento de um filme pelo tmdb_id
CREATE OR REPLACE FUNCTION public.get_movie_release_year(p_movie_id integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXTRACT(YEAR FROM release_date)::integer
  FROM movie_cache
  WHERE tmdb_id = p_movie_id
  LIMIT 1;
$$;

-- Atualiza pontos incrementalmente (INSERT/UPDATE de avaliação)
CREATE OR REPLACE FUNCTION public.update_user_spectrogram_points(
  p_user_id uuid,
  p_movie_genres jsonb,
  p_user_rating numeric,
  p_old_rating numeric DEFAULT NULL,
  p_release_year integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  genre_item jsonb;
  genre_name text;
  base_points RECORD;
  multiplier numeric;
  old_multiplier numeric;
  delta_e numeric := 0;
  delta_i numeric := 0;
  delta_c numeric := 0;
  delta_s numeric := 0;
  delta_r numeric := 0;
  vintage_bonus numeric := 0;
BEGIN
  multiplier := calculate_rating_multiplier(p_user_rating);

  IF p_old_rating IS NOT NULL THEN
    old_multiplier := calculate_rating_multiplier(p_old_rating);
  END IF;

  -- Pontos de gênero
  FOR genre_item IN SELECT * FROM jsonb_array_elements(p_movie_genres)
  LOOP
    genre_name := genre_item->>'name';
    SELECT * INTO base_points FROM get_genre_base_points(genre_name);

    IF p_old_rating IS NOT NULL THEN
      delta_e := delta_e - (base_points.e * old_multiplier) + (base_points.e * multiplier);
      delta_i := delta_i - (base_points.i * old_multiplier) + (base_points.i * multiplier);
      delta_c := delta_c - (base_points.c * old_multiplier) + (base_points.c * multiplier);
      delta_s := delta_s - (base_points.s * old_multiplier) + (base_points.s * multiplier);
      delta_r := delta_r - (base_points.r * old_multiplier) + (base_points.r * multiplier);
    ELSE
      delta_e := delta_e + (base_points.e * multiplier);
      delta_i := delta_i + (base_points.i * multiplier);
      delta_c := delta_c + (base_points.c * multiplier);
      delta_s := delta_s + (base_points.s * multiplier);
      delta_r := delta_r + (base_points.r * multiplier);
    END IF;
  END LOOP;

  -- Bônus Cultural para filmes clássicos (anterior a 1980)
  IF p_release_year IS NOT NULL AND p_release_year <= 1979 THEN
    IF p_old_rating IS NOT NULL THEN
      delta_c := delta_c - (2.0 * old_multiplier) + (2.0 * multiplier);
    ELSE
      delta_c := delta_c + (2.0 * multiplier);
    END IF;
  END IF;

  UPDATE profiles
  SET
    pontos_e = pontos_e + delta_e,
    pontos_i = pontos_i + delta_i,
    pontos_c = pontos_c + delta_c,
    pontos_s = pontos_s + delta_s,
    pontos_r = pontos_r + delta_r,
    updated_at = NOW()
  WHERE id = p_user_id;

  PERFORM update_user_archetypes(p_user_id);
END;
$$;

-- Remove pontos ao deletar avaliação
CREATE OR REPLACE FUNCTION public.remove_spectrogram_points_for_rating(
  p_user_id uuid,
  p_movie_genres jsonb,
  p_user_rating numeric,
  p_release_year integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  genre_item jsonb;
  genre_name text;
  base_points RECORD;
  multiplier numeric;
  delta_e numeric := 0;
  delta_i numeric := 0;
  delta_c numeric := 0;
  delta_s numeric := 0;
  delta_r numeric := 0;
BEGIN
  multiplier := calculate_rating_multiplier(p_user_rating);

  FOR genre_item IN SELECT * FROM jsonb_array_elements(p_movie_genres)
  LOOP
    genre_name := genre_item->>'name';
    SELECT * INTO base_points FROM get_genre_base_points(genre_name);

    delta_e := delta_e - (base_points.e * multiplier);
    delta_i := delta_i - (base_points.i * multiplier);
    delta_c := delta_c - (base_points.c * multiplier);
    delta_s := delta_s - (base_points.s * multiplier);
    delta_r := delta_r - (base_points.r * multiplier);
  END LOOP;

  -- Reverter bônus vintage
  IF p_release_year IS NOT NULL AND p_release_year <= 1979 THEN
    delta_c := delta_c - (2.0 * multiplier);
  END IF;

  UPDATE profiles
  SET
    pontos_e = pontos_e + delta_e,
    pontos_i = pontos_i + delta_i,
    pontos_c = pontos_c + delta_c,
    pontos_s = pontos_s + delta_s,
    pontos_r = pontos_r + delta_r,
    updated_at = NOW()
  WHERE id = p_user_id;

  PERFORM update_user_archetypes(p_user_id);
END;
$$;

-- Trigger: busca gêneros + ano e repassa para as funções de pontuação
CREATE OR REPLACE FUNCTION public.trigger_update_spectrogram_on_rating_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  movie_genres jsonb;
  release_year integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    movie_genres := get_movie_genres(OLD.movie_id);
    release_year := get_movie_release_year(OLD.movie_id);
  ELSE
    movie_genres := get_movie_genres(NEW.movie_id);
    release_year := get_movie_release_year(NEW.movie_id);
  END IF;

  IF movie_genres IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.rating IS NOT NULL THEN
      PERFORM update_user_spectrogram_points(
        NEW.user_id, movie_genres, NEW.rating::numeric, NULL, release_year
      );
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.rating IS DISTINCT FROM NEW.rating) THEN
      IF OLD.rating IS NOT NULL AND NEW.rating IS NOT NULL THEN
        PERFORM update_user_spectrogram_points(
          NEW.user_id, movie_genres, NEW.rating::numeric, OLD.rating::numeric, release_year
        );
      ELSIF OLD.rating IS NOT NULL AND NEW.rating IS NULL THEN
        PERFORM remove_spectrogram_points_for_rating(
          OLD.user_id, movie_genres, OLD.rating::numeric, release_year
        );
      ELSIF OLD.rating IS NULL AND NEW.rating IS NOT NULL THEN
        PERFORM update_user_spectrogram_points(
          NEW.user_id, movie_genres, NEW.rating::numeric, NULL, release_year
        );
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.rating IS NOT NULL THEN
      PERFORM remove_spectrogram_points_for_rating(
        OLD.user_id, movie_genres, OLD.rating::numeric, release_year
      );
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Recálculo completo por usuário: inclui bônus vintage no loop
CREATE OR REPLACE FUNCTION public.recalculate_user_spectrogram_with_cache(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_rating RECORD;
  movie_genres jsonb;
  release_year integer;
  total_ratings integer := 0;
  processed integer := 0;
  skipped integer := 0;
  result json;
BEGIN
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

  SELECT COUNT(*) INTO total_ratings
  FROM user_movies
  WHERE user_id = p_user_id AND rating IS NOT NULL;

  FOR user_rating IN
    SELECT um.movie_id, um.rating
    FROM user_movies um
    WHERE um.user_id = p_user_id AND um.rating IS NOT NULL
  LOOP
    movie_genres := get_movie_genres(user_rating.movie_id);
    release_year := get_movie_release_year(user_rating.movie_id);

    IF movie_genres IS NOT NULL AND jsonb_array_length(movie_genres) > 0 THEN
      PERFORM update_user_spectrogram_points(
        p_user_id,
        movie_genres,
        user_rating.rating::numeric,
        NULL,
        release_year
      );
      processed := processed + 1;
    ELSE
      skipped := skipped + 1;
    END IF;
  END LOOP;

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

-- Recalcular todos os usuários com a nova regra
SELECT auto_recalculate_after_rebalance('BÔNUS VINTAGE: filmes anteriores a 1980 ganham +2 pontos Cultural (mesma fórmula de multiplicador)');
