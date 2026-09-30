-- Tags por humor (prateleira) em vez de gênero.
--
-- • Bloody Mary  → 50 filmes avaliados da prateleira Sombrio e Assustador
-- • Punchliner   → 50 filmes avaliados da prateleira Muitas Risadas
-- • Cine Cupid   → 50 filmes avaliados da prateleira Romântico
--   ("mora na prateleira" = está em recommendation_pools com aquele
--   mood_key, em qualquer oráculo — a mesma regra da personalidade)
-- • CineHater    → 20 filmes com nota de 0 a 3 (antes 0 a 2)
-- • Truth Digger e Star Gazer deixam de existir.
--
-- O cálculo do progresso na tela é feito no app (src/lib/tagProgress.ts);
-- aqui ficam a checagem de servidor usada pelos itens de personalização (a
-- carta Horror exige Bloody Mary) e a limpeza do registro de tags.

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
    WHEN 'Bloody Mary' THEN 'dark-and-scary'
    WHEN 'Punchliner' THEN 'laugh-out-loud'
    WHEN 'Cine Cupid' THEN 'romantic'
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

-- Tags removidas: some do registro e de quem estava usando no perfil.
delete from public.user_unlocked_tags where tag_name in ('Truth Digger', 'Star Gazer');
update public.profiles set active_tag = null where active_tag->>'name' in ('Truth Digger', 'Star Gazer');

-- Tags de humor: quem tinha a tag pela regra antiga (gênero) e não cumpre a
-- nova perde o registro — assim recebe o aviso de novo quando conquistar
-- de verdade — e, se estava usando no perfil, a tag sai.
delete from public.user_unlocked_tags uut
 where uut.tag_name in ('Bloody Mary', 'Punchliner', 'Cine Cupid')
   and not public.is_progression_tag_unlocked(uut.user_id, uut.tag_name);

update public.profiles p
   set active_tag = null
 where p.active_tag->>'name' in ('Bloody Mary', 'Punchliner', 'Cine Cupid')
   and not public.is_progression_tag_unlocked(p.id, p.active_tag->>'name');
