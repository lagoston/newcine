-- Bogart e Fincher só com obras dos EUA nas adições novas; menos Cypher na
-- home (14/10/2026).
--
-- Pedido do Bruno depois da curadoria de 13/10: "oráculos bogart e fincher
-- foram infestados com filmes internacionais (japoneses, brasileiros, etc),
-- e principalmente a cobra [o Cypher] foi infestada com cinema oriental.
-- Todas as adições novas fora EUA que você fez em bogart e fincher
-- transporte para a cobra, e limite mais a aparição da cobra principalmente
-- na home, eu odeio animes e coisas japonesas e basicamente só aparece isso
-- em 'filmes e séries para você'".
--
-- 1. As adições de 13/10 em Bogart e Fincher cujo país de origem não inclui
--    os EUA vão para o Cypher, no MESMO humor (as personalidades contam
--    humores, então não mudam). Registro em curation.moved_to_cypher_1014;
--    curation.shelf_additions_1013 passa a dizer 'cypher' nelas. As
--    prateleiras de antes de 13/10 não mudam.
-- 2. "Filmes e Séries Para Você" (home):
--    • a mistura do dia passa a ter no máximo 2 do Cypher em 20 (antes
--      chegava a 12): 10/8/2, 10/10/0, 12/8/0, 12/6/2, 9/9/2;
--    • quando Bogart ou Fincher não têm títulos suficientes, o resto vem
--      deles primeiro, e o Cypher por último;
--    • obras de países que a pessoa praticamente não vê saem da lista dela:
--      Japão, Coreia, China (com Hong Kong e Taiwan) e Índia, quando são
--      menos de 3% da biblioteca (com 30+ títulos na biblioteca). Aprende
--      com cada pessoa: quem vê anime continua recebendo anime.
-- 3. "Do oráculo para você" (home): as 5 vagas saem só de Bogart e Fincher
--    (antes a 5ª podia ser do Cypher), com o mesmo filtro de regiões.
-- 4. "Recomendação do Dia" (home, a mesma para todos): a carta do Cypher sai
--    só de obras cujos países de origem são todos de língua inglesa (EUA,
--    Reino Unido, Canadá, Austrália, Irlanda, Nova Zelândia). As cartas de hoje que já não batem
--    com a regra são sorteadas de novo.
-- 5. Lista de pesca: obra fora dos EUA sempre sugerida para o Cypher.

-- ---------------------------------------------------------------------------
-- Região de um título (pelos países de origem)
-- ---------------------------------------------------------------------------

create or replace function public.title_region(p_countries text[])
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_countries is null or cardinality(p_countries) = 0 then 'outros'
    when 'US' = any(p_countries) then 'US'
    when p_countries && array['JP'] then 'JP'
    when p_countries && array['KR'] then 'KR'
    when p_countries && array['CN', 'HK', 'TW', 'MO'] then 'CN'
    when p_countries && array['IN'] then 'IN'
    when p_countries && array['BR'] then 'BR'
    else 'outros'
  end;
$$;

