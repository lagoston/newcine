-- As séries das prateleiras passam a contar (21/10/2026).
--
-- Desde 09/10/2026 cada prateleira dos oráculos tem séries (recommendation_pools.tv_ids),
-- mas tudo o que conta "títulos das prateleiras" de uma pessoa continuava olhando só os
-- filmes (movie_ids e user_movies.media_type = 'movie'). O Bruno achou o caso pela conta
-- @Tonico: Tenet (filme), Vikings e La Casa de Papel (séries), todos das prateleiras, e o
-- Oráculo e o perfil mostravam 1. Afetava 42 contas (695 notas de séries ignoradas).
--
-- Passam a contar filmes E séries, cada título casado pelo tipo (um id de filme nunca
-- vale por uma série de mesmo número):
--   • refresh_user_persona: personalidade, pontos por prateleira e o "x de 10";
--   • get_user_favorite_moods_order__impl: ordem das prateleiras na Biblioteca dos Oráculos;
--   • get_user_mood_profile;
--   • is_progression_tag_unlocked: tags de humor (50 títulos de uma prateleira);
--   • get_profile_mood_titles_v2 (nova): a roda dos humores do perfil, agora com o tipo de
--     cada título. A get_profile_mood_titles antiga fica igual, para os apps instalados;
--   • curation.bot_tag_stats: as mesmas contas para os bots.
-- E, para a personalidade nunca mais ficar para trás quando as prateleiras mudam (curadoria,
-- lista de pesca), um gatilho em recommendation_pools recalcula quem avaliou os títulos que
-- entraram ou saíram. Por isso pesca_adicionar não precisa mais recalcular por conta própria.
--
-- No fim, todas as personalidades são recalculadas.

-- ---------------------------------------------------------------------------
-- Os títulos das prateleiras, com o tipo
-- ---------------------------------------------------------------------------

