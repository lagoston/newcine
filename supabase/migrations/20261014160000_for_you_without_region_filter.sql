-- Sem o filtro de regiões por pessoa (14/10/2026, tarde).
--
-- Pedido do Bruno: "Não quero que você faça um filtro exclusivo para minha
-- conta boicotando filmes orientais e me cegando do que realmente acontece
-- no site, preciso que você resolva o problema para todos os usuários [...]
-- com a diminuição da cobra nas recomendações de filmes e séries da home
-- acredito que já conteve o problema, não precisamos de uma fórmula a
-- parte."
--
-- Sai o filtro que tirava Japão, Coreia, China e Índia de quem quase não vê
-- essas regiões (user_unfamiliar_regions), em "Filmes e Séries Para Você" e
-- em "Do oráculo para você". Ficam as regras que valem igual para todos,
-- da migração 20261014120000_cypher_non_us_and_home_limits.sql:
--   • o Cypher no máximo 2 em 20 em "Filmes e Séries Para Você" (mistura
--     10/8/2, 10/10/0, 12/8/0, 12/6/2, 9/9/2), completando com Bogart e
--     Fincher primeiro;
--   • "Do oráculo para você" só de Bogart e Fincher;
--   • a carta do Cypher na Recomendação do Dia só de origem em língua inglesa;
--   • adições novas de fora dos EUA no Cypher.
-- title_region e user_unfamiliar_regions ficam no banco, sem uso.

create or replace function public.get_for_you_titles__impl(p_user_id uuid, p_media_type text, p_limit integer default 10)
returns table (id integer, media_type text, predicted_rating integer, chance_9plus double precision, card_type text, mood_key text)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_moods text[];
  v_ids integer[];
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seed text;
  v_combo integer;
  -- Bogart / Fincher / Cypher em cada uma das 5 misturas (14/10/2026: o
  -- Cypher no máximo 2 em 20; antes 8/8/4, 8/6/6, 10/10/0, 12/6/2, 4/4/12).
  v_mixes integer[] := array[10,8,2, 10,10,0, 12,8,0, 12,6,2, 9,9,2];
  v_b integer;
  v_f integer;
  v_c integer;
begin
  if p_user_id is null or p_media_type not in ('movie', 'tv') then
    return;
  end if;

  select array_agg(f.mood_key order by f.score desc, f.mood_key)
  into v_moods
  from (
    select fm.mood_key, fm.score
    from public.get_user_favorite_moods_order__impl(p_user_id) fm
    where fm.score > 0
    order by fm.score desc, fm.mood_key
    limit 3
  ) f;

  if v_moods is null then
    return;
  end if;

  select array_agg(distinct x.tid)
  into v_ids
  from public.recommendation_pools rp
  cross join lateral (
    select (e)::integer as tid
    from jsonb_array_elements_text(
      case when p_media_type = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else coalesce(rp.movie_ids, '[]'::jsonb) end
    ) e
  ) x
  where rp.card_type in ('bogart', 'fincher', 'cypher')
    and rp.mood_key = any(v_moods)
    and not exists (
      select 1 from public.user_movies um
      where um.user_id = p_user_id
        and um.movie_id = x.tid
        and coalesce(um.media_type, 'movie') = p_media_type
    );

  if v_ids is null then
    return;
  end if;

  v_seed := p_user_id::text || ':' || v_day::text || ':' || p_media_type;
  v_combo := ((v_day - date '2026-01-01') + (hashtext(p_user_id::text)::bigint & 2147483647)
              + case when p_media_type = 'tv' then 2 else 0 end) % 5;
  v_b := v_mixes[v_combo * 3 + 1];
  v_f := v_mixes[v_combo * 3 + 2];
  v_c := v_mixes[v_combo * 3 + 3];

  return query
  with pred as (
    select pr.id, pr.mu, pr.predicted_rating, pr.chance_9plus
    from public.predict_ratings_v4(p_user_id, p_media_type, v_ids) pr
    where pr.mu is not null
      and pr.predicted_rating >= 7
  ),
  src as (
    select distinct on (x.tid) x.tid, rp.card_type, rp.mood_key
    from public.recommendation_pools rp
    cross join lateral (
      select (e)::integer as tid
      from jsonb_array_elements_text(
        case when p_media_type = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else coalesce(rp.movie_ids, '[]'::jsonb) end
      ) e
    ) x
    where rp.card_type in ('bogart', 'fincher', 'cypher')
      and rp.mood_key = any(v_moods)
    order by x.tid, array_position(v_moods, rp.mood_key), rp.card_type
  ),
  cand as (
    select p.id, p.mu, p.predicted_rating, p.chance_9plus, s.card_type, s.mood_key,
           array_position(v_moods, s.mood_key) as mood_rank,
           power(
             (('x' || substr(md5(v_seed || ':' || p.id::text), 1, 8))::bit(32)::bigint + 1)::double precision / 4294967297.0,
             1.0 / greatest(power(p.mu - 6.0, 2), 0.25)
           ) as draw
    from pred p
    join src s on s.tid = p.id
  ),
  ranked as (
    select c.*, row_number() over (partition by c.card_type, c.mood_key order by c.draw desc, c.id) as rn_mood
    from cand c
  ),
  ordered as (
    select r.*,
           row_number() over (partition by r.card_type order by r.rn_mood, r.mood_rank, r.draw desc) as rn_oracle,
           row_number() over (order by r.rn_mood, r.mood_rank, r.draw desc, r.id) as rn_all
    from ranked r
  ),
  chosen as (
    select o.*,
           row_number() over (
             order by (o.rn_oracle <= case o.card_type when 'bogart' then v_b when 'fincher' then v_f else v_c end) desc,
                      -- completar a lista: Bogart e Fincher primeiro, Cypher por último
                      (o.card_type = 'cypher'),
                      o.rn_all
           ) as pick
    from ordered o
  )
  select ch.id, p_media_type, ch.predicted_rating, ch.chance_9plus, ch.card_type, ch.mood_key
  from chosen ch
  where ch.pick <= v_limit
  order by ch.mu desc, ch.id;
