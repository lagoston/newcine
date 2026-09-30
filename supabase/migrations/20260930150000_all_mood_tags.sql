-- Uma tag por prateleira (humor): além de Bloody Mary, Punchliner e Cine
-- Cupid, entram as seis que faltavam. Mesma regra das outras: 50 filmes
-- avaliados que moram na prateleira (estão em recommendation_pools com
-- aquele mood_key, em qualquer oráculo).
--
-- • Enigmatic      🧩 → Mind-Blowing        (mind-blowing)
-- • Dreamwalker    🍭 → Psicodélico          (drug-trip)
-- • Trailblazer    🤿 → Aventuras            (adventures)
-- • Soul Collector ☯️ → Catarse              (catharsis)
-- • Daredevil      🧨 → Adrenalina           (adrenaline)
-- • Peter Pan      🧚‍♂️ → Família             (family-time)
--
-- O progresso na tela é calculado no app (src/lib/tagProgress.ts); esta é
-- a checagem de servidor usada pelos itens de personalização.

create or replace function public.is_progression_tag_unlocked(p_user_id uuid, p_tag_name text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  v_count integer;
  v_mood text;
BEGIN
  v_mood := CASE p_tag_name
    WHEN 'Enigmatic' THEN 'mind-blowing'
    WHEN 'Bloody Mary' THEN 'dark-and-scary'
    WHEN 'Dreamwalker' THEN 'drug-trip'
    WHEN 'Trailblazer' THEN 'adventures'
    WHEN 'Soul Collector' THEN 'catharsis'
    WHEN 'Daredevil' THEN 'adrenaline'
    WHEN 'Cine Cupid' THEN 'romantic'
    WHEN 'Peter Pan' THEN 'family-time'
    WHEN 'Punchliner' THEN 'laugh-out-loud'
    ELSE NULL
  END;

  IF v_mood IS NOT NULL THEN
    SELECT COUNT(DISTINCT um.movie_id) INTO v_count
      FROM user_movies um
     WHERE um.user_id = p_user_id
       AND um.rating IS NOT NULL
       AND um.media_type = 'movie'
       AND EXISTS (
         SELECT 1
           FROM recommendation_pools rp
          WHERE rp.mood_key = v_mood
            AND rp.movie_ids @> to_jsonb(um.movie_id)
       );
    RETURN v_count >= 50;
  END IF;

  IF p_tag_name = 'CineHater' THEN
    SELECT COUNT(*) INTO v_count
      FROM user_movies
     WHERE user_id = p_user_id AND rating IS NOT NULL AND rating <= 3;
    RETURN v_count >= 20;
  END IF;

  IF p_tag_name IN ('Scribbler', 'Screenwriter', 'Memoirist') THEN
    SELECT COUNT(*) INTO v_count
      FROM reviews
     WHERE user_id = p_user_id AND is_ai_generated = false;
    RETURN v_count >= (CASE p_tag_name WHEN 'Scribbler' THEN 1 WHEN 'Screenwriter' THEN 10 ELSE 30 END);
  END IF;

  RETURN false;
END;
$$;

revoke execute on function public.is_progression_tag_unlocked(uuid, text) from public, anon, authenticated;