create or replace function public.shelf_titles()
returns table (card_type text, mood_key text, media_type text, tmdb_id integer)
language sql
stable
security definer
set search_path = public
as $$
  select rp.card_type, rp.mood_key, 'movie'::text, (e #>> '{}')::integer
  from public.recommendation_pools rp
  cross join lateral jsonb_array_elements(coalesce(rp.movie_ids, '[]'::jsonb)) e
  union all
  select rp.card_type, rp.mood_key, 'tv'::text, (e #>> '{}')::integer
  from public.recommendation_pools rp
  cross join lateral jsonb_array_elements(coalesce(rp.tv_ids, '[]'::jsonb)) e;
$$;

revoke all on function public.shelf_titles() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Personalidade
-- ---------------------------------------------------------------------------

create or replace function public.refresh_user_persona(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scores jsonb;
  v_counted integer;
  v_moods_used integer;
  v_code text;
begin
  with rated as (
    select um.media_type, um.movie_id, um.rating::numeric as rating
      from user_movies um
     where um.user_id = p_user_id
       and um.rating is not null
       and um.media_type in ('movie', 'tv')
  ),
  curated as (
    select distinct st.mood_key, st.media_type, st.tmdb_id
      from shelf_titles() st
     where st.mood_key <> 'random-surprise'
  ),
  per_mood as (
    select m.mood_key, m.letter, m.sort_order,
           coalesce(sum(r.rating), 0) as score,
           count(r.movie_id) as films
      from cine_moods m
      left join curated c on c.mood_key = m.mood_key
      left join rated r on r.movie_id = c.tmdb_id and r.media_type = c.media_type
     group by m.mood_key, m.letter, m.sort_order
  ),
  ranked as (
    select pm.*, row_number() over (order by pm.score desc, pm.films desc, pm.sort_order) as rk
      from per_mood pm
  )
  select jsonb_agg(jsonb_build_object('mood_key', mood_key, 'score', score, 'films', films) order by rk),
         coalesce(sum(films), 0)::integer,
         (count(*) filter (where films > 0))::integer,
         string_agg(letter, '' order by sort_order) filter (where rk <= 3 and films > 0)
    into v_scores, v_counted, v_moods_used, v_code
    from ranked;

  if v_counted < 10 or v_moods_used < 3 or length(coalesce(v_code, '')) <> 3 then
    v_code := null;
  end if;

  update profiles
     set personalidade_completa = v_code,
         persona_scores = v_scores,
         persona_counted = v_counted,
         persona_updated_at = now()
   where id = p_user_id
     and (personalidade_completa is distinct from v_code
          or persona_scores is distinct from v_scores
          or persona_counted is distinct from v_counted);

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ordem das prateleiras, perfil de humores e tags de humor
-- ---------------------------------------------------------------------------

create or replace function public.get_user_favorite_moods_order__impl(p_user_id uuid)
returns table (mood_key text, score numeric)
language sql
stable
security definer
set search_path = public
as $$
  with all_moods as (
    select distinct rp.mood_key
    from recommendation_pools rp
    where rp.mood_key <> 'random-surprise'
  ),
  pool_matches as (
    select distinct um.media_type, um.movie_id, um.rating, st.mood_key
    from user_movies um
    join shelf_titles() st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
    where um.user_id = p_user_id and um.rating is not null and st.mood_key <> 'random-surprise'
  )
  select am.mood_key, coalesce(sum(pm.rating), 0) as score
  from all_moods am
  left join pool_matches pm on pm.mood_key = am.mood_key
  group by am.mood_key
  order by score desc;
$$;

create or replace function public.get_user_mood_profile(p_user_id uuid)
returns table (mood_key text, avg_rating numeric, movie_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with titles as (
    select distinct st.mood_key, um.media_type, um.movie_id, um.rating
    from user_movies um
    join shelf_titles() st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
    where um.user_id = p_user_id and um.rating is not null and st.mood_key <> 'random-surprise'
  )
  select t.mood_key, avg(t.rating)::numeric, count(*)::bigint
  from titles t
  group by t.mood_key;
$$;

create or replace function public.is_progression_tag_unlocked(p_user_id uuid, p_tag_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_mood text;
begin
  v_mood := case p_tag_name
    when 'Enigmatic' then 'mind-blowing'
    when 'Bloody Mary' then 'dark-and-scary'
    when 'Dreamwalker' then 'drug-trip'
    when 'Trailblazer' then 'adventures'
    when 'Soul Collector' then 'catharsis'
    when 'Daredevil' then 'adrenaline'
    when 'Cine Cupid' then 'romantic'
    when 'Peter Pan' then 'family-time'
    when 'Punchliner' then 'laugh-out-loud'
    else null
  end;

  if v_mood is not null then
    select count(*) into v_count
      from (
        select distinct um.media_type, um.movie_id
          from user_movies um
          join shelf_titles() st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
         where um.user_id = p_user_id
           and um.rating is not null
           and st.mood_key = v_mood
      ) t;
    return v_count >= 50;
  end if;

  if p_tag_name in ('Balcony Regular', 'Seat Warmer', 'Popcorn Pro', 'Reel Addict', 'Cine Elite', 'Projectionist Supreme', 'Cinematic Guru') then
    select count(*) into v_count
      from user_movies
     where user_id = p_user_id and rating is not null;
    return v_count >= (case p_tag_name
      when 'Balcony Regular' then 1
      when 'Seat Warmer' then 20
      when 'Popcorn Pro' then 50
      when 'Reel Addict' then 100
      when 'Cine Elite' then 200
      when 'Projectionist Supreme' then 500
      else 1000
    end);
  end if;

  if p_tag_name = 'CineHater' then
    select count(*) into v_count
      from user_movies
     where user_id = p_user_id and rating is not null and rating <= 3;
    return v_count >= 20;
  end if;

  if p_tag_name in ('Scribbler', 'Screenwriter', 'Memoirist') then
    select count(*) into v_count
      from reviews
     where user_id = p_user_id and is_ai_generated = false;
    return v_count >= (case p_tag_name when 'Scribbler' then 1 when 'Screenwriter' then 10 else 30 end);
  end if;

  return false;
end;
$$;

-- A roda dos humores do perfil: em que prateleira está cada título avaliado, com o tipo.
create or replace function public.get_profile_mood_titles_v2(p_user_id uuid)
returns table (movie_id integer, media_type text, mood_key text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct um.movie_id, um.media_type, st.mood_key
    from public.user_movies um
    join public.shelf_titles() st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
   where um.user_id = p_user_id
     and um.rating is not null
     and st.mood_key <> 'random-surprise'
     and public.can_view_user_content(p_user_id);
$$;

grant execute on function public.get_profile_mood_titles_v2(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Prateleiras mudaram: recalcula quem avaliou o que entrou ou saiu
-- ---------------------------------------------------------------------------

create or replace function public.trigger_pools_persona_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if new.mood_key = 'random-surprise' then
    return null;
  end if;
  for v_user in
    with changed as (
      select 'movie'::text mt, d.x::integer id
        from ((select jsonb_array_elements_text(coalesce(new.movie_ids, '[]'::jsonb))
               except select jsonb_array_elements_text(coalesce(old.movie_ids, '[]'::jsonb)))
              union
              (select jsonb_array_elements_text(coalesce(old.movie_ids, '[]'::jsonb))
               except select jsonb_array_elements_text(coalesce(new.movie_ids, '[]'::jsonb)))) d(x)
      union all
      select 'tv'::text, d.x::integer
        from ((select jsonb_array_elements_text(coalesce(new.tv_ids, '[]'::jsonb))
               except select jsonb_array_elements_text(coalesce(old.tv_ids, '[]'::jsonb)))
              union
              (select jsonb_array_elements_text(coalesce(old.tv_ids, '[]'::jsonb))
               except select jsonb_array_elements_text(coalesce(new.tv_ids, '[]'::jsonb)))) d(x)
    )
    select distinct um.user_id
      from user_movies um
      join changed c on c.id = um.movie_id and c.mt = um.media_type
     where um.rating is not null
  loop
    perform refresh_user_persona(v_user);
  end loop;
  return null;
end;
$$;

revoke all on function public.trigger_pools_persona_refresh() from public, anon, authenticated;

create or replace trigger pools_persona_refresh
  after update of movie_ids, tv_ids on public.recommendation_pools
  for each row
  when (old.movie_ids is distinct from new.movie_ids or old.tv_ids is distinct from new.tv_ids)
  execute function public.trigger_pools_persona_refresh();

-- Lista de pesca: a personalidade agora é recalculada pelo gatilho acima (filmes e séries).
create or replace function public.pesca_adicionar(p_tmdb_id integer, p_media_type text default 'movie'::text, p_humor text default null::text, p_oraculo text default null::text)
returns text
language plpgsql
security definer
set search_path = public, curation
as $$
declare
  r public.pesca%rowtype;
  v_humor text;
  v_oraculo text;
  v_col text;
  v_rows integer;
begin
  select * into r from public.pesca where tmdb_id = p_tmdb_id and media_type = p_media_type;
  if not found then
    raise exception 'O título % (%) não está na lista de pesca', p_tmdb_id, p_media_type;
  end if;
  v_humor := coalesce(p_humor, r.humor_sugerido);
  v_oraculo := coalesce(p_oraculo, r.oraculo_sugerido);
  if v_humor is null or v_humor not in ('mind-blowing', 'dark-and-scary', 'drug-trip', 'adventures', 'catharsis',
                                        'adrenaline', 'romantic', 'family-time', 'laugh-out-loud') then
    raise exception 'Humor inválido ou sem sugestão: passe um dos 9 (ex.: ''adrenaline'')';
  end if;
  if v_oraculo is null or v_oraculo not in ('bogart', 'fincher', 'cypher') then
    raise exception 'Oráculo inválido: bogart, fincher ou cypher';
  end if;
  if exists (
    select 1 from public.recommendation_pools rp
    where rp.mood_key <> 'random-surprise'
      and (case when p_media_type = 'movie' then rp.movie_ids else coalesce(rp.tv_ids, '[]'::jsonb) end) @> to_jsonb(p_tmdb_id)
  ) then
    update public.pesca set status = 'adicionado', adicionado_em = coalesce(adicionado_em, now()), motivo = 'já está numa prateleira'
     where tmdb_id = p_tmdb_id and media_type = p_media_type;
    return format('%s já estava numa prateleira', coalesce(r.titulo, p_tmdb_id::text));
  end if;

  v_col := case when p_media_type = 'movie' then 'movie_ids' else 'tv_ids' end;
  execute format(
    'update public.recommendation_pools set %1$I = coalesce(%1$I, ''[]''::jsonb) || to_jsonb($1) where card_type = $2 and mood_key = $3',
    v_col)
  using p_tmdb_id, v_oraculo, v_humor;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Prateleira %/% não encontrada', v_oraculo, v_humor;
  end if;

  if not exists (select 1 from public.movie_cache where tmdb_id = p_tmdb_id and media_type = p_media_type) then
    perform curation.request_title_cache(jsonb_build_array(jsonb_build_object('id', p_tmdb_id, 'type', p_media_type)), 'fill');
  end if;

  update public.pesca
     set status = 'adicionado', adicionado_em = now(), humor_sugerido = v_humor, oraculo_sugerido = v_oraculo,
         motivo = format('adicionado em %s · %s', v_oraculo, v_humor)
   where tmdb_id = p_tmdb_id and media_type = p_media_type;

  return format('%s entrou em %s · %s', coalesce(r.titulo, p_tmdb_id::text), v_oraculo, v_humor);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bots: as mesmas contas (humores e oráculos com filmes e séries, casados pelo tipo)
-- ---------------------------------------------------------------------------

create or replace function curation.bot_tag_stats()
returns json
language sql
stable
security definer
set search_path to 'curation', 'public'
as $fn$
with b as (select user_id, handle from bot_accounts),
r as (select um.user_id, um.movie_id, um.rating, um.media_type from user_movies um join b using (user_id) where um.rating is not null),
pools as (select card_type, mood_key, media_type, tmdb_id id from public.shelf_titles()),
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
    (select coalesce(jsonb_object_agg(mood_key, n), '{}') from (select p.mood_key, count(distinct (r.media_type, r.movie_id)) n from r join pools p on p.id = r.movie_id and p.media_type = r.media_type
        where r.user_id = b.user_id and p.mood_key <> 'random-surprise' group by 1) z) moods,
    (select coalesce(jsonb_object_agg(card_type, n), '{}') from (select p.card_type, count(distinct (r.media_type, r.movie_id)) n from r join pools p on p.id = r.movie_id and p.media_type = r.media_type
        where r.user_id = b.user_id group by 1) z) oracles,
    (select coalesce(jsonb_object_agg(t.id, (select count(*) from unnest(t.ids) i where exists (select 1 from r where r.user_id = b.user_id and r.movie_id = i and r.media_type = 'movie'))), '{}') from theme t) theme,
    (select count(*) from friendships f where f.status = 'accepted' and (f.requester_id = b.user_id or f.addressee_id = b.user_id)) friends,
    (select count(*) from reviews v where v.user_id = b.user_id and not v.is_ai_generated) reviews_real,
    (select count(*) from reviews v where v.user_id = b.user_id and v.is_ai_generated) reviews_ai,
    (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'emoji', s.emoji)), '[]') from user_special_tags us join special_tags s on s.id = us.tag_id where us.user_id = b.user_id) special
  from b
)
select json_agg(st) from st
$fn$;
revoke all on function curation.bot_tag_stats() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recalcula todo mundo
-- ---------------------------------------------------------------------------

select public.refresh_user_persona(p.id) from public.profiles p;
