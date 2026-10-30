-- 30/10/2026, pedidos do Bruno:
--
-- 1. A Watchlist nas fileiras dos oráculos. Até aqui, "Escolhidos a dedo"
--    (Oracle Hub) e as prateleiras da Biblioteca dos Oráculos tiravam tudo o
--    que a pessoa já tinha na biblioteca, inclusive o que ela só guardou na
--    Watchlist. Agora só os já avaliados saem: os da Watchlist continuam,
--    marcados ('w': true) para o site pôr a marca da Watchlist na capa (ao
--    lado do selo da nota prevista, sem tirá-lo).
--      - get_oracle_hub_picks_v2(): a versão nova (o site usa esta);
--      - get_oracle_hub_picks(): continua para os apps antigos, igual ao que
--        era (sem a Watchlist), lendo da v2;
--      - o cache de 6 horas (oracle_hub_picks) passa a guardar também os da
--        Watchlist; os caches antigos foram vencidos para recalcular.
--    As prateleiras da Biblioteca vêm da função predict-oracle-shelf, que
--    ganhou a chave includeWatchlist (mesma regra).
--
-- 2. Curtir um sussurro de indicação. Quem recebe a indicação de um filme ou
--    série pode curtir; a primeira curtida manda um sussurro 'whisper_like'
--    para quem indicou ("fulano curtiu a sua indicação"). Descurtir só
--    desliga; curtir de novo não manda outro sussurro.
--      - friend_indications.liked_at (quando curtiu; null = não curtiu) e
--        like_notified;
--      - toggle_whisper_like(id) → { liked }.
--    (A mensagem do sussurro já podia ser vazia no banco; o site deixou de
--    exigir.)

-- ---------------------------------------------------------------------------
-- 1. Escolhidos a dedo com a Watchlist
-- ---------------------------------------------------------------------------

create or replace function public.get_oracle_hub_picks_v2()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_moods text[];
  v_personal boolean;
  v_cache record;
  v_picks jsonb;
  v_total integer;
  v_mids integer[];
  v_tids integer[];
  v_default text[] := array['adventures', 'mind-blowing', 'laugh-out-loud', 'catharsis', 'adrenaline', 'romantic', 'family-time', 'dark-and-scary', 'drug-trip'];
