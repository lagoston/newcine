-- A Mesa dos Oráculos · motor (SPEC §5.1, §5.3 a §5.9, §5.13) · 05/11/2026
--
-- Tudo aqui é interno: revoke de public, anon e authenticated. Quem chama são
-- as 6 funções públicas (120000) e o pg_cron (130000), que roda como postgres.
-- Nada de Premium, nada de IA: só regras e o predict_ratings (v4) sem mudança,
-- que continua sendo só de service_role/postgres.
--
-- Convenção: variáveis com prefixo v_/p_/r_, para nunca colidir com nomes de
-- coluna dentro das consultas (plpgsql.variable_conflict = error).

-- ---------------------------------------------------------------------------
-- Dia de Brasília. A Mesa vira à meia-noite de São Paulo, não em UTC.
create or replace function public.mesa_day()
returns date language sql stable
set search_path = public, pg_temp as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- O evento sazonal no ar naquele dia (Halloween em outubro, Natal em dezembro),
-- só com seasonal_events.enabled.
create or replace function public.mesa_live_event(p_day date)
returns text language sql stable
set search_path = public, pg_temp as $$
  select e.id
    from public.seasonal_events e
   where e.enabled and e.id in ('halloween','christmas')
     and p_day between make_date(extract(year from p_day)::int, e.start_month, e.start_day)
                   and make_date(extract(year from p_day)::int, e.end_month, e.end_day)
   order by e.id
   limit 1
$$;

-- O rótulo do selo da nota: número com 10+ notas, palpite de 3 a 9, "?" abaixo.
create or replace function public.mesa_pred_label(p_n int)
returns text language sql immutable
set search_path = public, pg_temp as $$
  select case when coalesce(p_n, 0) >= 10 then 'number' when coalesce(p_n, 0) >= 3 then 'guess' else 'hidden' end
$$;

-- As três prateleiras mais fortes: as letras do código; sem código, os 3
-- primeiros de persona_scores com films > 0 (§5.4 passo 1).
create or replace function public.mesa_top3(p_uid uuid)
returns text[] language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(
    (select array_agg(cm.mood_key order by l.ord)
       from public.profiles p
       cross join lateral unnest(string_to_array(p.personalidade_completa, null)) with ordinality as l(letter, ord)
       join public.cine_moods cm on cm.letter = l.letter
      where p.id = p_uid and length(coalesce(p.personalidade_completa, '')) = 3),
    (select array_agg(x.mood_key order by x.ord)
       from (select s->>'mood_key' as mood_key, e.ord
               from public.profiles p
               cross join lateral jsonb_array_elements(coalesce(p.persona_scores, '[]'::jsonb)) with ordinality as e(s, ord)
              where p.id = p_uid and coalesce((s->>'films')::int, 0) > 0
              order by e.ord
              limit 3) x),
    '{}'::text[])
$$;

-- ---------------------------------------------------------------------------
-- Impressão digital do vetor (molde do for_you_cache, só com as linhas que têm
-- nota) + a versão do catálogo: mudou qualquer coisa, o vetor envelheceu.
create or replace function public.mesa_fingerprint(p_uid uuid)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select count(*) filter (where um.rating is not null)::text || ':' ||
         coalesce(extract(epoch from max(coalesce(um.updated_at, um.created_at)) filter (where um.rating is not null))::bigint, 0)::text || ':' ||
         coalesce((select m.value->>'version' from public.mesa_meta m where m.key = 'catalog'), '0')
    from public.user_movies um
   where um.user_id = p_uid
$$;

-- Recalcula o vetor de uma mídia: uma chamada ao predict_ratings (v4, fórmula
-- intocada) com o acervo inteiro daquela mídia. Devolve os ms gastos.
create or replace function public.mesa_refresh_vec(p_uid uuid, p_mt text)
returns int language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_t0 timestamptz := clock_timestamp();
  v_ids int[];
  v_fp text := public.mesa_fingerprint(p_uid);
  v_ms int;
begin
  if p_mt not in ('movie','tv') then return 0; end if;
  select coalesce(array_agg(t.tmdb_id order by t.tmdb_id), '{}'::int[]) into v_ids
    from public.mesa_titles t where t.media_type = p_mt;

  insert into public.mesa_user_vec as uv (user_id, media_type, fingerprint, computed_at, ids, mu, p9, p10, pr, ms)
  select p_uid, p_mt, v_fp, now(),
         coalesce(array_agg(i.id order by i.id), '{}'::int[]),
         coalesce(array_agg(pr.mu::real order by i.id), '{}'::real[]),
         coalesce(array_agg(pr.chance_9plus::real order by i.id), '{}'::real[]),
         coalesce(array_agg(pr.chance_10::real order by i.id), '{}'::real[]),
         coalesce(array_agg(pr.predicted_rating::smallint order by i.id), '{}'::smallint[]),
         null
    from unnest(v_ids) as i(id)
    left join public.predict_ratings(p_uid, p_mt, v_ids, null) pr on pr.id = i.id
  on conflict (user_id, media_type) do update
    set fingerprint = excluded.fingerprint, computed_at = excluded.computed_at, ids = excluded.ids,
        mu = excluded.mu, p9 = excluded.p9, p10 = excluded.p10, pr = excluded.pr;

  v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::int;
  update public.mesa_user_vec set ms = v_ms where user_id = p_uid and media_type = p_mt;
  return v_ms;
end $$;

-- A política de frescor do §5.1: sem vetor, calcula; impressão mudou e < 30
-- notas, recalcula (cada nota pesa); ≥ 30 notas, usa como está e põe na fila;
-- vetor com mais de 3 dias volta para a fila.
create or replace function public.mesa_ensure_vec(p_uid uuid, p_mt text)
returns boolean language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_fp text; v_at timestamptz; v_n int;
begin
  select uv.fingerprint, uv.computed_at into v_fp, v_at
    from public.mesa_user_vec uv where uv.user_id = p_uid and uv.media_type = p_mt;
  if not found then
    perform public.mesa_refresh_vec(p_uid, p_mt);
    return true;
  end if;
  if v_fp is distinct from public.mesa_fingerprint(p_uid) then
    select count(*) into v_n from public.user_movies um where um.user_id = p_uid and um.rating is not null;
    if v_n < 30 then
      perform public.mesa_refresh_vec(p_uid, p_mt);
      return true;
    end if;
    insert into public.mesa_vec_dirty (user_id) values (p_uid)
    on conflict (user_id) do update set at = now();
    return false;
  end if;
  if v_at < now() - interval '3 days' then
    insert into public.mesa_vec_dirty (user_id) values (p_uid)
    on conflict (user_id) do update set at = now();
  end if;
  return true;
end $$;

-- (05/11/2026) mesa_build_titles(), process_mesa_dirty() e mesa_cleanup() moram em
-- 20261105115000_mesa_upkeep.sql: são as únicas que apagam linhas (só nas tabelas
-- mesa_*), e por isso passam por uma aprovação à parte na aplicação.

