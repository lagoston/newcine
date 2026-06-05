-- Aumenta bônus Cultural de filmes anteriores a 1980: de 2.0 → 3.0 pontos

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
BEGIN
  multiplier := calculate_rating_multiplier(p_user_rating);

  IF p_old_rating IS NOT NULL THEN
    old_multiplier := calculate_rating_multiplier(p_old_rating);
  END IF;

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

  -- Bônus Cultural vintage: 3 pontos para filmes anteriores a 1980
  IF p_release_year IS NOT NULL AND p_release_year <= 1979 THEN
    IF p_old_rating IS NOT NULL THEN
      delta_c := delta_c - (3.0 * old_multiplier) + (3.0 * multiplier);
    ELSE
      delta_c := delta_c + (3.0 * multiplier);
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

  -- Reverter bônus vintage: 3 pontos
  IF p_release_year IS NOT NULL AND p_release_year <= 1979 THEN
    delta_c := delta_c - (3.0 * multiplier);
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

SELECT auto_recalculate_after_rebalance('BÔNUS VINTAGE ajustado: filmes anteriores a 1980 passam de 2 → 3 pontos Cultural');
