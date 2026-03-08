/*
  # Fix Oracle For You function: drop and recreate to resolve column ambiguity

  ## Problem
  `pool_position` in the RETURNS TABLE conflicts with the same-named column in INSERT/ON CONFLICT.
  Fixed by using ON CONFLICT ON CONSTRAINT (by name) instead of column list, and fixing the
  array random index to use floor()+1 to avoid index 0.
*/

DROP FUNCTION IF EXISTS get_or_create_user_oracle_recommendations(uuid);

CREATE OR REPLACE FUNCTION get_or_create_user_oracle_recommendations(p_user_id uuid)
RETURNS TABLE (movie_id integer, pool_position smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today      date    := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_essence    text;
  v_primary    text;
  v_secondary  text;
  v_sub        text;
  v_library    integer[] := ARRAY[]::integer[];
  v_picked     integer[] := ARRAY[]::integer[];
  v_result     integer[] := ARRAY[]::integer[];
  v_slot_mood  text;
  v_slot_cards text[];
  v_avail      integer[];
  v_pool_size  integer;
  v_picked_id  integer;
  v_slot       integer;
BEGIN

  IF EXISTS (
    SELECT 1 FROM user_oracle_daily_recommendations uodr
    WHERE uodr.user_id = p_user_id AND uodr.recommendation_date = v_today
  ) THEN
    RETURN QUERY
      SELECT uodr.movie_id, uodr.pool_position
      FROM user_oracle_daily_recommendations uodr
      WHERE uodr.user_id = p_user_id AND uodr.recommendation_date = v_today
      ORDER BY uodr.pool_position;
    RETURN;
  END IF;

  SELECT array_agg(um.movie_id) INTO v_library
  FROM user_movies um WHERE um.user_id = p_user_id;
  IF v_library IS NULL THEN v_library := ARRAY[]::integer[]; END IF;

  SELECT p.personalidade_completa INTO v_essence
  FROM profiles p WHERE p.id = p_user_id;

  IF v_essence IS NOT NULL AND length(v_essence) >= 3 THEN
    v_primary   := substring(v_essence, 1, 1);
    v_secondary := substring(v_essence, 2, 1);
    v_sub       := substring(v_essence, 3, 1);
  END IF;

  FOR v_slot IN 1..5 LOOP

    IF v_primary IS NULL THEN
      v_slot_mood  := 'random-surprise';
      v_slot_cards := ARRAY['bogart', 'fincher'];

    ELSIF v_slot IN (1, 2) THEN
      IF v_slot = 1 THEN
        IF    v_primary = 'E' THEN v_slot_mood := 'catharsis';     v_slot_cards := ARRAY['bogart','cypher','fincher'];
        ELSIF v_primary = 'I' THEN v_slot_mood := 'mind-blowing';  v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'C' THEN v_slot_mood := 'adventures';    v_slot_cards := ARRAY['bogart','cypher','fincher'];
        ELSIF v_primary = 'S' THEN v_slot_mood := 'adrenaline';    v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'R' THEN v_slot_mood := 'laugh-out-loud';v_slot_cards := ARRAY['bogart','fincher'];
        ELSE                       v_slot_mood := 'random-surprise';v_slot_cards := ARRAY['bogart','fincher'];
        END IF;
      ELSE
        IF    v_primary = 'E' THEN v_slot_mood := 'romantic';       v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'I' THEN v_slot_mood := 'adventures';     v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'C' THEN v_slot_mood := 'catharsis';      v_slot_cards := ARRAY['cypher','fincher'];
        ELSIF v_primary = 'S' THEN v_slot_mood := 'drug-trip';      v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'R' THEN v_slot_mood := 'family-time';    v_slot_cards := ARRAY['bogart','fincher'];
        ELSE                       v_slot_mood := 'random-surprise'; v_slot_cards := ARRAY['bogart','fincher'];
        END IF;
      END IF;

    ELSIF v_slot IN (3, 4) THEN
      IF v_slot = 3 THEN
        IF    v_secondary = 'E' THEN v_slot_mood := 'catharsis';     v_slot_cards := ARRAY['bogart','cypher','fincher'];
        ELSIF v_secondary = 'I' THEN v_slot_mood := 'mind-blowing';  v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'C' THEN v_slot_mood := 'adventures';    v_slot_cards := ARRAY['bogart','cypher','fincher'];
        ELSIF v_secondary = 'S' THEN v_slot_mood := 'adrenaline';    v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'R' THEN v_slot_mood := 'laugh-out-loud';v_slot_cards := ARRAY['bogart','fincher'];
        ELSE                         v_slot_mood := 'random-surprise';v_slot_cards := ARRAY['bogart','fincher'];
        END IF;
      ELSE
        IF    v_secondary = 'E' THEN v_slot_mood := 'romantic';       v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'I' THEN v_slot_mood := 'adventures';     v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'C' THEN v_slot_mood := 'catharsis';      v_slot_cards := ARRAY['cypher','fincher'];
        ELSIF v_secondary = 'S' THEN v_slot_mood := 'drug-trip';      v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'R' THEN v_slot_mood := 'family-time';    v_slot_cards := ARRAY['bogart','fincher'];
        ELSE                         v_slot_mood := 'random-surprise'; v_slot_cards := ARRAY['bogart','fincher'];
        END IF;
      END IF;

    ELSE
      IF    v_sub = 'A' THEN
        v_slot_mood := 'laugh-out-loud'; v_slot_cards := ARRAY['bogart','cypher','fincher'];
      ELSIF v_sub = 'B' THEN
        v_slot_mood := 'dark-and-scary'; v_slot_cards := ARRAY['bogart','fincher'];
      ELSIF v_sub = 'K' THEN
        v_slot_mood := 'random-surprise'; v_slot_cards := ARRAY['fincher'];
      ELSIF v_sub = 'X' THEN
        v_slot_mood := 'random-surprise'; v_slot_cards := ARRAY['cypher'];
      ELSIF v_sub = 'D' THEN
        v_slot_mood := (ARRAY['mind-blowing','adventures','catharsis'])[floor(random()*3)::integer + 1];
        v_slot_cards := ARRAY['bogart','cypher','fincher'];
      ELSIF v_sub = 'L' THEN
        v_slot_mood := (ARRAY['laugh-out-loud','family-time'])[floor(random()*2)::integer + 1];
        v_slot_cards := ARRAY['bogart','cypher','fincher'];
      ELSE
        v_slot_mood := 'random-surprise'; v_slot_cards := ARRAY['bogart','fincher'];
      END IF;
    END IF;

    SELECT array_agg(DISTINCT sub.elem)
    INTO v_avail
    FROM (
      SELECT jsonb_array_elements_text(rp.movie_ids)::integer AS elem
      FROM recommendation_pools rp
      WHERE rp.card_type = ANY(v_slot_cards)
        AND rp.mood_key = v_slot_mood
    ) sub
    WHERE sub.elem != ALL(v_library || v_picked);

    IF v_avail IS NULL OR array_length(v_avail, 1) = 0 THEN
      SELECT array_agg(DISTINCT sub.elem)
      INTO v_avail
      FROM (
        SELECT jsonb_array_elements_text(rp.movie_ids)::integer AS elem
        FROM recommendation_pools rp
        WHERE rp.card_type = ANY(v_slot_cards)
          AND rp.mood_key = v_slot_mood
      ) sub
      WHERE sub.elem != ALL(v_picked);
    END IF;

    IF v_avail IS NOT NULL AND array_length(v_avail, 1) > 0 THEN
      v_pool_size := array_length(v_avail, 1);
      v_picked_id := v_avail[floor(random() * v_pool_size)::integer + 1];
      v_picked    := v_picked || ARRAY[v_picked_id];
      v_result    := v_result || ARRAY[v_picked_id];
    END IF;

  END LOOP;

  FOR v_slot IN 1..array_length(v_result, 1) LOOP
    INSERT INTO user_oracle_daily_recommendations
      (user_id, recommendation_date, movie_id, pool_position)
    VALUES
      (p_user_id, v_today, v_result[v_slot], v_slot::smallint)
    ON CONFLICT ON CONSTRAINT user_oracle_daily_recommendat_user_id_recommendation_date_p_key
    DO NOTHING;
  END LOOP;

  RETURN QUERY
    SELECT uodr.movie_id, uodr.pool_position
    FROM user_oracle_daily_recommendations uodr
    WHERE uodr.user_id = p_user_id AND uodr.recommendation_date = v_today
    ORDER BY uodr.pool_position;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_user_oracle_recommendations(uuid) TO authenticated;