-- ---------------------------------------------------------------------------
-- O retrato da pessoa para uma tiragem (§5.4 passo 1), calculado uma vez e
-- passado adiante: notas, média, afinidade por humor, países, décadas, top3.
create or replace function public.mesa_ctx(p_uid uuid, p_draw uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  r_draw record;
  v_kind text;
  v_out jsonb;
begin
  select dr.day, dr.seed, dr.media, dr.ask, dr.mode into r_draw from public.mesa_draws dr where dr.id = p_draw;
  v_kind := case when r_draw.ask is null or r_draw.ask = 'daily' then 'daily'
                 when r_draw.ask like 'occ:%' then 'occ'
                 when r_draw.ask like 'mood:%' then 'mood'
                 else 'season' end;
  with r as (
    select um.movie_id as id, um.media_type as mt, um.rating::float as rating, t.mood,
           coalesce(mc.origin_country, '{}'::text[]) as oc, extract(year from mc.release_date)::int as yr
      from public.user_movies um
      left join public.mesa_titles t on t.media_type = um.media_type and t.tmdb_id = um.movie_id
      left join public.movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
     where um.user_id = p_uid and um.rating is not null
  ),
  agg as (select count(*)::int as n, coalesce(avg(r.rating), 7.24) as mean from r),
  md as (select r.mood, count(*)::int as n, sum(r.rating) as s, avg(r.rating) as a from r where r.mood is not null group by r.mood)
  select jsonb_build_object(
           'day', r_draw.day, 'seed', r_draw.seed, 'media', r_draw.media, 'ask', r_draw.ask, 'mode', r_draw.mode,
           'kind', v_kind,
           'occ_key', case v_kind when 'occ' then substr(r_draw.ask, 5) when 'season' then r_draw.ask end,
           'mood_key', case when v_kind = 'mood' then substr(r_draw.ask, 6) end,
           'n_rated', agg.n,
           'user_mean', round(agg.mean::numeric, 4),
           'moods', coalesce((select jsonb_object_agg(md.mood, jsonb_build_object('n', md.n, 'avg', round(md.a::numeric, 3))) from md), '{}'::jsonb),
           'aff', coalesce((select jsonb_object_agg(md.mood,
                              round((1 / (1 + exp(-(((md.s + 7.24 * 3) / (md.n + 3)) - agg.mean) / 0.8)))::numeric, 5)) from md), '{}'::jsonb),
           'countries', coalesce((select jsonb_agg(distinct c) from r cross join lateral unnest(r.oc) c), '[]'::jsonb),
           'decades', coalesce((select jsonb_agg(distinct (r.yr / 10) * 10) from r where r.yr is not null), '[]'::jsonb),
           'top3', to_jsonb(public.mesa_top3(p_uid)))
    into v_out
    from agg;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Candidatos por assento (§5.4 passos 3 a 6): sinais, pontuação, pisos e a
-- chave Gumbel. Devolve {"bogart":[…], "fincher":[…], "cypher":[…]} com os 40
-- melhores por S de cada assento, já ordenados pela chave S/τ + G. As travas
-- (diretor, saga, humor repetido, série, Watchlist) ficam com quem chama.
-- enable_nestloop = off só aqui: o planejador estima ~100 linhas para o
-- unnest do vetor (são ~6.500) e escolhia laços aninhados entre CTEs; medido
-- no ensaio de 05/11: 37 s → ver WP-DB.md. Com hash joins, o acervo inteiro
-- passa em uma rodada. As buscas em movie_cache ficam em LATERAL ... LIMIT 1
-- (índice), para não varrer a tabela de 34 MB.
create or replace function public.mesa_slot_candidates(p_uid uuid, p_draw uuid, p_seat text, p_limit int default 40)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
set enable_nestloop = off as $$
declare
  r_draw record;
  v_ctx jsonb;
  v_kind text; v_occ text; v_mood text; v_media text; v_series_seat text;
  v_seats text[];
  v_top3 text[]; v_countries text[]; v_decades int[]; v_max_n float;
  v_out jsonb;
begin
  select dr.day, dr.seed, dr.media, dr.ask, dr.reserves into r_draw
    from public.mesa_draws dr where dr.id = p_draw and dr.user_id = p_uid;
  if not found then return '{}'::jsonb; end if;
  v_ctx := public.mesa_ctx(p_uid, p_draw);
  v_kind := v_ctx->>'kind';
  v_occ := v_ctx->>'occ_key';
  v_mood := v_ctx->>'mood_key';
  v_media := r_draw.media;
  v_seats := case when p_seat is null then array['bogart','fincher','cypher'] else array[p_seat] end;
  -- Tiragem diária com "filmes e séries": só um assento por dia aceita série,
  -- em rodízio (0 = Bogart, 1 = Fincher, 2 = Cypher).
  v_series_seat := case when v_kind = 'daily' and v_media = 'all'
                        then (array['bogart','fincher','cypher'])[((r_draw.day - date '2026-01-01') % 3 + 3) % 3 + 1] end;
  v_top3 := array(select jsonb_array_elements_text(coalesce(v_ctx->'top3', '[]'::jsonb)));
  v_countries := array(select jsonb_array_elements_text(coalesce(v_ctx->'countries', '[]'::jsonb)));
  v_decades := array(select (jsonb_array_elements_text(coalesce(v_ctx->'decades', '[]'::jsonb)))::int);
  select coalesce(max((e.value->>'n')::float), 0) into v_max_n from jsonb_each(coalesce(v_ctx->'moods', '{}'::jsonb)) e;

  with
  vec as (
    select uv.media_type as mt, u.id, u.mu, u.p9, u.p10, u.pr
      from public.mesa_user_vec uv
      cross join lateral unnest(uv.ids, uv.mu, uv.p9, uv.p10, uv.pr) as u(id, mu, p9, p10, pr)
     where uv.user_id = p_uid and (v_media = 'all' or uv.media_type = v_media)
  ),
  rated as (
    select um.movie_id as id, um.media_type as mt, um.rating, coalesce(um.updated_at, um.created_at) as ts
      from public.user_movies um where um.user_id = p_uid and um.rating is not null
  ),
  wl as (
    select um.movie_id as id, um.media_type as mt, um.created_at
      from public.user_movies um where um.user_id = p_uid and um.rating is null
  ),
  excl as materialized (
    select rated.mt, rated.id from rated
    union
    select f.media_type, f.tmdb_id from public.mesa_feedback f where f.user_id = p_uid and f.until >= r_draw.day
    union
    select c.media_type, c.tmdb_id from public.mesa_cards c
     where c.user_id = p_uid and c.state <> 'down' and c.day > r_draw.day - 30
       and not (c.state = 'want' and c.day < r_draw.day - 7)
    union
    select c.media_type, c.tmdb_id from public.mesa_cards c where c.draw_id = p_draw
    union
    select (rv->>'media_type'), (rv->>'tmdb_id')::int
      from jsonb_each(coalesce(r_draw.reserves, '{}'::jsonb)) e
      cross join lateral jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) rv
  ),
  today_other as (
    select distinct c.media_type as mt, c.tmdb_id as id from public.mesa_cards c
     where c.user_id = p_uid and c.day = r_draw.day and c.draw_id <> p_draw
  ),
  base as materialized (
    select t.media_type, t.tmdb_id, t.oracle, t.mood, t.decade, t.countries, t.director_key, t.collection_id,
           t.kw, t.pop_pct, vec.mu, vec.p9, vec.p10, vec.pr,
           case when v_kind in ('occ','season') then o.fit when v_kind = 'mood' then 1 else 0 end::float as fit
      from public.mesa_titles t
      join vec on vec.mt = t.media_type and vec.id = t.tmdb_id
      left join public.mesa_title_occasions o
        on v_occ is not null and o.occasion_key = v_occ and o.media_type = t.media_type and o.tmdb_id = t.tmdb_id
     where t.oracle = any(v_seats)
       and (v_mood is null or t.mood = v_mood)
       and (v_occ is null or o.fit is not null)
       and (v_series_seat is null or t.media_type = 'movie' or t.oracle = v_series_seat)
       and not exists (select 1 from excl where excl.mt = t.media_type and excl.id = t.tmdb_id)
  ),
  seeds as (
    select rated.id, rated.mt, greatest(0.35, power(0.5, extract(epoch from (now() - rated.ts)) / 86400.0 / 180.0)) as w,
           m1.dir, m1.keywords, (rated.rating <= 4) as anti
      from rated
      cross join lateral (
        select nullif(lower(btrim(coalesce(mc.director, ''))), '') as dir, mc.keywords, mc.vote_average
          from public.movie_cache mc where mc.tmdb_id = rated.id and mc.media_type = rated.mt
         limit 1
      ) m1
     where rated.rating >= 9 or rated.rating <= 4
        or (coalesce(m1.vote_average, 0) > 0 and rated.rating - m1.vote_average >= 2)
  ),
  skw as (
    select distinct s.id as sid, s.mt as smt, s.anti, s.w, mk.kw_id, mk.idf
      from seeds s
      cross join lateral jsonb_array_elements(case when jsonb_typeof(s.keywords) = 'array' then s.keywords else '[]'::jsonb end) e
      join public.mesa_kw mk on mk.kw_id = case when (e->>'id') ~ '^[0-9]+$' then (e->>'id')::int end
     where mk.df between 2 and 400
  ),
  kp as (
    select tk.media_type, tk.tmdb_id, s.anti, s.sid, s.smt, max(s.w) * sum(s.idf) as sc
      from public.mesa_title_kw tk
      join skw s on s.kw_id = tk.kw_id
      join base on base.media_type = tk.media_type and base.tmdb_id = tk.tmdb_id
     where tk.kw_id = any(array(select distinct skw.kw_id from skw))
     group by tk.media_type, tk.tmdb_id, s.anti, s.sid, s.smt
    having count(*) >= 2
  ),
  kbest as (
    select distinct on (kp.media_type, kp.tmdb_id, kp.anti) kp.media_type, kp.tmdb_id, kp.anti, kp.sid, kp.smt, kp.sc
      from kp order by kp.media_type, kp.tmdb_id, kp.anti, kp.sc desc, kp.sid
  ),
  dbest as (
    select distinct on (base.media_type, base.tmdb_id, s.anti) base.media_type, base.tmdb_id, s.anti, s.id as sid, s.mt as smt, s.w
      from base join seeds s on s.dir = base.director_key
     where base.director_key is not null
     order by base.media_type, base.tmdb_id, s.anti, s.w desc, s.id
  ),
  -- materializado: é lido numa subconsulta por linha (6.500 vezes); sem isso o
  -- PG reexecutava a CTE inteira a cada linha.
  refused_kw as materialized (
    select z.kw_id, count(*) as cnt
      from (
        select f.media_type, f.tmdb_id, mk.kw_id,
               row_number() over (partition by f.media_type, f.tmdb_id order by mk.idf desc, mk.kw_id) as rn
          from public.mesa_feedback f
          join public.mesa_titles t on t.media_type = f.media_type and t.tmdb_id = f.tmdb_id
          cross join lateral unnest(t.kw) x
          join public.mesa_kw mk on mk.kw_id = x and mk.df >= 2
         where f.user_id = p_uid and f.kind = 'refused' and f.created_at >= now() - interval '60 days'
      ) z
     where z.rn <= 5
     group by z.kw_id
  ),
  fat as (
    select c.mood, least(0.24, 0.08 * count(*)) as f from public.mesa_cards c
     where c.user_id = p_uid and c.state <> 'down' and c.day > r_draw.day - 7
     group by c.mood
  ),
  friends as (
    select case when fs.requester_id = p_uid then fs.addressee_id else fs.requester_id end as fid
      from public.friendships fs
     where fs.status = 'accepted' and (fs.requester_id = p_uid or fs.addressee_id = p_uid)
  ),
  fr as (
    select um.movie_id as id, um.media_type as mt, max(um.rating) as r
      from public.user_movies um join friends on friends.fid = um.user_id
     where um.rating >= 8 and not exists (select 1 from public.bot_accounts ba where ba.user_id = um.user_id)
     group by um.movie_id, um.media_type
  ),
  sig as (
    select base.*,
           greatest(0, least(1, (coalesce(base.mu, 0) - 5) / 5.0)) as m,
           coalesce(base.p9, 0)::float as q9,
           least(1, greatest(coalesce(kb.sc, 0) / 12.0, coalesce(db.w, 0))) as k,
           least(1, greatest(coalesce(ka.sc, 0) / 12.0, coalesce(da.w, 0))) as anti,
           1 - base.pop_pct as h,
           ((case when v_max_n = 0 then 1 else 1 - coalesce((v_ctx->'moods'->base.mood->>'n')::float, 0) / v_max_n end)
             + (case when cardinality(base.countries) > 0 and not (base.countries && v_countries) then 1 else 0 end)
             + (case when base.decade is not null and not (base.decade = any(v_decades)) then 1 else 0 end)) / 3.0 as u,
           case when wl.id is not null
                then 0.6 + 0.4 * least((r_draw.day - (wl.created_at at time zone 'America/Sao_Paulo')::date) / 60.0, 1)
                else 0 end as wlv,
           case when fr.r >= 9 then 1 when fr.r >= 8 then 0.5 else 0 end as frv,
           coalesce((v_ctx->'aff'->>base.mood)::float, 0.5) as aff,
           (select least(0.25, 0.05 * coalesce(sum(rk.cnt), 0)) from refused_kw rk where rk.kw_id = any(base.kw)) as pen_theme,
           coalesce(fat.f, 0) as pen_fat,
           case when tod.id is not null then 0.5 else 0 end as pen_today,
           kb.sid as kw_sid, kb.smt as kw_smt, db.sid as dir_sid, db.smt as dir_smt,
           (base.mood = any(v_top3)) as in_top3
      from base
      left join kbest kb on kb.media_type = base.media_type and kb.tmdb_id = base.tmdb_id and not kb.anti
      left join kbest ka on ka.media_type = base.media_type and ka.tmdb_id = base.tmdb_id and ka.anti
      left join dbest db on db.media_type = base.media_type and db.tmdb_id = base.tmdb_id and not db.anti
      left join dbest da on da.media_type = base.media_type and da.tmdb_id = base.tmdb_id and da.anti
      left join wl on wl.mt = base.media_type and wl.id = base.tmdb_id
      left join fr on fr.mt = base.media_type and fr.id = base.tmdb_id
      left join fat on fat.mood = base.mood
      left join today_other tod on tod.mt = base.media_type and tod.id = base.tmdb_id
  ),
  sc as (
    select sig.*,
           sig.pen_theme + sig.pen_fat + 0.3 * sig.anti + sig.pen_today as pen,
           (case sig.oracle
              when 'bogart'  then 1.00 * sig.q9 + 0.35 * sig.m + 0.30 * sig.aff + 0.25 * sig.k + 0.25 * sig.wlv + 0.15 * sig.frv
              when 'fincher' then 0.55 * sig.m + 0.30 * sig.q9 + 0.60 * sig.k + 0.25 * sig.h + 0.20 * sig.aff + 0.15 * sig.wlv + 0.10 * sig.frv
              else                0.45 * sig.m + 0.55 * sig.u + 0.25 * sig.k + 0.20 * sig.h
            end) + 0.80 * sig.fit as s0,
           case sig.oracle when 'bogart' then 0.25 * sig.wlv when 'fincher' then 0.15 * sig.wlv else 0 end as wlterm,
           case sig.oracle when 'bogart' then 0.08 when 'fincher' then 0.12 else 0.25 end as tau,
           coalesce(sig.pr, -1) >= case sig.oracle when 'bogart' then 8 else 7 end as f_hi,
           case sig.oracle when 'bogart' then coalesce(sig.pr, -1) >= 7 else coalesce(sig.mu, 0) >= 6.5 end as f_lo,
           coalesce(sig.mu, 0) >= 6.5 as f_mu
      from sig
  ),
  cnt as (
    select sc.oracle,
           count(*) filter (where sc.f_hi) as n_hi,
           count(*) filter (where sc.f_hi and sc.k >= 0.25) as n_hi_k,
           count(*) filter (where sc.f_lo and sc.k >= 0.25) as n_lo_k,
           count(*) filter (where sc.f_mu and not sc.in_top3) as n_out
      from sc group by sc.oracle
  ),
  hs as (select exists (select 1 from seeds where not seeds.anti) as has_seeds),
  elig as (
    select sc.*, sc.s0 - sc.pen as s
      from sc join cnt on cnt.oracle = sc.oracle cross join hs
     where case
             -- Perguntas: piso único mu ≥ 6,5 e sem restrição de humor da Cypher.
             when v_kind <> 'daily' then sc.f_mu
             -- Bogart: nota exibida ≥ 8; com menos de 5 candidatos, ≥ 7.
             when sc.oracle = 'bogart' then case when cnt.n_hi >= 5 then sc.f_hi else sc.f_lo end
             -- Fincher: ≥ 7 (fallback mu ≥ 6,5); com sementes e ≥ 10 ligados a
             -- algo que a pessoa amou (K ≥ 0,25), só esses.
             when sc.oracle = 'fincher' then
               (case when cnt.n_hi >= 5 then sc.f_hi else sc.f_lo end)
               and (not hs.has_seeds or (case when cnt.n_hi >= 5 then cnt.n_hi_k else cnt.n_lo_k end) < 10 or sc.k >= 0.25)
             -- Cypher: mu ≥ 6,5 fixo para todos (decisão 11), fora do top3
             -- (relaxa com menos de 10).
             else sc.f_mu and (cardinality(v_top3) = 0 or cnt.n_out < 10 or not sc.in_top3)
           end
  ),
  top as (
    select elig.*, row_number() over (partition by elig.oracle order by elig.s desc, elig.tmdb_id, elig.media_type) as rn
      from elig
  ),
  keyed as (
    select top.*,
           -ln(-ln((((hashtextextended(r_draw.seed::text || '|' || top.oracle || '|' || top.tmdb_id::text, 0) & 2147483647)::float8) + 0.5)
                   / 2147483648.0)) as g
      from top where top.rn <= greatest(1, coalesce(p_limit, 40))
  )
  select coalesce(jsonb_object_agg(z.oracle, z.arr), '{}'::jsonb) into v_out
    from (
      select keyed.oracle,
             jsonb_agg(jsonb_build_object(
               'tmdb_id', keyed.tmdb_id, 'media_type', keyed.media_type, 'mood', keyed.mood,
               'director_key', keyed.director_key, 'collection_id', keyed.collection_id,
               's', round(keyed.s::numeric, 6), 'wl', round(keyed.wlterm::numeric, 6), 'g', round(keyed.g::numeric, 6),
               'tau', keyed.tau, 'pred', keyed.pr,
               'mu', round(keyed.mu::numeric, 3), 'p9', round(keyed.p9::numeric, 4), 'p10', round(keyed.p10::numeric, 4),
               'k', round(keyed.k::numeric, 4), 'in_wl', keyed.wlv > 0,
               'kw_sid', keyed.kw_sid, 'kw_smt', keyed.kw_smt, 'dir_sid', keyed.dir_sid, 'dir_smt', keyed.dir_smt)
               order by keyed.s / keyed.tau + keyed.g desc, keyed.tmdb_id, keyed.media_type) as arr
        from keyed group by keyed.oracle
    ) z;
  return v_out;