end;
$function$;

create or replace function public.get_or_create_user_oracle_recommendations(p_user_id uuid)
returns table (movie_id integer, pool_position smallint)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_today      date    := (now() at time zone 'America/Sao_Paulo')::date;
  v_code       text;
  v_scores     jsonb;
  v_moods      text[]  := array[]::text[];
  v_library    integer[] := array[]::integer[];
  v_picked     integer[] := array[]::integer[];
  v_result     integer[] := array[]::integer[];
  v_slot_mood  text;
  v_slot_cards text[];
  v_avail      integer[];
  v_picked_id  integer;
  v_slot       integer;
begin
  perform public.assert_caller_is(p_user_id);

  if exists (
    select 1 from user_oracle_daily_recommendations uodr
     where uodr.user_id = p_user_id and uodr.recommendation_date = v_today
  ) then
    return query
      select uodr.movie_id, uodr.pool_position
        from user_oracle_daily_recommendations uodr
       where uodr.user_id = p_user_id and uodr.recommendation_date = v_today
       order by uodr.pool_position;
    return;
  end if;

  select array_agg(um.movie_id) into v_library from user_movies um where um.user_id = p_user_id;
  if v_library is null then v_library := array[]::integer[]; end if;

  select p.personalidade_completa, p.persona_scores into v_code, v_scores from profiles p where p.id = p_user_id;

  if v_code is not null and jsonb_typeof(v_scores) = 'array' then
    select array_agg(s.value ->> 'mood_key' order by s.ord)
      into v_moods
      from jsonb_array_elements(v_scores) with ordinality as s(value, ord)
     where (s.value ->> 'films')::integer > 0 and s.ord <= 3;
  end if;
  if v_moods is null then v_moods := array[]::text[]; end if;

  for v_slot in 1..5 loop
    -- 14/10/2026: as 5 vagas só de Bogart e Fincher (antes a 5ª incluía o Cypher).
    v_slot_cards := array['bogart', 'fincher'];
    if coalesce(array_length(v_moods, 1), 0) < 3 then
      v_slot_mood := 'random-surprise';
    elsif v_slot in (1, 2) then
      v_slot_mood := v_moods[1];
    elsif v_slot in (3, 4) then
      v_slot_mood := v_moods[2];
    else
      v_slot_mood := v_moods[3];
    end if;

    select array_agg(distinct sub.elem) into v_avail
      from (
        select jsonb_array_elements_text(rp.movie_ids)::integer as elem
          from recommendation_pools rp
         where rp.card_type = any(v_slot_cards) and rp.mood_key = v_slot_mood
      ) sub
     where sub.elem != all(v_library || v_picked);

    if v_avail is null or array_length(v_avail, 1) = 0 then
      select array_agg(distinct sub.elem) into v_avail
        from (
          select jsonb_array_elements_text(rp.movie_ids)::integer as elem
            from recommendation_pools rp
           where rp.card_type = any(v_slot_cards) and rp.mood_key = v_slot_mood
        ) sub
       where sub.elem != all(v_picked);
    end if;

    if v_avail is not null and array_length(v_avail, 1) > 0 then
      v_picked_id := v_avail[floor(random() * array_length(v_avail, 1))::integer + 1];
      v_picked    := v_picked || array[v_picked_id];
      v_result    := v_result || array[v_picked_id];
    end if;
  end loop;

  for v_slot in 1..coalesce(array_length(v_result, 1), 0) loop
    insert into user_oracle_daily_recommendations (user_id, recommendation_date, movie_id, pool_position)
    values (p_user_id, v_today, v_result[v_slot], v_slot::smallint)
    on conflict on constraint user_oracle_daily_recommendat_user_id_recommendation_date_p_key do nothing;
  end loop;

  return query
    select uodr.movie_id, uodr.pool_position
      from user_oracle_daily_recommendations uodr
     where uodr.user_id = p_user_id and uodr.recommendation_date = v_today
     order by uodr.pool_position;