-- Regiões que a pessoa praticamente não vê: Japão, Coreia, China (com Hong
-- Kong e Taiwan) e Índia com menos de 3% da biblioteca (e menos de 3
-- títulos no mínimo), para quem tem 30+ títulos. Quem vê anime continua
-- recebendo anime.
create or replace function public.user_unfamiliar_regions(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with lib as (
    select public.title_region(mc.origin_country) r
    from public.user_movies um
    join public.movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = coalesce(um.media_type, 'movie')
    where um.user_id = p_user_id
  ),
  cnt as (select lib.r, count(*) n from lib group by lib.r),
  tot as (select coalesce(sum(cnt.n), 0) t from cnt)
  select coalesce(array_agg(x.r), '{}'::text[])
  from unnest(array['JP', 'KR', 'CN', 'IN']) x(r)
  cross join tot
  left join cnt on cnt.r = x.r
  where tot.t >= 30 and coalesce(cnt.n, 0) < greatest(3, 0.03 * tot.t);
$$;

revoke all on function public.user_unfamiliar_regions(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Filmes e Séries Para Você
-- ---------------------------------------------------------------------------

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
  v_blocked text[];
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

  -- Regiões que a pessoa praticamente não vê ficam de fora da lista dela.
  v_blocked := public.user_unfamiliar_regions(p_user_id);

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
    )
    and not exists (
      select 1 from public.movie_cache mc
      where mc.tmdb_id = x.tid and mc.media_type = p_media_type
        and public.title_region(mc.origin_country) = any(v_blocked)
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

-- ---------------------------------------------------------------------------
-- 3. Do oráculo para você: só Bogart e Fincher
-- ---------------------------------------------------------------------------

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
  v_blocked    text[];
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

  -- Regiões que a pessoa praticamente não vê (Japão, Coreia, China, Índia)
  -- também ficam de fora daqui (14/10/2026).
  v_blocked := public.user_unfamiliar_regions(p_user_id);

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
     where sub.elem != all(v_library || v_picked)
       and not exists (
         select 1 from movie_cache mc
         where mc.tmdb_id = sub.elem and mc.media_type = 'movie'
           and public.title_region(mc.origin_country) = any(v_blocked));

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

-- ---------------------------------------------------------------------------
-- 4. Recomendação do Dia: a carta do Cypher só de origem em língua inglesa
-- ---------------------------------------------------------------------------

create or replace function public.daily_oracle_pool(p_oracle text)
returns integer[]
language sql
stable
security definer
set search_path = public
as $$
  select array_agg(distinct s.elem)
  from (
    select jsonb_array_elements_text(rp.movie_ids)::integer as elem
    from public.recommendation_pools rp
    where rp.card_type = p_oracle and rp.mood_key = 'random-surprise'
  ) s
  where p_oracle <> 'cypher'
     or exists (
       select 1 from public.movie_cache mc
       where mc.tmdb_id = s.elem and mc.media_type = 'movie'
         and coalesce(cardinality(mc.origin_country), 0) > 0
         and mc.origin_country <@ array['US', 'GB', 'CA', 'AU', 'IE', 'NZ']
     );
$$;

create or replace function public.get_or_create_daily_oracle_recommendations()
returns table (out_card_type text, out_movie_id integer)
language plpgsql
security definer
set search_path = public
as $function$
declare
  today_date date := (now() at time zone 'America/Sao_Paulo')::date;
  oracle text;
  pool integer[];
  chosen_id integer;
begin
  if (select count(*) from daily_oracle_recommendations d where d.recommendation_date = today_date) = 3 then
    return query
      select d.card_type, d.movie_id
      from daily_oracle_recommendations d
      where d.recommendation_date = today_date
      order by d.sort_order;
    return;
  end if;

  foreach oracle in array array['bogart', 'fincher', 'cypher']
  loop
    if exists (
      select 1 from daily_oracle_recommendations d
      where d.recommendation_date = today_date and d.card_type = oracle
    ) then
      continue;
    end if;

    pool := public.daily_oracle_pool(oracle);
    if pool is null or array_length(pool, 1) is null then
      continue;
    end if;

    chosen_id := pool[floor(random() * array_length(pool, 1))::integer + 1];

    insert into daily_oracle_recommendations (movie_id, card_type, recommendation_date, sort_order)
    values (chosen_id, oracle, today_date, floor(random() * 1000)::integer)
    on conflict (recommendation_date, card_type) do nothing;
  end loop;

  return query
    select d.card_type, d.movie_id
    from daily_oracle_recommendations d
    where d.recommendation_date = today_date
    order by d.sort_order;
end;
$function$;

revoke all on function public.daily_oracle_pool(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Adições de 13/10 fora dos EUA: de Bogart/Fincher para o Cypher
-- ---------------------------------------------------------------------------

create table if not exists curation.moved_to_cypher_1014 as
select a.tmdb_id, a.media_type, a.card_type as de_oraculo, a.mood_key, a.titulo, a.ano, a.votos,
       array_to_string(mc.origin_country, '/') pais, now() movido_em
from curation.shelf_additions_1013 a
join public.movie_cache mc on mc.tmdb_id = a.tmdb_id and mc.media_type = a.media_type
where a.card_type in ('bogart', 'fincher')
  and coalesce(cardinality(mc.origin_country), 0) > 0
  and not ('US' = any(mc.origin_country));

-- Tira de Bogart e Fincher (o resto da prateleira mantém a ordem).
update public.recommendation_pools rp
   set movie_ids = coalesce((
         select jsonb_agg(t.e order by t.ord)
         from jsonb_array_elements(rp.movie_ids) with ordinality t(e, ord)
         where not exists (
           select 1 from curation.moved_to_cypher_1014 m
           where m.media_type = 'movie' and m.tmdb_id = (t.e)::int and m.de_oraculo = rp.card_type and m.mood_key = rp.mood_key)
       ), '[]'::jsonb),
       tv_ids = coalesce((
         select jsonb_agg(t.e order by t.ord)
         from jsonb_array_elements(coalesce(rp.tv_ids, '[]'::jsonb)) with ordinality t(e, ord)
         where not exists (
           select 1 from curation.moved_to_cypher_1014 m
           where m.media_type = 'tv' and m.tmdb_id = (t.e)::int and m.de_oraculo = rp.card_type and m.mood_key = rp.mood_key)
       ), '[]'::jsonb)
 where rp.card_type in ('bogart', 'fincher')
   and rp.mood_key <> 'random-surprise'
   and exists (select 1 from curation.moved_to_cypher_1014 m where m.de_oraculo = rp.card_type and m.mood_key = rp.mood_key);

-- Põe no Cypher, no mesmo humor (no fim da prateleira, mais votados primeiro).
with novos as (
  select m.mood_key,
         coalesce(jsonb_agg(to_jsonb(m.tmdb_id) order by m.votos desc nulls last, m.tmdb_id) filter (where m.media_type = 'movie'), '[]'::jsonb) movies,
         coalesce(jsonb_agg(to_jsonb(m.tmdb_id) order by m.votos desc nulls last, m.tmdb_id) filter (where m.media_type = 'tv'), '[]'::jsonb) series
  from curation.moved_to_cypher_1014 m
  where not exists (
    select 1 from public.recommendation_pools rp
    where rp.mood_key <> 'random-surprise'
      and (case when m.media_type = 'movie' then rp.movie_ids else coalesce(rp.tv_ids, '[]'::jsonb) end) @> to_jsonb(m.tmdb_id))
  group by m.mood_key
)
update public.recommendation_pools rp
   set movie_ids = rp.movie_ids || n.movies,
       tv_ids = coalesce(rp.tv_ids, '[]'::jsonb) || n.series
  from novos n
 where rp.card_type = 'cypher' and rp.mood_key = n.mood_key;

update curation.shelf_additions_1013 a
   set card_type = 'cypher'
  from curation.moved_to_cypher_1014 m
 where a.tmdb_id = m.tmdb_id and a.media_type = m.media_type;

-- Recomendação do Dia de hoje: a carta que já não bate com a regra (título
-- que saiu daquele oráculo, ou Cypher fora da língua inglesa) é sorteada de
-- novo.
update public.daily_oracle_recommendations d
   set movie_id = (select p[floor(random() * array_length(p, 1))::integer + 1]
                   from (select public.daily_oracle_pool(d.card_type) p) z)
 where d.recommendation_date = (now() at time zone 'America/Sao_Paulo')::date
   and not (d.movie_id = any(coalesce(public.daily_oracle_pool(d.card_type), '{}'::integer[])));

-- ---------------------------------------------------------------------------
-- 5. Lista de pesca: fora dos EUA, sempre Cypher
-- ---------------------------------------------------------------------------

create or replace function public.pesca_avaliar()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, curation
as $$
declare
  v_items jsonb;
  v_missing jsonb;
  v_result jsonb;
begin
  -- Entrou numa prateleira por outro caminho: adicionado.
  update public.pesca p
     set status = 'adicionado', adicionado_em = coalesce(p.adicionado_em, now()), motivo = 'já está numa prateleira'
   where p.status not in ('adicionado', 'descartado')
     and exists (
       select 1 from public.recommendation_pools rp
       where rp.mood_key <> 'random-surprise'
         and (case when p.media_type = 'movie' then rp.movie_ids else coalesce(rp.tv_ids, '[]'::jsonb) end) @> to_jsonb(p.tmdb_id));

  with calc as (
    select p.tmdb_id, p.media_type, p.nota, p.votos, p.lancamento, p.generos, p.idioma,
      -- Origem nos EUA: pelo cache do site; sem cache, pela língua original.
      coalesce((select 'US' = any(mc.origin_country) from public.movie_cache mc
                 where mc.tmdb_id = p.tmdb_id and mc.media_type = p.media_type
                   and coalesce(cardinality(mc.origin_country), 0) > 0),
               coalesce(p.idioma, 'en') = 'en') dos_eua,
      (current_date - p.lancamento) d,
      case when p.media_type = 'movie' then 500 else 300 end thr_b,
      case when p.media_type = 'movie' then 200 else 100 end thr_f,
      case when p.media_type = 'movie' then 75 else 40 end piso,
      (select (h ->> 'nota')::numeric from jsonb_array_elements(p.historico) h
        where (h ->> 'em')::date <= current_date - 21 order by (h ->> 'em')::date desc limit 1) nota_antes
    from public.pesca p
    where p.status not in ('adicionado', 'descartado')
  ),
  st as (
    select c.*,
      coalesce(c.d >= 365 or (c.nota_antes is not null and abs(c.nota - c.nota_antes) <= 0.2), false) estavel,
      coalesce((c.votos >= c.thr_b and c.d >= 60) or (c.votos >= c.piso and c.d >= 180), false) quente,
      -- 6,46 arredondaria para "6,5" e confundiria com o corte: aí vão 2 casas.
      replace(to_char(c.nota, case when round(c.nota, 1) = 6.5 then 'FM90.00' else 'FM90.0' end), '.', ',') nota_txt
    from calc c
  ),
  decisao as (
    select st.*,
      case
        when st.lancamento is null or st.lancamento > current_date or st.nota is null then 'esquentando'
        when st.quente and st.estavel and st.nota > 6.5 then 'pronto'
        when st.quente and st.estavel then 'abaixo'
        when st.d > 730 then 'expirado'
        else 'esquentando'
      end novo
    from st
  )
  update public.pesca p set
    status = decisao.novo,
    pronto_em = case when decisao.novo = 'pronto' then coalesce(p.pronto_em, now()) else p.pronto_em end,
    oraculo_sugerido = case
      when p.media_type = 'tv' and coalesce(decisao.idioma, '') = 'ja' and coalesce(decisao.generos, '') ilike '%anima%' then 'cypher'
      -- 14/10/2026: fora dos EUA, sempre Cypher (Bogart e Fincher ficam com obras americanas).
      when not decisao.dos_eua then 'cypher'
      when extract(year from decisao.lancamento) >= 2000 and decisao.votos >= decisao.thr_b then 'bogart'
      when extract(year from decisao.lancamento) <= 1999 and decisao.votos >= decisao.thr_f then 'fincher'
      else 'cypher' end,
    motivo = case decisao.novo
      when 'pronto' then format('nota %s com %s votos, estável', decisao.nota_txt, decisao.votos)
      when 'abaixo' then format('nota %s (6,5 ou menos) com %s votos', decisao.nota_txt, decisao.votos)
      when 'expirado' then format('não esquentou em 2 anos (%s votos)', coalesce(decisao.votos, 0))
      else case
        when decisao.lancamento is null or decisao.lancamento > current_date then 'ainda não lançado'
        when decisao.d < 60 then format('lançado há %s dias (espera 60); nota %s com %s votos', decisao.d, decisao.nota_txt, decisao.votos)
        when not decisao.quente then format('%s votos (Bogart a partir de %s; Cypher a partir de %s, com 180 dias)', decisao.votos, decisao.thr_b, decisao.piso)
        when decisao.nota_antes is null then format('nota %s com %s votos; esperando a 2ª medição (3 semanas) para ver se assentou', decisao.nota_txt, decisao.votos)
        else format('nota ainda mexendo: %s há 3 semanas, %s agora', replace(to_char(decisao.nota_antes, 'FM90.0'), '.', ','), decisao.nota_txt)
      end
    end
  from decisao
  where p.tmdb_id = decisao.tmdb_id and p.media_type = decisao.media_type;

  -- Humor sugerido para os prontos que já estão no cache (sem passar por cima
  -- de um humor escolhido na curadoria).
  select jsonb_agg(jsonb_build_object('id', p.tmdb_id, 'type', p.media_type)) into v_items
  from public.pesca p
  where p.status = 'pronto' and p.humores_sugeridos is null
    and exists (select 1 from public.movie_cache mc where mc.tmdb_id = p.tmdb_id and mc.media_type = p.media_type);
  if v_items is not null then
    with s as (select * from curation.sugerir_humores(v_items)),
    agg as (
      select s.tmdb_id, s.media_type,
             max(s.humor) filter (where s.ordem = 1) top,
             string_agg(s.humor || ' ' || s.pct || '%', ' · ' order by s.ordem) txt
      from s group by 1, 2
    )
    update public.pesca p
       set humor_sugerido = coalesce(p.humor_sugerido, agg.top),
           humores_sugeridos = agg.txt
      from agg
     where p.tmdb_id = agg.tmdb_id and p.media_type = agg.media_type;
  end if;

  -- Prontos que ainda não estão no cache do site: pede (até 50 por vez); o
  -- humor sai na próxima avaliação.
  select jsonb_agg(x) into v_missing from (
    select jsonb_build_object('id', p.tmdb_id, 'type', p.media_type) x
    from public.pesca p
    where p.status = 'pronto'
      and not exists (select 1 from public.movie_cache mc where mc.tmdb_id = p.tmdb_id and mc.media_type = p.media_type)
    order by p.pronto_em
    limit 50
  ) z;
  if v_missing is not null then
    perform curation.request_title_cache(v_missing, 'fill');
  end if;

  select jsonb_object_agg(status, n) into v_result from (select status, count(*) n from public.pesca group by status) z;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

select public.pesca_avaliar();

-- ---------------------------------------------------------------------------
-- O único título de 13/10 sem país no cache: A Eternidade e Um Dia (1998, de
-- Theo Angelopoulos, Grécia). Também vai para o Cypher.
-- ---------------------------------------------------------------------------

insert into curation.moved_to_cypher_1014 (tmdb_id, media_type, de_oraculo, mood_key, titulo, ano, votos, pais, movido_em)
select 24858, 'movie', 'fincher', 'catharsis', 'A Eternidade e Um Dia', 1998, 226, 'GR', now()
where not exists (select 1 from curation.moved_to_cypher_1014 m where m.tmdb_id = 24858 and m.media_type = 'movie');

update public.recommendation_pools rp
   set movie_ids = coalesce((select jsonb_agg(t.e order by t.ord)
                             from jsonb_array_elements(rp.movie_ids) with ordinality t(e, ord)
                             where (t.e)::int <> 24858), '[]'::jsonb)
 where rp.card_type = 'fincher' and rp.mood_key = 'catharsis' and rp.movie_ids @> '[24858]'::jsonb;

update public.recommendation_pools rp
   set movie_ids = rp.movie_ids || '[24858]'::jsonb
 where rp.card_type = 'cypher' and rp.mood_key = 'catharsis'
   and not exists (select 1 from public.recommendation_pools x
                   where x.mood_key <> 'random-surprise' and x.movie_ids @> '[24858]'::jsonb);

update curation.shelf_additions_1013 set card_type = 'cypher'
 where tmdb_id = 24858 and media_type = 'movie';
