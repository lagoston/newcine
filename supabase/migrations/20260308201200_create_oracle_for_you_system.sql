/*
  # Oracle "For You" Daily Recommendations System

  ## Summary
  Creates a personalized daily recommendation system tied to each user's Cinematic Essence
  (3-letter archetype code). Generates exactly 5 films per user per day from oracle pools
  aligned to the user's primary archetype (letters 1-2) and subcategory (letter 3).

  ## New Tables
  - `user_oracle_daily_recommendations`
    - `user_id` (uuid): FK to auth.users
    - `recommendation_date` (date): The calendar date in Brasilia timezone (GMT-3)
    - `movie_id` (integer): TMDB movie ID
    - `pool_position` (smallint 1-5): Order slot

  ## New Functions
  - `get_or_create_user_oracle_recommendations(p_user_id uuid)`: Returns 5 movie IDs for today.
    Generates them if not yet cached for today (GMT-3 date). Pool selection follows the
    user's Cinematic Essence: slots 1+2 from primary archetype, slots 3+4 from secondary,
    slot 5 from subcategory. Falls back to random-surprise (bogart/fincher) if no essence.

  ## Updated Functions
  - `get_or_create_daily_recommendation()`: Now uses Brasilia (GMT-3) timezone for date logic.

  ## Security
  - RLS enabled, users can only read their own records
  - Insert performed by SECURITY DEFINER function only
*/

-- ============================================================
-- 1. Table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_oracle_daily_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_date date NOT NULL,
  movie_id integer NOT NULL,
  pool_position smallint NOT NULL CHECK (pool_position BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, recommendation_date, pool_position)
);

ALTER TABLE user_oracle_daily_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own oracle for you recs"
  ON user_oracle_daily_recommendations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_oracle_daily_recs_user_date
  ON user_oracle_daily_recommendations(user_id, recommendation_date);

-- ============================================================
-- 2. Fix global daily recommendation to use GMT-3
-- ============================================================
CREATE OR REPLACE FUNCTION get_or_create_daily_recommendation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date date := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
  existing_movie_id integer;
  all_movie_ids jsonb;
  pool_size integer;
  random_index integer;
  random_movie_id integer;
BEGIN
  SELECT movie_id INTO existing_movie_id
  FROM daily_recommendation
  WHERE recommendation_date = today_date;

  IF existing_movie_id IS NOT NULL THEN
    RETURN existing_movie_id;
  END IF;

  SELECT jsonb_agg(elem::integer)
  INTO all_movie_ids
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(movie_ids)::integer AS elem
    FROM recommendation_pools
    WHERE card_type IN ('bogart', 'fincher')
      AND mood_key = 'random-surprise'
  ) subq;

  IF all_movie_ids IS NULL OR jsonb_array_length(all_movie_ids) = 0 THEN
    RETURN NULL;
  END IF;

  pool_size := jsonb_array_length(all_movie_ids);
  random_index := floor(random() * pool_size)::integer;
  random_movie_id := (all_movie_ids->>random_index)::integer;

  INSERT INTO daily_recommendation (movie_id, recommendation_date)
  VALUES (random_movie_id, today_date)
  ON CONFLICT (recommendation_date) DO NOTHING;

  SELECT movie_id INTO existing_movie_id
  FROM daily_recommendation
  WHERE recommendation_date = today_date;

  RETURN existing_movie_id;
END;
$$;

