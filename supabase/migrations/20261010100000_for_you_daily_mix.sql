-- "Filmes Para Você" e "Séries Para Você" com uma mistura nova a cada dia
-- (10/10/2026, pedido do Bruno).
--
-- Antes: o top 10 pela nota prevista, sempre igual até a pessoa avaliar algo.
-- Agora, todo dia (no horário de Brasília):
--   • uma combinação de oráculos, entre cinco (Bogart / Fincher / Cypher):
--       4/4/2 · 4/3/3 · 5/5/0 · 6/3/1 · 2/2/6
--     Cada pessoa começa num ponto diferente do ciclo, e filmes e séries
--     nunca usam a mesma combinação no mesmo dia;
--   • os títulos de cada oráculo são sorteados entre os das 3 prateleiras
--     favoritas da pessoa com nota prevista 7 ou mais, alternando as 3
--     prateleiras. Nota prevista mais alta tem mais chance (peso = (nota
--     esperada − 6)²: um 9,5 pesa ~12 vezes um 7), mas qualquer título 7+
--     pode aparecer;
--   • se um oráculo não tiver títulos 7+ suficientes, o resto da lista vem
--     dos outros, pela mesma ordem do sorteio;
--   • a lista aparece da maior nota prevista para a menor.
-- O sorteio é fixo durante o dia (semente = pessoa + dia + tipo): se a pessoa
-- avalia ou guarda um título da lista, ele sai e o próximo do sorteio entra
-- no lugar, e o resto fica onde estava. A troca do dia não tem contador na
-- tela — a lista simplesmente amanhece diferente.

create or replace function public.get_for_you_titles__impl(p_user_id uuid, p_media_type text, p_limit integer default 10)
returns table(id integer, media_type text, predicted_rating integer, chance_9plus double precision, card_type text, mood_key text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_moods text[];
  v_ids integer[];
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seed text;
  v_combo integer;
  -- (Bogart, Fincher, Cypher) — cada combinação soma 10
  v_mixes integer[] := array[4,4,2, 4,3,3, 5,5,0, 6,3,1, 2,2,6];
  v_b integer;
  v_f integer;
  v_c integer;
begin
  if p_user_id is null or p_media_type not in ('movie', 'tv') then
    return;
  end if;

  -- As 3 prateleiras (humores) favoritas, como antes.
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

  -- Combinação do dia. Séries andam 2 passos à frente dos filmes, então as
  -- duas listas nunca repetem a combinação no mesmo dia.
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
           -- Sorteio ponderado (Efraimidis–Spirakis): u^(1/peso), maior primeiro.
           power(
             (('x' || substr(md5(v_seed || ':' || p.id::text), 1, 8))::bit(32)::bigint + 1)::double precision / 4294967297.0,
             1.0 / greatest(power(p.mu - 6.0, 2), 0.25)
           ) as draw
    from pred p
    join src s on s.tid = p.id
  ),
  ranked as (
    -- alterna as 3 prateleiras dentro de cada oráculo
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

-- A lista guardada (for_you_cache) agora também vence na virada do dia: o dia
-- entra na impressão digital. Guarda exatamente os 10 do dia (antes eram os
-- 20 primeiros pela nota).
create or replace function public.get_for_you_titles(p_media_type text, p_limit integer default 10)
returns table(id integer, media_type text, predicted_rating integer, chance_9plus double precision, card_type text, mood_key text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
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
  ), '0') || ':' || ((now() at time zone 'America/Sao_Paulo')::date)::text;

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
    from public.get_for_you_titles__impl(uid, p_media_type, 10)
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