end;
$function$;

-- As listas guardadas de hoje foram feitas com o filtro: a impressão
-- digital muda (versão ":20b"), então todo mundo recalcula na próxima visita.
create or replace function public.get_for_you_titles(p_media_type text, p_limit integer default 10)
returns table (id integer, media_type text, predicted_rating integer, chance_9plus double precision, card_type text, mood_key text)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
  v_fp text;
  v_items jsonb;
  v_cached public.for_you_cache%rowtype;
begin
  if uid is null or p_media_type not in ('movie', 'tv') then
    return;
  end if;

  select count(*)::text || ':' ||
         coalesce(floor(extract(epoch from max(greatest(um.created_at, coalesce(um.updated_at, um.created_at)))))::bigint::text, '0')
  into v_fp
  from public.user_movies um
  where um.user_id = uid;

  v_fp := v_fp || ':' || coalesce((
    select floor(extract(epoch from max(rp.updated_at)))::bigint::text from public.recommendation_pools rp
  ), '0') || ':' || ((now() at time zone 'America/Sao_Paulo')::date)::text || ':20b';

  select * into v_cached
  from public.for_you_cache c
  where c.user_id = uid and c.media_type = p_media_type;

  if found and v_cached.fingerprint = v_fp and v_cached.computed_at > now() - interval '24 hours' then
    v_items := v_cached.items;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'media_type', f.media_type,
             'predicted_rating', f.predicted_rating,
             'chance_9plus', f.chance_9plus,
             'card_type', f.card_type,
             'mood_key', f.mood_key
           ) order by f.ord), '[]'::jsonb)
    into v_items
    from public.get_for_you_titles__impl(uid, p_media_type, 20)
      with ordinality as f(id, media_type, predicted_rating, chance_9plus, card_type, mood_key, ord);

    insert into public.for_you_cache as c (user_id, media_type, fingerprint, items, computed_at)
    values (uid, p_media_type, v_fp, v_items, now())
    on conflict on constraint for_you_cache_pkey
    do update set fingerprint = excluded.fingerprint, items = excluded.items, computed_at = excluded.computed_at;
  end if;

  return query
  select (x.e->>'id')::integer,
         x.e->>'media_type',
         (x.e->>'predicted_rating')::integer,
         (x.e->>'chance_9plus')::double precision,
         x.e->>'card_type',
         x.e->>'mood_key'
  from jsonb_array_elements(v_items) with ordinality as x(e, n)
  order by x.n
  limit v_limit;
end;
$function$;