end $$;

-- Candidatos do modo reconhecimento (§5.7): os filmes mais vistos de um
-- oráculo (recog_rank ≤ p_rank_max, ou o reforço curado = 0), com a chave
-- −0,3·recog_rank + G. Mesmas exclusões da tiragem normal.
create or replace function public.mesa_recon_candidates(p_uid uuid, p_draw uuid, p_seat text, p_rank_max int default 8)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  with dr as (select x.day, x.seed from public.mesa_draws x where x.id = p_draw and x.user_id = p_uid),
  vv as (select uv.ids, uv.mu, uv.p9, uv.p10, uv.pr from public.mesa_user_vec uv where uv.user_id = p_uid and uv.media_type = 'movie')
  select coalesce(jsonb_agg(z.j order by z.k desc, z.tmdb_id), '[]'::jsonb)
    from (
      select t.tmdb_id, kk.k,
             jsonb_build_object('tmdb_id', t.tmdb_id, 'media_type', 'movie', 'mood', t.mood, 'votes', t.vote_count,
                                'recog_rank', t.recog_rank, 'director_key', t.director_key, 'collection_id', t.collection_id,
                                'key', round(kk.k::numeric, 6),
                                'pred', vv.pr[pos.i], 'mu', round(vv.mu[pos.i]::numeric, 3),
                                'p9', round(vv.p9[pos.i]::numeric, 4), 'p10', round(vv.p10[pos.i]::numeric, 4)) as j
        from public.mesa_titles t
        cross join dr
        left join vv on true
        cross join lateral (select array_position(vv.ids, t.tmdb_id) as i) pos
        cross join lateral (
          select -0.3 * t.recog_rank
                 + (-ln(-ln((((hashtextextended(dr.seed::text || '|' || p_seat || '|' || t.tmdb_id::text, 0) & 2147483647)::float8) + 0.5)
                            / 2147483648.0))) as k
        ) kk
       where t.oracle = p_seat and t.media_type = 'movie' and t.recog_rank is not null and t.recog_rank <= p_rank_max
         and not exists (select 1 from public.user_movies um
                          where um.user_id = p_uid and um.movie_id = t.tmdb_id and um.media_type = 'movie' and um.rating is not null)
         and not exists (select 1 from public.mesa_feedback f
                          where f.user_id = p_uid and f.media_type = 'movie' and f.tmdb_id = t.tmdb_id and f.until >= dr.day)
         and not exists (select 1 from public.mesa_cards c
                          where c.user_id = p_uid and c.media_type = 'movie' and c.tmdb_id = t.tmdb_id
                            and (c.draw_id = p_draw
                                 or (c.state <> 'down' and c.day > dr.day - 30 and not (c.state = 'want' and c.day < dr.day - 7))))
    ) z
$$;

-- ---------------------------------------------------------------------------
-- O porquê (§5.8): a primeira razão da lista do assento que tiver dado; as
-- duas seguintes viram provas. Só palavras exibíveis (nunca spoiler/sensível).
-- Nas perguntas, o 1º item é a razão da ocasião (ou do humor pedido).
create or replace function public.mesa_reasons(p_uid uuid, p_ctx jsonb, p_seat text, p_item jsonb)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  r_t public.mesa_titles%rowtype;
  r_occ public.mesa_occasions%rowtype;
  v_mt text := p_item->>'media_type';
  v_id int := (p_item->>'tmdb_id')::int;
  v_kind text := coalesce(p_ctx->>'kind', 'daily');
  v_n int := coalesce((p_ctx->>'n_rated')::int, 0);
  v_day date := coalesce((p_ctx->>'day')::date, public.mesa_day());
  v_mean float := coalesce((p_ctx->>'user_mean')::float, 7.24);
  v_top3 text[] := array(select jsonb_array_elements_text(coalesce(p_ctx->'top3', '[]'::jsonb)));
  v_countries text[] := array(select jsonb_array_elements_text(coalesce(p_ctx->'countries', '[]'::jsonb)));
  v_decades int[] := array(select (jsonb_array_elements_text(coalesce(p_ctx->'decades', '[]'::jsonb)))::int);
  v_list text[];
  v_type text;
  v_r jsonb;
  v_first jsonb;
  v_found jsonb := '[]'::jsonb;
  v_cnt int := 0;
  v_src text; v_sig boolean;
  v_th text[]; v_th_en text[];
  v_dir text; v_txt text; v_num numeric; v_days int;
  v_main jsonb; v_ev jsonb := '[]'::jsonb; v_i int;
