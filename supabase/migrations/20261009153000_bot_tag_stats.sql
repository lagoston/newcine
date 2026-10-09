-- Perfis-bot (09/10/2026): estatísticas de tags. Os ids das franquias vêm de FRANCHISE_MOVIES (src/lib/tags.ts).
-- Estatísticas das tags dos bots (as mesmas contas de src/lib/tagProgress.ts), para escolher a tag equipada.
create or replace function curation.bot_tag_stats()
returns json
language sql
stable
security definer
set search_path to 'curation', 'public'
as $fn$
with b as (select user_id, handle from bot_accounts),
r as (select um.user_id, um.movie_id, um.rating, um.media_type from user_movies um join b using (user_id) where um.rating is not null),
pools as (select card_type, mood_key, (x)::int id from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.movie_ids) x),
theme(id, ids) as (values ('mockingjay-victor', array[70160,101299,131631,131634,695721]::int[]),('lucky-player', array[8844,6795]::int[]),('death-dodger', array[9532,9358,9286,19912,55779]::int[]),('hogwarts-graduate', array[671,672,673,674,675,767,12444,12445]::int[]),('force-founder', array[11,1891,1892]::int[]),('don-of-cinema', array[238,240,242]::int[]),('trap-builder', array[771,772]::int[]),('red-pill-adept', array[603,604,605]::int[]),('flux-capacitor-fan', array[105,165,196]::int[]),('ring-expert', array[120,121,122]::int[]),('toy-collector', array[862,863,10193,301528]::int[]),('whip-crack-scholar', array[85,89,90,91]::int[]),('sailor', array[22,58,285,1865,166426]::int[]),('senior-mechanic', array[9799,584,9615,13804,51497,82992,168259,337339,385128,385687]::int[]),('cybertron-sentinel', array[424783,1858,91314,667538,335988,8373,38356]::int[]),('hell-rider', array[1250,71676]::int[]),('swamp-royalty', array[808,809,810,10192]::int[]),('dino-tamer', array[329,330,331,135397,351286,507086]::int[]),('banana-boss', array[39538,93456,324852,211672,438148]::int[]),('baba-yaga', array[245891,324552,458156,603692]::int[]),('casual-drinker', array[18785,45243,109439]::int[]),('sweetie-pie', array[2105,2770,8273,71552]::int[]),('visceral-gamer', array[176,215,214,663,11917,22804,41439,298250,602734,951491]::int[]),('nuts', array[425,950,8355,57800,278154,774825]::int[]),('dark-spirit', array[272,155,49026]::int[]),('infinity-gauntlet', array[24428,299536,99861,299534]::int[]),('sharp-canine', array[122,121,240,50619,50620]::int[]),('primal-essence', array[61791,119450,281338,653346]::int[])),
st as (
  select b.handle, b.user_id,
    (select count(*) from r where r.user_id = b.user_id) rated,
    (select count(*) from r where r.user_id = b.user_id and r.rating <= 3) hater,
    (select count(*) from r where r.user_id = b.user_id and r.rating = 10) golden,
    (select coalesce(max(n), 0) from (select mc.director, count(*) n from r join movie_cache mc on mc.tmdb_id = r.movie_id and mc.media_type = r.media_type
        where r.user_id = b.user_id and mc.director is not null group by 1) z) dir_max,
    (select coalesce(array_agg(distinct mc.origin_country[1]), '{}') from r join movie_cache mc on mc.tmdb_id = r.movie_id and mc.media_type = r.media_type
        where r.user_id = b.user_id and mc.origin_country[1] is not null) countries,
    (select coalesce(jsonb_object_agg(mood_key, n), '{}') from (select p.mood_key, count(distinct r.movie_id) n from r join pools p on p.id = r.movie_id
        where r.user_id = b.user_id and r.media_type = 'movie' and p.mood_key <> 'random-surprise' group by 1) z) moods,
    (select coalesce(jsonb_object_agg(card_type, n), '{}') from (select p.card_type, count(distinct r.movie_id) n from r join pools p on p.id = r.movie_id
        where r.user_id = b.user_id group by 1) z) oracles,
    (select coalesce(jsonb_object_agg(t.id, (select count(*) from unnest(t.ids) i where exists (select 1 from r where r.user_id = b.user_id and r.movie_id = i))), '{}') from theme t) theme,
    (select count(*) from friendships f where f.status = 'accepted' and (f.requester_id = b.user_id or f.addressee_id = b.user_id)) friends,
    (select count(*) from reviews v where v.user_id = b.user_id and not v.is_ai_generated) reviews_real,
    (select count(*) from reviews v where v.user_id = b.user_id and v.is_ai_generated) reviews_ai,
    (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'emoji', s.emoji)), '[]') from user_special_tags us join special_tags s on s.id = us.tag_id where us.user_id = b.user_id) special
  from b
)
select json_agg(st) from st
$fn$;
revoke all on function curation.bot_tag_stats() from public, anon, authenticated;

-- Veste os bots: em cada categoria (moldura, banner, carta, efeito de texto), um item ao acaso entre os
-- que is_cosmetic_unlocked() libera para aquele bot (fora o padrão); sem nenhum liberado, fica o padrão.
-- Quem já veste um item liberado continua com ele (rodar de novo não embaralha).
create or replace function curation.dress_bots()
returns integer
language plpgsql
security definer
set search_path to 'curation', 'public'
as $fn$
declare
  v_bot record;
  v_cat text;
  v_col text;
  v_cur text;
  v_pick text;
  v_n integer := 0;
begin
  for v_bot in select user_id from public.bot_accounts loop
    foreach v_cat in array array['frame', 'banner', 'card', 'text_effect'] loop
      v_col := case v_cat when 'frame' then 'avatar_frame' when 'banner' then 'banner' when 'card' then 'card_style' else 'text_effect' end;
      execute format('select %I from public.profiles where id = $1', v_col) into v_cur using v_bot.user_id;
      if coalesce(v_cur, 'default') <> 'default' and public.is_cosmetic_unlocked(v_bot.user_id, v_cat, v_cur) then
        continue;
      end if;
      select cr.cosmetic_id into v_pick
      from public.cosmetic_requirements cr
      where cr.category = v_cat and cr.cosmetic_id <> 'default'
        and public.is_cosmetic_unlocked(v_bot.user_id, v_cat, cr.cosmetic_id)
      order by random() limit 1;
      v_pick := coalesce(v_pick, 'default');
      execute format('update public.profiles set %I = $1 where id = $2 and %I is distinct from $1', v_col, v_col)
        using v_pick, v_bot.user_id;
      if v_pick <> 'default' then v_n := v_n + 1; end if;
    end loop;
  end loop;
  return v_n;
end $fn$;
revoke all on function curation.dress_bots() from public, anon, authenticated;