begin
  if v_uid is null then
    return null;
  end if;

  select coalesce(array_agg(x.mk order by x.ord), '{}') into v_moods
    from (
      select e.s ->> 'mood_key' as mk, e.ord
        from profiles p,
             jsonb_array_elements(coalesce(p.persona_scores, '[]'::jsonb)) with ordinality as e(s, ord)
       where p.id = v_uid
         and coalesce((e.s ->> 'films')::int, 0) > 0
         and e.s ->> 'mood_key' <> 'random-surprise'
       order by e.ord
       limit 3
    ) x;
  v_personal := cardinality(v_moods) = 3;
  if not v_personal then
    v_moods := v_moods || array(
      select d.m from unnest(v_default) with ordinality as d(m, o)
       where not (d.m = any(v_moods))
       order by d.o
       limit 3 - cardinality(v_moods)
    );
  end if;

  select * into v_cache from oracle_hub_picks where user_id = v_uid;
  if found and v_cache.moods = v_moods and v_cache.computed_at > now() - interval '6 hours' then
    v_picks := v_cache.picks;
  else
    -- Os títulos de cada tipo que a pessoa ainda não avaliou (a Watchlist
    -- fica), primeiro em variáveis: passados como lista pronta, o
    -- predict_ratings_v4 roda como na Biblioteca (dentro da mesma consulta o
    -- planejador escolhia um caminho 3x mais lento).
    select coalesce(array_agg(distinct q.id), '{}') into v_mids
      from (
        select (jsonb_array_elements_text(coalesce(rp.movie_ids, '[]'::jsonb)))::int as id
          from recommendation_pools rp
         where rp.mood_key = any(v_moods) and rp.card_type in ('bogart', 'fincher', 'cypher')
      ) q
     where not exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = q.id
                         and coalesce(um.media_type, 'movie') = 'movie' and um.rating is not null);
    select coalesce(array_agg(distinct q.id), '{}') into v_tids
      from (
        select (jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)))::int as id
          from recommendation_pools rp
         where rp.mood_key = any(v_moods) and rp.card_type in ('bogart', 'fincher', 'cypher')
      ) q
     where not exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = q.id
                         and um.media_type = 'tv' and um.rating is not null);

    with pools as (
      select rp.card_type, rp.mood_key, 'movie'::text as mt, (jsonb_array_elements_text(coalesce(rp.movie_ids, '[]'::jsonb)))::int as id
        from recommendation_pools rp
       where rp.mood_key = any(v_moods) and rp.card_type in ('bogart', 'fincher', 'cypher')
      union all
      select rp.card_type, rp.mood_key, 'tv'::text, (jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)))::int
        from recommendation_pools rp
       where rp.mood_key = any(v_moods) and rp.card_type in ('bogart', 'fincher', 'cypher')
    ),
    fresh as (
      select distinct on (p.card_type, p.mt, p.id) p.*
        from pools p
       where not exists (
         select 1 from user_movies um
          where um.user_id = v_uid and um.movie_id = p.id and coalesce(um.media_type, 'movie') = p.mt and um.rating is not null
       )
    ),
    pm as materialized (
      select * from predict_ratings_v4(v_uid, 'movie', v_mids)
    ),
    pt as materialized (
      select * from predict_ratings_v4(v_uid, 'tv', v_tids)
    ),
    scored as (
      select f.card_type, f.mood_key, f.mt, f.id, x.mu, x.predicted_rating from fresh f join pm x on f.mt = 'movie' and x.id = f.id
      union all
      select f.card_type, f.mood_key, f.mt, f.id, x.mu, x.predicted_rating from fresh f join pt x on f.mt = 'tv' and x.id = f.id
    ),
    ranked as (
      select s.*, row_number() over (partition by s.card_type, s.mt order by s.mu desc nulls last, s.id) as rn
        from scored s
    )
    select coalesce(jsonb_object_agg(z.card_type, z.j), '{}'::jsonb) into v_picks
      from (
        select r.card_type,
               jsonb_build_object(
                 'movies', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'r', r.predicted_rating, 'mu', round(r.mu::numeric, 3), 'mood', r.mood_key) order by r.rn) filter (where r.mt = 'movie'), '[]'::jsonb),
                 'series', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'r', r.predicted_rating, 'mu', round(r.mu::numeric, 3), 'mood', r.mood_key) order by r.rn) filter (where r.mt = 'tv'), '[]'::jsonb)
               ) as j
          from ranked r
         where r.rn <= 16
         group by r.card_type
      ) z;

    insert into oracle_hub_picks (user_id, moods, picks, computed_at)
    values (v_uid, v_moods, v_picks, now())
    on conflict (user_id) do update set moods = excluded.moods, picks = excluded.picks, computed_at = excluded.computed_at;
  end if;

  -- Na leitura: o que a pessoa avaliou depois do cálculo sai da lista; o que
  -- está na Watchlist agora ganha 'w': true.
  select coalesce(jsonb_object_agg(o.key, jsonb_build_object(
           'movies', (select coalesce(jsonb_agg(
                               case when exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = (a.e ->> 'id')::int
                                                   and coalesce(um.media_type, 'movie') = 'movie' and um.rating is null)
                                    then a.e || '{"w": true}'::jsonb else a.e end
                               order by a.ord), '[]'::jsonb)
                        from jsonb_array_elements(o.value -> 'movies') with ordinality as a(e, ord)
                       where not exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = (a.e ->> 'id')::int
                                           and coalesce(um.media_type, 'movie') = 'movie' and um.rating is not null)),
           'series', (select coalesce(jsonb_agg(
                               case when exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = (a.e ->> 'id')::int
                                                   and um.media_type = 'tv' and um.rating is null)
                                    then a.e || '{"w": true}'::jsonb else a.e end
                               order by a.ord), '[]'::jsonb)
                        from jsonb_array_elements(o.value -> 'series') with ordinality as a(e, ord)
                       where not exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = (a.e ->> 'id')::int
                                           and um.media_type = 'tv' and um.rating is not null))
         )), '{}'::jsonb)
    into v_picks
    from jsonb_each(v_picks) o;

  select count(*) into v_total
    from (
      select jsonb_array_elements_text(coalesce(rp.movie_ids, '[]'::jsonb)) from recommendation_pools rp
       where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart', 'fincher', 'cypher')
      union all
      select jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)) from recommendation_pools rp
       where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart', 'fincher', 'cypher')
    ) t;

  return jsonb_build_object(
    'moods', to_jsonb(v_moods),
    'personal', v_personal,
    'total_titles', v_total,
    'shelves', (select count(*) from recommendation_pools rp where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart', 'fincher', 'cypher')),
    'oracles', v_picks
  );
end;
$function$;

-- A versão antiga (apps já instalados): igual à v2, sem os da Watchlist.
create or replace function public.get_oracle_hub_picks()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v jsonb := public.get_oracle_hub_picks_v2();
begin
  if v is null then
    return null;
  end if;
  return jsonb_set(v, '{oracles}', coalesce((
    select jsonb_object_agg(o.key, jsonb_build_object(
             'movies', (select coalesce(jsonb_agg(a.e order by a.ord), '[]'::jsonb)
                          from jsonb_array_elements(o.value -> 'movies') with ordinality as a(e, ord)
                         where not coalesce((a.e ->> 'w')::boolean, false)),
             'series', (select coalesce(jsonb_agg(a.e order by a.ord), '[]'::jsonb)
                          from jsonb_array_elements(o.value -> 'series') with ordinality as a(e, ord)
                         where not coalesce((a.e ->> 'w')::boolean, false))))
      from jsonb_each(v -> 'oracles') o), '{}'::jsonb));
end;
$function$;

revoke all on function public.get_oracle_hub_picks_v2() from public, anon;
grant execute on function public.get_oracle_hub_picks_v2() to authenticated;

-- Os caches guardados sem a Watchlist recalculam na próxima abertura.
update public.oracle_hub_picks set computed_at = now() - interval '7 days';

-- ---------------------------------------------------------------------------
-- 2. Curtir um sussurro de indicação
-- ---------------------------------------------------------------------------

alter table public.friend_indications
  add column if not exists liked_at timestamptz,
  add column if not exists like_notified boolean not null default false;

-- O tipo novo de sussurro (o aviso para quem indicou).
alter table public.friend_indications
  drop constraint if exists recommendations_type_check,
  add constraint recommendations_type_check
  check (type = any (array['movie','friend_request','new_episode','tag_unlocked','story_like','story_comment','story_reply','whisper_like']));

create or replace function public.toggle_whisper_like(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  w public.friend_indications;
  v_liked boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into w
    from public.friend_indications
   where id = p_id and to_user_id = v_uid and type = 'movie'
   for update;
  if not found then
    raise exception 'whisper_not_found';
  end if;

  v_liked := w.liked_at is null;
  update public.friend_indications
     set liked_at = case when v_liked then now() else null end,
         like_notified = like_notified or (v_liked and w.from_user_id is not null)
   where id = p_id;

  -- só na primeira curtida, e só se quem indicou ainda existe
  if v_liked and not w.like_notified and w.from_user_id is not null and w.from_user_id <> v_uid then
    insert into public.friend_indications (from_user_id, to_user_id, type, movie_id, movie_title, movie_poster, media_type, read)
    values (v_uid, w.from_user_id, 'whisper_like', w.movie_id, w.movie_title, w.movie_poster, coalesce(w.media_type, 'movie'), false);
  end if;

  return jsonb_build_object('liked', v_liked);
end;
$function$;

revoke all on function public.toggle_whisper_like(uuid) from public, anon;
grant execute on function public.toggle_whisper_like(uuid) to authenticated;