begin
  select * into r_t from public.mesa_titles t where t.media_type = v_mt and t.tmdb_id = v_id;
  if not found then
    return jsonb_build_object('reason', jsonb_build_object('type', 'house', 'facts', jsonb_build_object('public', null)),
                              'evidence', '[]'::jsonb);
  end if;
  select nullif(btrim(coalesce(mc.director, '')), '') into v_dir
    from public.movie_cache mc where mc.tmdb_id = v_id and mc.media_type = v_mt;

  -- Perguntas: a razão da ocasião vem primeiro.
  if v_kind = 'mood' then
    v_first := jsonb_build_object('type', 'mood_ask', 'facts', jsonb_build_object('mood', r_t.mood));
  elsif v_kind in ('occ','season') then
    select * into r_occ from public.mesa_occasions o where o.key = p_ctx->>'occ_key';
    select o.source into v_src from public.mesa_title_occasions o
     where o.occasion_key = r_occ.key and o.media_type = v_mt and o.tmdb_id = v_id;
    v_sig := r_occ.comment_signal is not null and exists (
               select 1 from public.mesa_comment_flags f
                where f.media_type = v_mt and f.tmdb_id = v_id and r_occ.comment_signal = any(f.signals));
    if v_src = 'comentario' or v_sig then
      v_first := jsonb_build_object('type', 'occasion_comment', 'facts', jsonb_build_object('oracle', r_t.oracle));
    elsif r_occ.grp = 'time' and v_mt = 'movie' and r_t.runtime is not null then
      v_first := jsonb_build_object('type', 'occasion_runtime', 'facts', jsonb_build_object('minutes', r_t.runtime));
    elsif r_occ.grp = 'time' and v_mt = 'tv' and r_occ.ep_max is not null and r_t.ep_runtime is not null then
      v_first := jsonb_build_object('type', 'occasion_episode', 'facts', jsonb_build_object('minutes', r_t.ep_runtime));
    elsif r_occ.grp = 'time' and v_mt = 'tv' and (r_occ.ended_only or r_occ.total_min is not null) and r_t.total_min is not null then
      v_first := jsonb_build_object('type', 'occasion_binge',
                                    'facts', jsonb_build_object('hours', round(r_t.total_min / 60.0), 'seasons', r_t.seasons));
    else
      select array_agg(z.label_pt order by z.idf desc, z.kw_id), array_agg(z.label_en order by z.idf desc, z.kw_id)
        into v_th, v_th_en
        from (
          select y.* from (
            select distinct on (coalesce(mk.tema, mk.kw_id::text)) mk.kw_id, mk.label_pt, mk.label_en, mk.idf
              from public.mesa_kw mk
             where mk.kw_id = any(r_t.kw) and lower(mk.name_en) = any(r_occ.tones_plus)
               and mk.exibivel and not mk.spoiler and not mk.sensivel and mk.label_pt is not null and mk.label_en is not null
             order by coalesce(mk.tema, mk.kw_id::text), mk.idf desc, mk.kw_id
          ) y order by y.idf desc, y.kw_id limit 2
        ) z;
      if coalesce(array_length(v_th, 1), 0) > 0 then
        v_first := jsonb_build_object('type', 'occasion_tone',
                     'facts', jsonb_build_object('occasion', case when r_occ.key like 'season:%' then split_part(r_occ.key, ':', 2) else r_occ.key end,
                                                 'themes_pt', to_jsonb(v_th), 'themes_en', to_jsonb(v_th_en)));
      end if;
    end if;
  end if;

  v_list := case p_seat
              when 'bogart'  then array['anchor_director','anchor_kw','watchlist','friend','mood_affinity','house']
              when 'fincher' then array['anchor_director','anchor_kw','hidden','mood_affinity','watchlist','house']
              else                array['cypher_mood','cypher_country','cypher_decade','hidden','anchor_kw','house']
            end;

  foreach v_type in array v_list loop
    exit when (v_first is not null and v_cnt >= 2) or (v_first is null and v_cnt >= 3);
    v_r := null;
    if v_type = 'anchor_director' and (p_item->>'dir_sid') is not null then
      select jsonb_build_object('type', 'anchor_director', 'facts', jsonb_build_object(
               'anchor_tmdb_id', mc.tmdb_id, 'anchor_media_type', mc.media_type,
               'anchor_title_pt', mc.title_pt, 'anchor_title_en', mc.title_en,
               'anchor_poster', coalesce(mc.poster_path, mc.poster_path_pt), 'anchor_rating', um.rating,
               'director', coalesce(v_dir, nullif(btrim(coalesce(mc.director, '')), ''))))
        into v_r
        from public.movie_cache mc
        join public.user_movies um on um.user_id = p_uid and um.movie_id = mc.tmdb_id and um.media_type = mc.media_type
       where mc.tmdb_id = (p_item->>'dir_sid')::int and mc.media_type = p_item->>'dir_smt' and um.rating is not null;
    elsif v_type = 'anchor_kw' and (p_item->>'kw_sid') is not null then
      select array_agg(z.label_pt order by z.idf desc, z.kw_id), array_agg(z.label_en order by z.idf desc, z.kw_id)
        into v_th, v_th_en
        from (
          select y.* from (
            select distinct on (coalesce(mk.tema, mk.kw_id::text)) mk.kw_id, mk.label_pt, mk.label_en, mk.idf
              from public.movie_cache smc
              cross join lateral jsonb_array_elements(case when jsonb_typeof(smc.keywords) = 'array' then smc.keywords else '[]'::jsonb end) e
              join public.mesa_kw mk on mk.kw_id = case when (e->>'id') ~ '^[0-9]+$' then (e->>'id')::int end
             where smc.tmdb_id = (p_item->>'kw_sid')::int and smc.media_type = p_item->>'kw_smt'
               and mk.kw_id = any(r_t.kw)
               and mk.exibivel and not mk.spoiler and not mk.sensivel and mk.label_pt is not null and mk.label_en is not null
             order by coalesce(mk.tema, mk.kw_id::text), mk.idf desc, mk.kw_id
          ) y order by y.idf desc, y.kw_id limit 2
        ) z;
      if coalesce(array_length(v_th, 1), 0) > 0 then
        select jsonb_build_object('type', 'anchor_kw', 'facts', jsonb_build_object(
                 'anchor_tmdb_id', mc.tmdb_id, 'anchor_media_type', mc.media_type,
                 'anchor_title_pt', mc.title_pt, 'anchor_title_en', mc.title_en,
                 'anchor_poster', coalesce(mc.poster_path, mc.poster_path_pt), 'anchor_rating', um.rating,
                 'themes_pt', to_jsonb(v_th), 'themes_en', to_jsonb(v_th_en)))
          into v_r
          from public.movie_cache mc
          join public.user_movies um on um.user_id = p_uid and um.movie_id = mc.tmdb_id and um.media_type = mc.media_type
         where mc.tmdb_id = (p_item->>'kw_sid')::int and mc.media_type = p_item->>'kw_smt' and um.rating is not null;
      end if;
    elsif v_type = 'watchlist' then
      select greatest(1, v_day - (um.created_at at time zone 'America/Sao_Paulo')::date) into v_days
        from public.user_movies um
       where um.user_id = p_uid and um.movie_id = v_id and um.media_type = v_mt and um.rating is null;
      if v_days is not null then
        v_r := jsonb_build_object('type', 'watchlist', 'facts', jsonb_build_object('days', v_days));
      end if;
    elsif v_type = 'friend' then
      select jsonb_build_object('type', 'friend', 'facts', jsonb_build_object(
               'username', p.username, 'avatar_url', p.avatar_url, 'rating', x.rating, 'others', x.others))
        into v_r
        from (
          select um.user_id, um.rating, (count(*) over ())::int - 1 as others,
                 row_number() over (order by um.rating desc, coalesce(um.updated_at, um.created_at) desc, um.user_id) as rn
            from public.user_movies um
           where um.movie_id = v_id and um.media_type = v_mt and um.rating >= 8 and um.user_id <> p_uid
             and exists (select 1 from public.friendships fs
                          where fs.status = 'accepted'
                            and ((fs.requester_id = p_uid and fs.addressee_id = um.user_id)
                              or (fs.addressee_id = p_uid and fs.requester_id = um.user_id)))
             and not exists (select 1 from public.bot_accounts ba where ba.user_id = um.user_id)
        ) x
        join public.profiles p on p.id = x.user_id
       where x.rn = 1;
    elsif v_type = 'mood_affinity' then
      if coalesce((p_ctx->'moods'->r_t.mood->>'n')::int, 0) >= 3
         and coalesce((p_ctx->'moods'->r_t.mood->>'avg')::float, 0) >= v_mean then
        v_r := jsonb_build_object('type', 'mood_affinity', 'facts', jsonb_build_object(
                 'mood', r_t.mood, 'avg', round((p_ctx->'moods'->r_t.mood->>'avg')::numeric, 1),
                 'n', (p_ctx->'moods'->r_t.mood->>'n')::int));
      end if;
    elsif v_type = 'hidden' then
      if r_t.vote_count < 2000 then
        v_r := jsonb_build_object('type', 'hidden', 'facts', jsonb_build_object('votes', r_t.vote_count));
      end if;
    elsif v_type = 'cypher_mood' then
      if cardinality(v_top3) > 0 and not (r_t.mood = any(v_top3)) then
        v_r := jsonb_build_object('type', 'cypher_mood', 'facts', jsonb_build_object('mood', r_t.mood));
      end if;
    elsif v_type = 'cypher_country' then
      if v_n >= 20 then
        select c into v_txt from unnest(r_t.countries) with ordinality as u(c, o)
         where not (c = any(v_countries)) order by o limit 1;
        if v_txt is not null then
          v_r := jsonb_build_object('type', 'cypher_country', 'facts', jsonb_build_object('country', v_txt));
        end if;
      end if;
    elsif v_type = 'cypher_decade' then
      if v_n >= 20 and r_t.decade is not null and not (r_t.decade = any(v_decades)) then
        v_r := jsonb_build_object('type', 'cypher_decade', 'facts', jsonb_build_object('decade', r_t.decade));
      end if;
    elsif v_type = 'house' then
      v_r := jsonb_build_object('type', 'house', 'facts', jsonb_build_object('public', round(r_t.vote_avg::numeric, 1)));
    end if;
    if v_r is not null then
      v_found := v_found || jsonb_build_array(v_r);
      if v_r->>'type' <> 'house' then v_cnt := v_cnt + 1; end if;
    end if;
  end loop;

  if v_first is not null then
    v_main := v_first;
    v_i := 0;
  else
    v_main := coalesce(v_found->0, jsonb_build_object('type', 'house', 'facts', jsonb_build_object('public', round(r_t.vote_avg::numeric, 1))));
    v_i := 1;
  end if;
  -- Provas: as duas seguintes, sem repetir o tipo da principal e sem "casa".
  select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb) into v_ev
    from (
      select x.value, x.ord from jsonb_array_elements(v_found) with ordinality as x(value, ord)
       where x.ord > v_i and x.value->>'type' <> 'house' and x.value->>'type' <> v_main->>'type'
       order by x.ord limit 2
    ) e;
  return jsonb_build_object('reason', v_main, 'evidence', v_ev);
end $$;