-- ============================================================
-- 3. Main: personalized 5-film daily oracle recommendations
-- ============================================================
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

  -- Return cached recs if already generated for today
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

  -- Load user's library (to avoid recommending titles already in it)
  SELECT array_agg(um.movie_id) INTO v_library
  FROM user_movies um WHERE um.user_id = p_user_id;
  IF v_library IS NULL THEN v_library := ARRAY[]::integer[]; END IF;

  -- Load cinematic essence
  SELECT p.personalidade_completa INTO v_essence
  FROM profiles p WHERE p.id = p_user_id;

  IF v_essence IS NOT NULL AND length(v_essence) >= 3 THEN
    v_primary   := substring(v_essence, 1, 1);
    v_secondary := substring(v_essence, 2, 1);
    v_sub       := substring(v_essence, 3, 1);
  END IF;

  -- Iterate over 5 slots
  FOR v_slot IN 1..5 LOOP

    -- --------------------------------------------------------
    -- Determine pool (mood + cards) for this slot
    -- --------------------------------------------------------
    IF v_primary IS NULL THEN
      -- No essence: always random-surprise from bogart|fincher
      v_slot_mood  := 'random-surprise';
      v_slot_cards := ARRAY['bogart', 'fincher'];

    ELSIF v_slot IN (1, 2) THEN
      -- Slots 1+2: primary archetype
      IF v_slot = 1 THEN
        IF    v_primary = 'E' THEN v_slot_mood := 'catharsis';     v_slot_cards := ARRAY['bogart','cypher','fincher'];
        ELSIF v_primary = 'I' THEN v_slot_mood := 'mind-blowing';  v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'C' THEN v_slot_mood := 'adventures';    v_slot_cards := ARRAY['bogart','cypher','fincher'];
        ELSIF v_primary = 'S' THEN v_slot_mood := 'adrenaline';    v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'R' THEN v_slot_mood := 'laugh-out-loud';v_slot_cards := ARRAY['bogart','fincher'];
        ELSE                       v_slot_mood := 'random-surprise';v_slot_cards := ARRAY['bogart','fincher'];
        END IF;
      ELSE -- slot 2
        IF    v_primary = 'E' THEN v_slot_mood := 'romantic';      v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'I' THEN v_slot_mood := 'adventures';    v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'C' THEN v_slot_mood := 'catharsis';     v_slot_cards := ARRAY['cypher','fincher'];
        ELSIF v_primary = 'S' THEN v_slot_mood := 'drug-trip';     v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_primary = 'R' THEN v_slot_mood := 'family-time';   v_slot_cards := ARRAY['bogart','fincher'];
        ELSE                       v_slot_mood := 'random-surprise';v_slot_cards := ARRAY['bogart','fincher'];
        END IF;
      END IF;

    ELSIF v_slot IN (3, 4) THEN
      -- Slots 3+4: secondary archetype
      IF v_slot = 3 THEN
        IF    v_secondary = 'E' THEN v_slot_mood := 'catharsis';     v_slot_cards := ARRAY['bogart','cypher','fincher'];
        ELSIF v_secondary = 'I' THEN v_slot_mood := 'mind-blowing';  v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'C' THEN v_slot_mood := 'adventures';    v_slot_cards := ARRAY['bogart','cypher','fincher'];
        ELSIF v_secondary = 'S' THEN v_slot_mood := 'adrenaline';    v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'R' THEN v_slot_mood := 'laugh-out-loud';v_slot_cards := ARRAY['bogart','fincher'];
        ELSE                         v_slot_mood := 'random-surprise';v_slot_cards := ARRAY['bogart','fincher'];
        END IF;
      ELSE -- slot 4
        IF    v_secondary = 'E' THEN v_slot_mood := 'romantic';      v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'I' THEN v_slot_mood := 'adventures';    v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'C' THEN v_slot_mood := 'catharsis';     v_slot_cards := ARRAY['cypher','fincher'];
        ELSIF v_secondary = 'S' THEN v_slot_mood := 'drug-trip';     v_slot_cards := ARRAY['bogart','fincher'];
        ELSIF v_secondary = 'R' THEN v_slot_mood := 'family-time';   v_slot_cards := ARRAY['bogart','fincher'];
        ELSE                         v_slot_mood := 'random-surprise';v_slot_cards := ARRAY['bogart','fincher'];
        END IF;
      END IF;

    ELSE
      -- Slot 5: subcategory
      IF    v_sub = 'A' THEN
        v_slot_mood := 'laugh-out-loud'; v_slot_cards := ARRAY['bogart','cypher','fincher'];
      ELSIF v_sub = 'B' THEN
        v_slot_mood := 'dark-and-scary'; v_slot_cards := ARRAY['bogart','fincher'];
      ELSIF v_sub = 'K' THEN
        v_slot_mood := 'random-surprise'; v_slot_cards := ARRAY['fincher'];
      ELSIF v_sub = 'X' THEN
        v_slot_mood := 'random-surprise'; v_slot_cards := ARRAY['cypher'];
      ELSIF v_sub = 'D' THEN
        v_slot_mood := (ARRAY['mind-blowing','adventures','catharsis'])[ceil(random()*3)::integer];
        v_slot_cards := ARRAY['bogart','cypher','fincher'];
      ELSIF v_sub = 'L' THEN
        v_slot_mood := (ARRAY['laugh-out-loud','family-time'])[ceil(random()*2)::integer];
        v_slot_cards := ARRAY['bogart','cypher','fincher'];
      ELSE
        v_slot_mood := 'random-surprise'; v_slot_cards := ARRAY['bogart','fincher'];
      END IF;
    END IF;

    -- --------------------------------------------------------
    -- Pick a movie from the determined pool
    -- First try: exclude library + already picked
    -- --------------------------------------------------------
    SELECT array_agg(DISTINCT sub.elem)
    INTO v_avail
    FROM (
      SELECT jsonb_array_elements_text(rp.movie_ids)::integer AS elem
      FROM recommendation_pools rp
      WHERE rp.card_type = ANY(v_slot_cards)
        AND rp.mood_key = v_slot_mood
    ) sub
    WHERE sub.elem != ALL(v_library || v_picked);

    -- Fallback: if all pool movies are in library, only exclude already-picked
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

    -- Pick a random movie and record it
    IF v_avail IS NOT NULL AND array_length(v_avail, 1) > 0 THEN
      v_pool_size := array_length(v_avail, 1);
      v_picked_id := v_avail[ceil(random() * v_pool_size)::integer];
      v_picked    := v_picked || ARRAY[v_picked_id];
      v_result    := v_result || ARRAY[v_picked_id];
    END IF;

  END LOOP;

  -- Persist the generated recommendations
  FOR v_slot IN 1..array_length(v_result, 1) LOOP
    INSERT INTO user_oracle_daily_recommendations
      (user_id, recommendation_date, movie_id, pool_position)
    VALUES
      (p_user_id, v_today, v_result[v_slot], v_slot::smallint)
    ON CONFLICT (user_id, recommendation_date, pool_position) DO NOTHING;
  END LOOP;

  -- Return
  RETURN QUERY
    SELECT uodr.movie_id, uodr.pool_position
    FROM user_oracle_daily_recommendations uodr
    WHERE uodr.user_id = p_user_id AND uodr.recommendation_date = v_today
    ORDER BY uodr.pool_position;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_user_oracle_recommendations(uuid) TO authenticated;