-- ---------------------------------------------------------------------------
-- Os fatos do Espelho no momento da tiragem (MesaFacts, §5.10).
create or replace function public.mesa_facts(p_uid uuid, p_draw uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  r_draw record;
  r_st record;
  v_ref date; v_code text; v_n int; v_y jsonb; v_rising text; v_weak text; v_prev uuid;
begin
  select dr.day into r_draw from public.mesa_draws dr where dr.id = p_draw;
  select s.last_visit_day, s.prev_visit_day, s.last_code into r_st from public.mesa_user_state s where s.user_id = p_uid;
  v_ref := case when r_st.last_visit_day = r_draw.day then r_st.prev_visit_day else r_st.last_visit_day end;
  select p.personalidade_completa into v_code from public.profiles p where p.id = p_uid;

  select dr.id into v_prev from public.mesa_draws dr
   where dr.user_id = p_uid and dr.day = r_draw.day - 1 and dr.ask = 'daily'
   order by dr.created_at desc limit 1;
  if v_prev is not null then
    select jsonb_build_object('flipped', count(*) filter (where c.state <> 'down'),
                              'unflipped', count(*) filter (where c.active and c.state = 'down'),
                              'cypher_closed', coalesce(bool_or(c.seat = 'cypher' and c.active and c.state = 'down'), false))
      into v_y from public.mesa_cards c where c.draw_id = v_prev;
  end if;

  select t.mood into v_rising
    from public.user_movies um
    join public.mesa_titles t on t.media_type = um.media_type and t.tmdb_id = um.movie_id
    join public.cine_moods cm on cm.mood_key = t.mood
   where um.user_id = p_uid and um.rating is not null
     and coalesce(um.updated_at, um.created_at) >= now() - interval '7 days'
   group by t.mood, cm.sort_order
  having count(*) >= 3
   order by count(*) desc, cm.sort_order
   limit 1;

  select count(*) into v_n from public.user_movies um where um.user_id = p_uid and um.rating is not null;
  if v_n >= 20 then
    select cm.mood_key into v_weak
      from public.cine_moods cm
      left join (
        select t.mood, count(*) as n
          from public.user_movies um
          join public.mesa_titles t on t.media_type = um.media_type and t.tmdb_id = um.movie_id
         where um.user_id = p_uid and um.rating is not null
         group by t.mood
      ) x on x.mood = cm.mood_key
     where coalesce(x.n, 0) <= 2
     order by coalesce(x.n, 0), cm.sort_order
     limit 1;
  end if;

  return jsonb_build_object(
    'weekday', extract(dow from r_draw.day)::int,
    'first_visit', v_ref is null,
    'returning_days', r_draw.day - v_ref,
    'yesterday', v_y,
    'mood_rising', v_rising,
    'weak_mood', v_weak,
    'code_changed', coalesce(r_st.last_code is not null and v_code is not null and r_st.last_code <> v_code, false),
    'verdicts_pending', (select count(*) from public.mesa_cards c where c.user_id = p_uid and c.rating is not null and not c.verdict_ack),
    'espelho4', exists (select 1 from public.mesa_cards c where c.draw_id = p_draw and c.kind = 'espelho4'),
    'reveal', exists (select 1 from public.mesa_cards c where c.draw_id = p_draw and c.kind = 'reveal'),
    'live_event', public.mesa_live_event(r_draw.day));
end $$;

-- ---------------------------------------------------------------------------
-- A tiragem (§5.4). Uma por pessoa × dia × pergunta × mídia, gravada; pedir
-- de novo devolve a mesma. Determinística pela semente.
create or replace function public.mesa_draw_create(p_uid uuid, p_day date, p_ask text, p_media text)
returns uuid language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid; v_seed int; v_n int; v_mode text; v_kind text;
  r_occ public.mesa_occasions%rowtype;
  v_ctx jsonb; v_cands jsonb; v_seat text; v_c jsonb; v_main jsonb; v_res jsonb; v_tmp jsonb; v_rs jsonb;
  v_reserves jsonb := '{}'::jsonb; v_passed jsonb := '[]'::jsonb;
  v_moods text[] := '{}'; v_dirs text[] := '{}'; v_colls int[] := '{}';
  v_wl_taken boolean := false; v_series_taken boolean := false;
  v_host text; v_order text[]; v_rot text[]; v_used text[] := '{}'; v_m text; v_i int;
  v_code text; v_counted int; v_mused int; v_rmood text; v_ws date; v_has_reveal boolean := false;
  v_seats text[] := array['bogart','fincher','cypher'];
begin
  -- Passo 0: trava e semente.
  perform pg_advisory_xact_lock(hashtext(p_uid::text || p_day::text || p_ask || p_media));
  select dr.id into v_id from public.mesa_draws dr
   where dr.user_id = p_uid and dr.day = p_day and dr.ask = p_ask and dr.media = p_media;
  if found then return v_id; end if;

  v_seed := (hashtextextended(p_uid::text || '|' || p_day::text || '|' || p_ask || '|' || p_media, 42) & 2147483647)::int;
  select count(*) into v_n from public.user_movies um where um.user_id = p_uid and um.rating is not null;
  v_kind := case when p_ask = 'daily' then 'daily' when p_ask like 'occ:%' then 'occ'
                 when p_ask like 'mood:%' then 'mood' else 'season' end;
  v_mode := case when v_kind = 'daily' and v_n < 10 then 'recon' else 'normal' end;
  if v_kind = 'occ' then
    select * into r_occ from public.mesa_occasions o where o.key = substr(p_ask, 5);
  elsif v_kind = 'season' then
    select * into r_occ from public.mesa_occasions o where o.key = p_ask;
  end if;

  insert into public.mesa_draws (user_id, day, ask, media, mode, seed)
  values (p_uid, p_day, p_ask, p_media, v_mode, v_seed)
  returning id into v_id;

  -- Passo 2: vetores (política de frescor do §5.1).
  perform public.mesa_ensure_vec(p_uid, 'movie');
  if p_media in ('all','tv') then perform public.mesa_ensure_vec(p_uid, 'tv'); end if;
  v_ctx := public.mesa_ctx(p_uid, v_id);

  if v_mode = 'recon' then
    -- Modo reconhecimento: cada oráculo traz um dos mais vistos dele, num humor
    -- diferente, de preferência os que a pessoa ainda não avaliou.
    v_order := array(select cm.mood_key from public.cine_moods cm
                      order by coalesce((v_ctx->'moods'->cm.mood_key->>'n')::int, 0), hashtext(v_seed::text || cm.mood_key), cm.mood_key);
    foreach v_seat in array v_seats loop
      v_cands := public.mesa_recon_candidates(p_uid, v_id, v_seat, 8);
      v_main := null;
      foreach v_m in array v_order loop
        continue when v_m = any(v_used);
        select x.value into v_main from jsonb_array_elements(v_cands) x
         where x.value->>'mood' = v_m order by (x.value->>'key')::float desc, (x.value->>'tmdb_id')::int limit 1;
        exit when v_main is not null;
      end loop;
      if v_main is null then
        v_passed := v_passed || jsonb_build_array(jsonb_build_object('seat', v_seat, 'reason', 'empty'));
        continue;
      end if;
      v_used := v_used || (v_main->>'mood');
      v_i := array_position(v_order, v_main->>'mood');
      v_rot := v_order[v_i + 1:] || v_order[1:v_i];
      select coalesce(jsonb_agg(z.value order by z.rn, z.pos), '[]'::jsonb) into v_res
        from (
          select x.value,
                 row_number() over (partition by x.value->>'mood' order by (x.value->>'key')::float desc, (x.value->>'tmdb_id')::int) as rn,
                 array_position(v_rot, x.value->>'mood') as pos
            from jsonb_array_elements(v_cands) x
           where (x.value->>'tmdb_id')::int <> (v_main->>'tmdb_id')::int
           order by rn, pos limit 6
        ) z;
      insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, media_type, tmdb_id, oracle, mood,
                                     pred, mu, p9, p10, reason, evidence)
      values (v_id, p_uid, p_day, v_seat, 'recon', 0, 'movie', (v_main->>'tmdb_id')::int, v_seat, v_main->>'mood',
              (v_main->>'pred')::smallint, (v_main->>'mu')::real, (v_main->>'p9')::real, (v_main->>'p10')::real,
              jsonb_build_object('type', 'recognition', 'facts', jsonb_build_object('mood', v_main->>'mood', 'votes', (v_main->>'votes')::int)),
              '[]'::jsonb);
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', (x.value->>'tmdb_id')::int, 'media_type', 'movie', 'mood', x.value->>'mood',
               'pred', x.value->'pred', 'mu', x.value->'mu', 'p9', x.value->'p9', 'p10', x.value->'p10',
               'reason', jsonb_build_object('type', 'recognition', 'facts', jsonb_build_object('mood', x.value->>'mood', 'votes', (x.value->>'votes')::int)),
               'evidence', '[]'::jsonb, 'director_key', x.value->'director_key', 'collection_id', x.value->'collection_id')
               order by x.ord), '[]'::jsonb)
        into v_tmp from jsonb_array_elements(v_res) with ordinality as x(value, ord);
      v_reserves := v_reserves || jsonb_build_object(v_seat, v_tmp);
    end loop;
  else
    -- Passos 3 a 7: candidatos, pontuação, sorteio e travas (Bogart → Fincher → Cypher).
    v_cands := public.mesa_slot_candidates(p_uid, v_id, null, 40);
    foreach v_seat in array v_seats loop
      if r_occ.key is not null and v_seat = any(r_occ.pass_oracles) then
        -- Em "colo", a Cypher passa a vez de propósito.
        v_passed := v_passed || jsonb_build_array(jsonb_build_object('seat', v_seat, 'reason', 'colo'));
        continue;
      end if;
      v_main := null;
      v_res := '[]'::jsonb;
      for v_c in
        select x.value from jsonb_array_elements(coalesce(v_cands->v_seat, '[]'::jsonb)) x
         order by ((x.value->>'s')::float
                   - case when v_kind <> 'mood' and (x.value->>'mood') = any(v_moods) then 0.15 else 0 end
                   - case when v_wl_taken then (x.value->>'wl')::float else 0 end) / (x.value->>'tau')::float
                  + (x.value->>'g')::float desc,
                  (x.value->>'tmdb_id')::int, x.value->>'media_type'
      loop
        continue when (v_c->>'director_key') is not null and (v_c->>'director_key') = any(v_dirs);
        continue when (v_c->>'collection_id') is not null and (v_c->>'collection_id')::int = any(v_colls);
        continue when v_series_taken and v_kind <> 'daily' and r_occ.media is null and v_c->>'media_type' = 'tv';
        if v_main is null then
          v_main := v_c;
        else
          v_res := v_res || jsonb_build_array(v_c);
          exit when jsonb_array_length(v_res) >= 6;
        end if;
      end loop;
      if v_main is null then
        v_passed := v_passed || jsonb_build_array(jsonb_build_object('seat', v_seat, 'reason', 'empty'));
        continue;
      end if;
      v_rs := public.mesa_reasons(p_uid, v_ctx, v_seat, v_main);
      insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, media_type, tmdb_id, oracle, mood,
                                     pred, mu, p9, p10, reason, evidence)
      values (v_id, p_uid, p_day, v_seat, 'main', 0, v_main->>'media_type', (v_main->>'tmdb_id')::int, v_seat, v_main->>'mood',
              (v_main->>'pred')::smallint, (v_main->>'mu')::real, (v_main->>'p9')::real, (v_main->>'p10')::real,
              v_rs->'reason', coalesce(v_rs->'evidence', '[]'::jsonb));
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', (x.value->>'tmdb_id')::int, 'media_type', x.value->>'media_type', 'mood', x.value->>'mood',
               'pred', x.value->'pred', 'mu', x.value->'mu', 'p9', x.value->'p9', 'p10', x.value->'p10',
               'reason', rr.v->'reason', 'evidence', coalesce(rr.v->'evidence', '[]'::jsonb),
               'director_key', x.value->'director_key', 'collection_id', x.value->'collection_id')
               order by x.ord), '[]'::jsonb)
        into v_tmp
        from jsonb_array_elements(v_res) with ordinality as x(value, ord)
        cross join lateral (select public.mesa_reasons(p_uid, v_ctx, v_seat, x.value) as v) rr;
      v_reserves := v_reserves || jsonb_build_object(v_seat, v_tmp);
      -- As travas para os assentos seguintes.
      v_moods := v_moods || (v_main->>'mood');
      if (v_main->>'director_key') is not null then v_dirs := v_dirs || (v_main->>'director_key'); end if;
      if (v_main->>'collection_id') is not null then v_colls := v_colls || (v_main->>'collection_id')::int; end if;
      if coalesce((v_main->>'in_wl')::boolean, false) then v_wl_taken := true; end if;
      if v_main->>'media_type' = 'tv' then v_series_taken := true; end if;
    end loop;
  end if;

  -- Passo 9: cartas extras, só na tiragem diária (§5.7). A da revelação vence.
  if v_kind = 'daily' then
    select p.personalidade_completa, coalesce(p.persona_counted, 0),
           (select count(*) from jsonb_array_elements(coalesce(p.persona_scores, '[]'::jsonb)) s where coalesce((s->>'films')::int, 0) > 0)
      into v_code, v_counted, v_mused
      from public.profiles p where p.id = p_uid;
    if v_code is null and (v_counted >= 7 or (v_counted >= 10 and v_mused < 3)) then
      select cm.mood_key into v_rmood from public.cine_moods cm
       where coalesce((v_ctx->'moods'->cm.mood_key->>'n')::int, 0) = 0
       order by cm.sort_order limit 1;
      if v_rmood is not null then
        insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, media_type, tmdb_id, oracle, mood,
                                       pred, mu, p9, p10, reason, evidence)
        select v_id, p_uid, p_day, 'espelho', 'reveal', 0, 'movie', x.tmdb_id, x.oracle, x.mood,
               uv.pr[array_position(uv.ids, x.tmdb_id)], uv.mu[array_position(uv.ids, x.tmdb_id)],
               uv.p9[array_position(uv.ids, x.tmdb_id)], uv.p10[array_position(uv.ids, x.tmdb_id)],
               jsonb_build_object('type', 'reveal', 'facts', jsonb_build_object('missing', greatest(1, 10 - v_counted), 'mood', v_rmood)),
               '[]'::jsonb
          from (
            select t.tmdb_id, t.oracle, t.mood from public.mesa_titles t
             where t.media_type = 'movie' and t.mood = v_rmood and t.recog_rank is not null
               and not exists (select 1 from public.user_movies um
                                where um.user_id = p_uid and um.movie_id = t.tmdb_id and um.media_type = 'movie' and um.rating is not null)
               and not exists (select 1 from public.mesa_feedback f
                                where f.user_id = p_uid and f.media_type = 'movie' and f.tmdb_id = t.tmdb_id and f.until >= p_day)
               and not exists (select 1 from public.mesa_cards c where c.draw_id = v_id and c.media_type = 'movie' and c.tmdb_id = t.tmdb_id)
             order by t.recog_rank, t.vote_count desc, t.tmdb_id
             limit 1
          ) x
          left join public.mesa_user_vec uv on uv.user_id = p_uid and uv.media_type = 'movie';
        v_has_reveal := found;
      end if;
    end if;

    if v_mode = 'normal' and not v_has_reveal then
      -- A quarta carta do Espelho: uma por semana de Brasília, depois de uma
      -- nota dada a uma carta da Mesa nesta semana. Nunca da Cypher, nunca com
      -- ressalva; sem sorteio (é a escolha do Espelho).
      v_ws := date_trunc('week', p_day::timestamp)::date;
      if not exists (select 1 from public.mesa_cards c
                      where c.user_id = p_uid and c.kind = 'espelho4' and c.day between v_ws and v_ws + 6)
         and exists (select 1 from public.mesa_cards c
                      where c.user_id = p_uid and c.rated_at >= (v_ws::timestamp at time zone 'America/Sao_Paulo') and c.rated_at <= now()) then
        insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, media_type, tmdb_id, oracle, mood,
                                       pred, mu, p9, p10, reason, evidence)
        select v_id, p_uid, p_day, 'espelho', 'espelho4', 0, x.media_type, x.tmdb_id, x.oracle, x.mood,
               x.pr, x.mu, x.p9, x.p10, jsonb_build_object('type', 'espelho_best', 'facts', '{}'::jsonb), '[]'::jsonb
          from (
            select t.media_type, t.tmdb_id, t.oracle, t.mood, u.pr, u.mu, u.p9, u.p10
              from public.mesa_user_vec uv
              cross join lateral unnest(uv.ids, uv.mu, uv.p9, uv.p10, uv.pr) as u(id, mu, p9, p10, pr)
              join public.mesa_titles t on t.media_type = uv.media_type and t.tmdb_id = u.id
             where uv.user_id = p_uid and uv.media_type = case when p_media = 'tv' then 'tv' else 'movie' end
               and t.oracle in ('bogart','fincher') and not t.ressalva and u.pr >= 7
               and not exists (select 1 from public.user_movies um
                                where um.user_id = p_uid and um.movie_id = t.tmdb_id and um.media_type = t.media_type and um.rating is not null)
               and not exists (select 1 from public.mesa_feedback f
                                where f.user_id = p_uid and f.media_type = t.media_type and f.tmdb_id = t.tmdb_id and f.until >= p_day)
               and not exists (select 1 from public.mesa_cards c
                                where c.user_id = p_uid and c.media_type = t.media_type and c.tmdb_id = t.tmdb_id
                                  and (c.draw_id = v_id or c.created_at >= now() - interval '60 days'))
             order by (u.pr >= 8) desc, u.p10 desc nulls last, u.mu desc nulls last, t.tmdb_id
             limit 1
          ) x;
      end if;
    end if;
  end if;

  -- Passo 8: o anfitrião é o oráculo com a carta de maior p9; empate pela semente.
  select c.oracle into v_host from public.mesa_cards c
   where c.draw_id = v_id and c.seat <> 'espelho'
   order by coalesce(c.p9, 0) desc, hashtext(v_seed::text || c.seat), c.seat
   limit 1;

  update public.mesa_draws
     set host = v_host, reserves = v_reserves, passed = v_passed, facts = public.mesa_facts(p_uid, v_id)
   where id = v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Trocas (§5.5): a primeira reserva ainda válida AGORA vira a carta nova do
-- assento, já virada. Sem reservas, calcula de novo só aquele assento. Quem
-- chama já desligou a carta anterior (active = false).
create or replace function public.mesa_promote(p_draw uuid, p_seat text)
returns uuid language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  r_draw public.mesa_draws%rowtype;
  v_kind text; v_gen int;
  v_list jsonb; v_item jsonb; v_ord bigint; v_rest jsonb := '[]'::jsonb;
  v_dirs text[]; v_colls int[]; v_moods text[]; v_has_tv boolean;
  v_ctx jsonb; v_cands jsonb; v_c jsonb; v_res jsonb := '[]'::jsonb; v_new uuid; v_rs jsonb;
  v_occ_media text; v_ask_kind text;
begin
  select * into r_draw from public.mesa_draws dr where dr.id = p_draw for update;
  if not found or p_seat not in ('bogart','fincher','cypher') then return null; end if;
  select c.kind, c.gen into v_kind, v_gen from public.mesa_cards c
   where c.draw_id = p_draw and c.seat = p_seat order by c.gen desc limit 1;
  if v_kind is null then
    v_kind := case when r_draw.mode = 'recon' then 'recon' else 'main' end;
    v_gen := -1;
  end if;
  v_ask_kind := case when r_draw.ask = 'daily' then 'daily' when r_draw.ask like 'occ:%' then 'occ'
                     when r_draw.ask like 'mood:%' then 'mood' else 'season' end;
  if v_ask_kind = 'occ' then
    select o.media into v_occ_media from public.mesa_occasions o where o.key = substr(r_draw.ask, 5);
  elsif v_ask_kind = 'season' then
    select o.media into v_occ_media from public.mesa_occasions o where o.key = r_draw.ask;
  end if;

  select coalesce(array_agg(distinct t.director_key) filter (where t.director_key is not null), '{}'),
         coalesce(array_agg(distinct t.collection_id) filter (where t.collection_id is not null), '{}'),
         coalesce(array_agg(distinct c.mood), '{}'),
         coalesce(bool_or(c.media_type = 'tv'), false)
    into v_dirs, v_colls, v_moods, v_has_tv
    from public.mesa_cards c
    left join public.mesa_titles t on t.media_type = c.media_type and t.tmdb_id = c.tmdb_id
   where c.draw_id = p_draw and c.active and c.seat <> p_seat;

  -- 1) A primeira reserva ainda válida; as inválidas antes dela saem da lista.
  v_list := case when jsonb_typeof(r_draw.reserves->p_seat) = 'array' then r_draw.reserves->p_seat else '[]'::jsonb end;
  select x.value, x.ord into v_item, v_ord
    from jsonb_array_elements(v_list) with ordinality as x(value, ord)
   where not exists (select 1 from public.user_movies um
                      where um.user_id = r_draw.user_id and um.movie_id = (x.value->>'tmdb_id')::int
                        and um.media_type = x.value->>'media_type' and um.rating is not null)
     and not exists (select 1 from public.mesa_feedback f
                      where f.user_id = r_draw.user_id and f.media_type = x.value->>'media_type'
                        and f.tmdb_id = (x.value->>'tmdb_id')::int and f.until >= r_draw.day)
     and not exists (select 1 from public.mesa_cards c
                      where c.draw_id = p_draw and c.media_type = x.value->>'media_type' and c.tmdb_id = (x.value->>'tmdb_id')::int)
     and ((x.value->>'director_key') is null or not ((x.value->>'director_key') = any(v_dirs)))
     and ((x.value->>'collection_id') is null or not ((x.value->>'collection_id')::int = any(v_colls)))
   order by x.ord
   limit 1;
  if v_item is not null then
    select coalesce(jsonb_agg(x.value order by x.ord), '[]'::jsonb) into v_rest
      from jsonb_array_elements(v_list) with ordinality as x(value, ord) where x.ord > v_ord;
  else
    -- 2) Reservas acabaram: recalcula só este assento, excluindo tudo o que já
    --    passou pela tiragem, e anexa 6 reservas novas.
    v_ctx := public.mesa_ctx(r_draw.user_id, p_draw);
    if v_kind = 'recon' then
      v_cands := public.mesa_recon_candidates(r_draw.user_id, p_draw, p_seat, 30);
    else
      v_cands := coalesce(public.mesa_slot_candidates(r_draw.user_id, p_draw, p_seat, 40)->p_seat, '[]'::jsonb);
    end if;
    for v_c in
      select x.value from jsonb_array_elements(v_cands) x
       order by case when v_kind = 'recon' then (x.value->>'key')::float
                     else ((x.value->>'s')::float
                           - case when v_ask_kind <> 'mood' and (x.value->>'mood') = any(v_moods) then 0.15 else 0 end)
                          / (x.value->>'tau')::float + (x.value->>'g')::float end desc,
                (x.value->>'tmdb_id')::int
    loop
      continue when (v_c->>'director_key') is not null and (v_c->>'director_key') = any(v_dirs);
      continue when (v_c->>'collection_id') is not null and (v_c->>'collection_id')::int = any(v_colls);
      continue when v_has_tv and v_ask_kind <> 'daily' and v_occ_media is null and r_draw.media = 'all' and v_c->>'media_type' = 'tv';
      if v_item is null then
        v_item := v_c;
      else
        v_res := v_res || jsonb_build_array(v_c);
        exit when jsonb_array_length(v_res) >= 6;
      end if;
    end loop;
    if v_item is null then return null; end if;
    if v_kind = 'recon' then
      v_item := v_item || jsonb_build_object(
        'reason', jsonb_build_object('type', 'recognition', 'facts', jsonb_build_object('mood', v_item->>'mood', 'votes', (v_item->>'votes')::int)),
        'evidence', '[]'::jsonb);
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', (x.value->>'tmdb_id')::int, 'media_type', 'movie', 'mood', x.value->>'mood',
               'pred', x.value->'pred', 'mu', x.value->'mu', 'p9', x.value->'p9', 'p10', x.value->'p10',
               'reason', jsonb_build_object('type', 'recognition', 'facts', jsonb_build_object('mood', x.value->>'mood', 'votes', (x.value->>'votes')::int)),
               'evidence', '[]'::jsonb, 'director_key', x.value->'director_key', 'collection_id', x.value->'collection_id')
               order by x.ord), '[]'::jsonb)
        into v_rest from jsonb_array_elements(v_res) with ordinality as x(value, ord);
    else
      v_rs := public.mesa_reasons(r_draw.user_id, v_ctx, p_seat, v_item);
      v_item := v_item || jsonb_build_object('reason', v_rs->'reason', 'evidence', coalesce(v_rs->'evidence', '[]'::jsonb));
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', (x.value->>'tmdb_id')::int, 'media_type', x.value->>'media_type', 'mood', x.value->>'mood',
               'pred', x.value->'pred', 'mu', x.value->'mu', 'p9', x.value->'p9', 'p10', x.value->'p10',
               'reason', rr.v->'reason', 'evidence', coalesce(rr.v->'evidence', '[]'::jsonb),
               'director_key', x.value->'director_key', 'collection_id', x.value->'collection_id')
               order by x.ord), '[]'::jsonb)
        into v_rest
        from jsonb_array_elements(v_res) with ordinality as x(value, ord)
        cross join lateral (select public.mesa_reasons(r_draw.user_id, v_ctx, p_seat, x.value) as v) rr;
    end if;
  end if;

  insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, active, media_type, tmdb_id, oracle, mood,
                                 pred, mu, p9, p10, reason, evidence, state, flipped_at)
  values (p_draw, r_draw.user_id, r_draw.day, p_seat, v_kind, v_gen + 1, true, v_item->>'media_type', (v_item->>'tmdb_id')::int,
          p_seat, coalesce(v_item->>'mood', (select t.mood from public.mesa_titles t
                                               where t.media_type = v_item->>'media_type' and t.tmdb_id = (v_item->>'tmdb_id')::int), 'unknown'),
          (v_item->>'pred')::smallint, (v_item->>'mu')::real, (v_item->>'p9')::real, (v_item->>'p10')::real,
          coalesce(v_item->'reason', jsonb_build_object('type', 'house', 'facts', '{}'::jsonb)), coalesce(v_item->'evidence', '[]'::jsonb),
          'up', now())
  returning id into v_new;

  update public.mesa_draws set reserves = jsonb_set(coalesce(reserves, '{}'::jsonb), array[p_seat], v_rest, true)
   where id = p_draw;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- MesaMe (§5.10): notas, rótulo do selo, Persona, progresso, top3 e o estilo
-- de carta da pessoa.
create or replace function public.mesa_me(p_uid uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  with n as (
    select count(*) filter (where um.rating is not null)::int as rated,
           count(*) filter (where um.rating is not null and um.media_type = 'movie')::int as rated_movies
      from public.user_movies um where um.user_id = p_uid
  )
  select jsonb_build_object(
    'rated', n.rated,
    'rated_movies', n.rated_movies,
    'pred_label', public.mesa_pred_label(n.rated),
    'persona', (select jsonb_build_object('code', cp.code, 'title_pt', cp.title_pt, 'title_en', cp.title_en,
                                          'character_pt', cp.character_pt, 'character_en', cp.character_en, 'film_tmdb', cp.tmdb_id)
                  from public.profiles p join public.cine_personas cp on cp.code = p.personalidade_completa
                 where p.id = p_uid),
    'persona_progress', jsonb_build_object(
       'counted', coalesce((select p.persona_counted from public.profiles p where p.id = p_uid), 0),
       'threshold', 10,
       'moods_used', coalesce((select count(*)::int from public.profiles p
                                cross join lateral jsonb_array_elements(coalesce(p.persona_scores, '[]'::jsonb)) s
                               where p.id = p_uid and coalesce((s->>'films')::int, 0) > 0), 0)),
    'top_moods', to_jsonb(public.mesa_top3(p_uid)),
    'card_style', coalesce((select case when p.card_style in ('default','yugioh','horror') then p.card_style else 'default' end
                              from public.profiles p where p.id = p_uid), 'default'))
  from n
$$;

-- As cartas no formato MesaCard (§5.10), na ordem dos ids pedidos. Lê ao vivo
-- a nota e a Watchlist da pessoa (my), o comentário selado e os fatos de fala.
create or replace function public.mesa_cards_json(p_uid uuid, p_ids uuid[])
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  with u as (
    select count(*)::int as n,
           coalesce(array_agg(distinct t.mood) filter (where t.mood is not null), '{}'::text[]) as moods
      from public.user_movies um
      left join public.mesa_titles t on t.media_type = um.media_type and t.tmdb_id = um.movie_id
     where um.user_id = p_uid and um.rating is not null
  ),
  uc as (
    select coalesce(array_agg(distinct oc), '{}'::text[]) as countries
      from public.user_movies um
      join public.movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
      cross join lateral unnest(coalesce(mc.origin_country, '{}'::text[])) oc
     where um.user_id = p_uid and um.rating is not null
  )
  select coalesce(jsonb_agg(x.j order by x.ord), '[]'::jsonb)
    from (
      select i.ord, jsonb_build_object(
        'id', c.id, 'seat', c.seat, 'kind', c.kind, 'gen', c.gen, 'state', c.state,
        'sealed', (c.seat = 'cypher' and c.state = 'down'
                   and exists (select 1 from public.mesa_cards b
                                where b.draw_id = c.draw_id and b.active and b.seat in ('bogart','fincher') and b.state = 'down')),
        'second_opinion', exists (select 1 from public.mesa_cards pc
                                   where pc.draw_id = c.draw_id and pc.seat = c.seat and pc.gen = c.gen - 1 and pc.state = 'refused'),
        'title', jsonb_build_object(
           'tmdb_id', c.tmdb_id, 'media_type', c.media_type,
           'title_pt', mc.title_pt, 'title_en', mc.title_en,
           'year', coalesce(t.year::int, extract(year from mc.release_date)::int),
           'runtime', case when c.media_type = 'movie' then coalesce(t.runtime::int, nullif(mc.runtime, 0)) end,
           'ep_runtime', t.ep_runtime, 'seasons', case when c.media_type = 'tv' then coalesce(t.seasons::int, mc.number_of_seasons) end,
           'poster_path', mc.poster_path, 'poster_path_pt', mc.poster_path_pt, 'backdrop_path', mc.backdrop_path,
           'oracle', c.oracle, 'mood', c.mood,
           'countries', to_jsonb(coalesce(t.countries, mc.origin_country, '{}'::text[])),
           'director', nullif(btrim(coalesce(mc.director, '')), ''),
           'vote_count', coalesce(mc.vote_count, t.vote_count, 0)),
        'pred', jsonb_build_object('value', case when public.mesa_pred_label(u.n) = 'hidden' then null else c.pred end,
                                   'label', public.mesa_pred_label(u.n)),
        'comment', jsonb_build_object('pt', cm.pt, 'en', cm.en, 'ressalva', coalesce(t.ressalva, false)),
        'reason', c.reason, 'evidence', c.evidence,
        'my', jsonb_build_object('rating', my.rating, 'in_watchlist', (my.id is not null and my.rating is null)),
        'line_facts', jsonb_build_object(
           'bw', coalesce(t.is_bw, false),
           'long', coalesce(t.runtime, 0) >= 150,
           'series', c.media_type = 'tv',
           'hidden', coalesce(mc.vote_count, t.vote_count, 0) < 2000,
           'bomb', coalesce(t.vote_avg, mc.vote_average::real, 0) > 0 and coalesce(t.vote_avg, mc.vote_average::real) < 5.5,
           'public', round(coalesce(t.vote_avg, mc.vote_average::real)::numeric, 1),
           'p10hi', coalesce(c.p10, 0) >= 0.35,
           'anime', coalesce(t.is_anime, false),
           'br', coalesce(t.is_br, false),
           'sequel', coalesce(t.coll_pos, 0) > 1 or 'sequel' = any(coalesce(t.kwn, '{}'::text[])),
           'huge', coalesce(mc.vote_count, t.vote_count, 0) >= 15000,
           'newmood', not (c.mood = any(u.moods)),
           'newcountry', u.n >= 20 and cardinality(coalesce(t.countries, '{}'::text[])) > 0 and not (t.countries && uc.countries),
           'decade', case when t.decade is not null then t.decade::text || 's' end,
           'ressalva', coalesce(t.ressalva, false),
           'watchlist', (my.id is not null and my.rating is null))
      ) as j
      from unnest(p_ids) with ordinality as i(id, ord)
      join public.mesa_cards c on c.id = i.id and c.user_id = p_uid
      left join public.mesa_titles t on t.media_type = c.media_type and t.tmdb_id = c.tmdb_id
      left join public.movie_cache mc on mc.tmdb_id = c.tmdb_id and mc.media_type = c.media_type
      left join lateral (
        select toc.pt, toc.en from public.title_oracle_comments toc
         where toc.card_type = c.oracle and toc.media_type = c.media_type and toc.tmdb_id = c.tmdb_id
         order by (toc.mood_key = c.mood) desc, toc.mood_key limit 1
      ) cm on true
      left join public.user_movies my on my.user_id = p_uid and my.movie_id = c.tmdb_id and my.media_type = c.media_type
      cross join u cross join uc
    ) x
$$;

-- "Quem te conhece melhor" (§5.9): acertos (exact/near/ten) nos últimos 90
-- dias; aparece com ≥ 3 vereditos e um oráculo estritamente à frente.
create or replace function public.mesa_who_knows_best(p_uid uuid)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  with v as (
    select c.oracle, c.verdict from public.mesa_cards c
     where c.user_id = p_uid and c.verdict is not null and c.rated_at >= now() - interval '90 days'
       and c.oracle in ('bogart','fincher','cypher')
  ),
  h as (
    select o.oracle, (select count(*) from v where v.oracle = o.oracle and v.verdict in ('exact','near','ten')) as hits
      from unnest(array['bogart','fincher','cypher']) as o(oracle)
  ),
  r as (select h.oracle, h.hits, row_number() over (order by h.hits desc, h.oracle) as rn from h)
  select case when (select count(*) from v) >= 3
               and (select r.hits from r where r.rn = 1) > (select r.hits from r where r.rn = 2)
              then (select r.oracle from r where r.rn = 1) end
$$;

-- O MesaPayload inteiro de uma tiragem (§5.10).
create or replace function public.mesa_payload(p_draw uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  r_draw public.mesa_draws%rowtype;
  v_cards jsonb; v_askref jsonb; v_verdicts jsonb; v_asks jsonb; v_season text; v_avail jsonb; v_days int;
  v_occ_media text;
begin
  select * into r_draw from public.mesa_draws dr where dr.id = p_draw;
  if not found then return null; end if;

  v_cards := public.mesa_cards_json(r_draw.user_id, array(
    select c.id from public.mesa_cards c
     where c.draw_id = p_draw and c.active
     order by array_position(array['bogart','fincher','cypher','espelho'], c.seat), c.gen desc));

  if r_draw.ask <> 'daily' then
    if r_draw.ask like 'occ:%' then
      select o.media into v_occ_media from public.mesa_occasions o where o.key = substr(r_draw.ask, 5);
    elsif r_draw.ask like 'season:%' then
      select o.media into v_occ_media from public.mesa_occasions o where o.key = r_draw.ask;
    end if;
    v_askref := jsonb_build_object(
      'key', r_draw.ask,
      'kind', case when r_draw.ask like 'occ:%' then 'occasion' when r_draw.ask like 'mood:%' then 'mood' else 'season' end,
      'id', split_part(r_draw.ask, ':', 2),
      'media', v_occ_media);
  end if;

  select coalesce(jsonb_agg(z.j order by z.rated_at desc), '[]'::jsonb) into v_verdicts
    from (
      select c.rated_at, jsonb_build_object(
               'card_id', c.id, 'oracle', c.oracle, 'title_pt', mc.title_pt, 'title_en', mc.title_en,
               'rating', c.rating, 'category', c.verdict, 'shown_day', c.day,
               'ask', case when dr.ask = 'daily' then null else dr.ask end) as j
        from public.mesa_cards c
        join public.mesa_draws dr on dr.id = c.draw_id
        left join public.movie_cache mc on mc.tmdb_id = c.tmdb_id and mc.media_type = c.media_type
       where c.user_id = r_draw.user_id and c.rating is not null and not c.verdict_ack and c.verdict is not null
       order by c.rated_at desc
       limit 3
    ) z;

  select m.value into v_avail from public.mesa_meta m where m.key = 'occasion_availability';
  v_season := public.mesa_live_event(public.mesa_day());
  if v_season is not null and not exists (select 1 from public.mesa_occasions o where o.key = 'season:' || v_season and o.is_active) then
    v_season := null;
  end if;
  v_asks := jsonb_build_object(
    'occasions', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', o.key, 'grp', o.grp, 'sort', o.sort, 'media', o.media,
                             'available', coalesce((v_avail->o.key->>'available')::boolean, false))
                             order by o.sort, o.key)
                             from public.mesa_occasions o where o.is_active and o.grp <> 'season' and o.season_event is null), '[]'::jsonb),
    'moods', coalesce((select jsonb_agg(cm.mood_key order by cm.sort_order) from public.cine_moods cm), '[]'::jsonb),
    'season', case when v_season is not null then jsonb_build_object('id', v_season) end);

  select count(distinct c.day)::int into v_days from public.mesa_cards c
   where c.user_id = r_draw.user_id and c.state <> 'down';

  return jsonb_build_object(
    'v', 1, 'day', r_draw.day, 'draw_id', r_draw.id, 'seed', r_draw.seed,
    'ask', v_askref, 'media', r_draw.media, 'mode', r_draw.mode, 'host', r_draw.host,
    'me', public.mesa_me(r_draw.user_id),
    'cards', v_cards,
    'passed', coalesce(r_draw.passed, '[]'::jsonb),
    'facts', coalesce(r_draw.facts, '{}'::jsonb) || jsonb_build_object(
               'verdicts_pending', (select count(*) from public.mesa_cards c
                                     where c.user_id = r_draw.user_id and c.rating is not null and not c.verdict_ack)),
    'verdicts', v_verdicts,
    'asks', v_asks,
    'book', jsonb_build_object('pages', ceil(v_days / 10.0)::int, 'who_knows_best', public.mesa_who_knows_best(r_draw.user_id)));
end $$;

-- ---------------------------------------------------------------------------
-- Pré-cálculo (§5.13). Cada pessoa num bloco com exception próprio; o falho
-- vai para mesa_meta.prepare_log. Bots nunca entram.
create or replace function public.mesa_prepare_day_for(p_users uuid[])
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_t0 timestamptz := clock_timestamp();
  v_u uuid; v_mt text; v_fp text; v_at timestamptz;
  v_ok int := 0; v_fail int := 0; v_err jsonb := '[]'::jsonb;
  v_day date := public.mesa_day();
begin
  foreach v_u in array coalesce(p_users, '{}'::uuid[]) loop
    continue when v_u is null or exists (select 1 from public.bot_accounts b where b.user_id = v_u);
    continue when not exists (select 1 from auth.users au where au.id = v_u);
    begin
      foreach v_mt in array array['movie','tv'] loop
        select uv.fingerprint, uv.computed_at into v_fp, v_at
          from public.mesa_user_vec uv where uv.user_id = v_u and uv.media_type = v_mt;
        if not found or v_fp is distinct from public.mesa_fingerprint(v_u) or v_at < now() - interval '3 days' then
          perform public.mesa_refresh_vec(v_u, v_mt);
        end if;
      end loop;
      perform public.mesa_draw_create(v_u, v_day, 'daily', 'all');
      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_err := v_err || jsonb_build_array(jsonb_build_object('user', v_u, 'error', left(sqlerrm, 300)));
    end;
  end loop;
  insert into public.mesa_meta (key, value, updated_at)
  values ('prepare_log', jsonb_build_object('at', now(), 'day', v_day, 'ok', v_ok, 'fail', v_fail,
                                            'errors', v_err, 'ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('ok', v_ok, 'fail', v_fail, 'ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $$;

-- Quem é aquecido de madrugada: humanos com tiragem nos últimos 14 dias ou
-- nota nos últimos 7.
create or replace function public.mesa_prepare_day()
returns jsonb language sql volatile security definer
set search_path = public, pg_temp as $$
  select public.mesa_prepare_day_for(array(
    select x.user_id from (
      select dr.user_id from public.mesa_draws dr where dr.day >= public.mesa_day() - 14
      union
      select um.user_id from public.user_movies um
       where um.rating is not null and coalesce(um.updated_at, um.created_at) >= now() - interval '7 days'
    ) x
    where not exists (select 1 from public.bot_accounts b where b.user_id = x.user_id)
    order by x.user_id))
$$;


-- ---------------------------------------------------------------------------
-- Tudo acima é interno.
revoke all on function public.mesa_day() from public, anon, authenticated;
revoke all on function public.mesa_live_event(date) from public, anon, authenticated;
revoke all on function public.mesa_pred_label(int) from public, anon, authenticated;
revoke all on function public.mesa_top3(uuid) from public, anon, authenticated;
revoke all on function public.mesa_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.mesa_refresh_vec(uuid, text) from public, anon, authenticated;
revoke all on function public.mesa_ensure_vec(uuid, text) from public, anon, authenticated;
revoke all on function public.mesa_ctx(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mesa_slot_candidates(uuid, uuid, text, int) from public, anon, authenticated;
revoke all on function public.mesa_recon_candidates(uuid, uuid, text, int) from public, anon, authenticated;
revoke all on function public.mesa_reasons(uuid, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.mesa_facts(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mesa_draw_create(uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.mesa_promote(uuid, text) from public, anon, authenticated;
revoke all on function public.mesa_me(uuid) from public, anon, authenticated;
revoke all on function public.mesa_cards_json(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.mesa_who_knows_best(uuid) from public, anon, authenticated;
revoke all on function public.mesa_payload(uuid) from public, anon, authenticated;
revoke all on function public.mesa_prepare_day_for(uuid[]) from public, anon, authenticated;
revoke all on function public.mesa_prepare_day() from public, anon, authenticated;
