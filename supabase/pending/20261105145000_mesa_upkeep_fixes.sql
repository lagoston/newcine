-- A Mesa dos Oráculos · correções do QA na construção do catálogo (WP-DB-FIX, 05/11/2026)
--
-- Só mesa_build_titles(), copiada de 20261105115000_mesa_upkeep.sql com três
-- mudanças nos CTEs do passo 4 (encaixe título × ocasião); o resto é idêntico:
--   M3  "season": a época aplica exclude_flags/exclude_moods da própria linha
--       (o Natal ganhou {heavy} e {dark-and-scary, drug-trip} no 140000);
--   M5  "plus": os overrides +1 respeitam age_max e exclude_flags da ocasião;
--   m9  "hallo": o Halloween respeita os vetos −1 de "susto" e tira os pesados.
-- A função apaga linhas (sempre com WHERE, só em tabelas mesa_*) como antes, e
-- por isso fica num arquivo à parte, aplicado com aprovação. Depois de aplicar:
-- select public.mesa_build_titles();

-- ---------------------------------------------------------------------------
-- A construção do catálogo (§5.3). Roda toda noite e quando catalog.dirty.
-- Em vez de esvaziar e reinserir, faz upsert do conjunto novo e apaga só as
-- linhas que saíram (com WHERE): o resultado é o mesmo do "apaga e reinsere",
-- sem janela vazia e sem reescrever 70 mil linhas toda noite. A versão só muda
-- quando o conjunto de títulos muda [escolha 05/11]: assim a reconstrução
-- noturna não invalida os vetores de todo mundo à toa; o envelhecimento de 3
-- dias cobre o resto.
create or replace function public.mesa_build_titles()
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_t0 timestamptz := clock_timestamp();
  c_bad text[] := array['based on novel or book','based on comic','duringcreditsstinger','aftercreditsstinger'];
  c_heavy text[] := array['rape','sexual abuse','incest','torture','child abuse','cannibalism','pedophilia',
                          'self-harm','sexual violence','extreme violence','gore'];
  c_heavy_fam text[];
  c_sad text[] := array['tragic','depressing','grief','loss of loved one','war','suicide'];
  v_n int; v_kw int; v_tkw int; v_occ int;
  v_hash text; v_old jsonb; v_version bigint; v_changed boolean;
  v_avail jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('mesa_build_titles'));
  c_heavy_fam := c_heavy || array['slasher','serial killer','drug addiction','suicide','sex','nudity','erotic',
                                  'supernatural horror','possession'];

  -- 1) Títulos (upsert; built_at = now() marca o que entrou nesta construção)
  insert into public.mesa_titles (media_type, tmdb_id, oracle, mood, year, decade, runtime, ep_runtime, total_min, seasons,
                                  ended, vote_count, vote_avg, pop_pct, countries, director_key, collection_id, coll_pos,
                                  genre_ids, kw, kwn, age, is_bw, is_anime, is_br, heavy, heavy_family, sad, ressalva,
                                  recog_rank, built_at)
  with st as (
    select distinct on (z.id, z.mt) z.id, z.mt, z.o, z.m
      from (
        select (x)::int as id, 'movie'::text as mt, rp.card_type as o, rp.mood_key as m
          from public.recommendation_pools rp
          cross join lateral jsonb_array_elements_text(coalesce(rp.movie_ids, '[]'::jsonb)) x
         where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart','fincher','cypher')
           and rp.mood_key in (select cm.mood_key from public.cine_moods cm) and x ~ '^[0-9]+$'
        union all
        select (x)::int, 'tv', rp.card_type, rp.mood_key
          from public.recommendation_pools rp
          cross join lateral jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)) x
         where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart','fincher','cypher')
           and rp.mood_key in (select cm.mood_key from public.cine_moods cm) and x ~ '^[0-9]+$'
      ) z
     order by z.id, z.mt, z.o, z.m
  ),
  b as (
    select st.mt, st.id, st.o, st.m, mc.release_date, mc.runtime as rt, mc.episode_run_time as ert,
           mc.number_of_episodes as neps, mc.number_of_seasons as nseas, mc.status, mc.director,
           coalesce(mc.vote_count, 0) as vc, mc.vote_average as va, coalesce(mc.origin_country, '{}'::text[]) as oc,
           mc.genres_en, mc.keywords, mc.content_ratings
      from st join public.movie_cache mc on mc.tmdb_id = st.id and mc.media_type = st.mt
  ),
  k as (
    select b.*,
           coalesce(kk.kw, '{}'::int[]) as kw, coalesce(kk.kwn, '{}'::text[]) as kwn,
           coalesce(gg.g, '{}'::int[]) as gids,
           coalesce(ag.br, ag.us) as age,
           case when b.mt = 'tv' then coalesce(nullif(b.ert, 0), nullif(b.rt, 0) / nullif(b.neps, 0)) end as eprt,
           col.collection_id, col.position as cpos,
           (rb.tmdb_id is not null) as boosted,
           coalesce(cf.ressalva, false) as ress
      from b
      left join lateral (
        select array_agg(distinct (e->>'id')::int) as kw, array_agg(distinct lower(e->>'name')) as kwn
          from jsonb_array_elements(case when jsonb_typeof(b.keywords) = 'array' then b.keywords else '[]'::jsonb end) e
         where (e->>'id') ~ '^[0-9]+$' and lower(coalesce(e->>'name', '')) <> all(c_bad)
      ) kk on true
      left join lateral (
        select array_agg(distinct (e->>'id')::int) as g
          from jsonb_array_elements(case when jsonb_typeof(b.genres_en) = 'array' then b.genres_en else '[]'::jsonb end) e
         where (e->>'id') ~ '^[0-9]+$'
      ) gg on true
      left join lateral (
        select max(case when e->>'iso_3166_1' = 'BR' then
                     case when e->>'certification' ~* 'livre' or btrim(e->>'certification') in ('L','e L') then 0
                          when (e->>'certification') ~ '[0-9]+' then substring(e->>'certification' from '([0-9]+)')::int end end) as br,
               max(case when e->>'iso_3166_1' = 'US' then
                     case upper(btrim(e->>'certification'))
                       when 'G' then 0 when 'TV-Y' then 0 when 'TV-G' then 0 when 'TV-Y7' then 7
                       when 'PG' then 10 when 'TV-PG' then 10 when 'PG-13' then 12 when 'TV-14' then 14
                       when 'R' then 16 when 'TV-MA' then 18 when 'NC-17' then 18 end end) as us
          from jsonb_array_elements(case when jsonb_typeof(b.content_ratings) = 'array' then b.content_ratings else '[]'::jsonb end) e
      ) ag on true
      left join lateral (
        select mcp.collection_id, mcp.position from public.movie_collection_parts mcp
         where b.mt = 'movie' and mcp.movie_id = b.id order by mcp.collection_id limit 1
      ) col on true
      left join public.mesa_recognition_boost rb on rb.media_type = b.mt and rb.tmdb_id = b.id
      left join public.mesa_comment_flags cf on cf.media_type = b.mt and cf.tmdb_id = b.id
  )
  select k.mt, k.id, k.o, k.m,
         extract(year from k.release_date)::smallint,
         (floor(extract(year from k.release_date) / 10) * 10)::smallint,
         case when k.mt = 'movie' then nullif(k.rt, 0) end::smallint,
         k.eprt::smallint,
         case when k.mt = 'tv' then k.eprt * k.neps end,
         case when k.mt = 'tv' then k.nseas end::smallint,
         case when k.mt = 'tv' then (coalesce(k.status, '') in ('Ended','Canceled') or 'miniseries' = any(k.kwn)) end,
         k.vc, k.va::real,
         (percent_rank() over (partition by k.o, k.mt order by k.vc))::real,
         k.oc,
         nullif(lower(btrim(coalesce(k.director, ''))), ''),
         k.collection_id, k.cpos::smallint,
         k.gids, k.kw, k.kwn, k.age::smallint,
         'black and white' = any(k.kwn), 'anime' = any(k.kwn), 'BR' = any(k.oc),
         k.kwn && c_heavy, k.kwn && c_heavy_fam, k.kwn && c_sad,
         k.ress,
         case when k.mt <> 'movie' then null
              when k.boosted then 0
              else (row_number() over (partition by k.o, k.m, k.mt order by k.vc desc, k.id))::smallint end,
         now()
    from k
  on conflict (media_type, tmdb_id) do update set
    oracle = excluded.oracle, mood = excluded.mood, year = excluded.year, decade = excluded.decade,
    runtime = excluded.runtime, ep_runtime = excluded.ep_runtime, total_min = excluded.total_min, seasons = excluded.seasons,
    ended = excluded.ended, vote_count = excluded.vote_count, vote_avg = excluded.vote_avg, pop_pct = excluded.pop_pct,
    countries = excluded.countries, director_key = excluded.director_key, collection_id = excluded.collection_id,
    coll_pos = excluded.coll_pos, genre_ids = excluded.genre_ids, kw = excluded.kw, kwn = excluded.kwn, age = excluded.age,
    is_bw = excluded.is_bw, is_anime = excluded.is_anime, is_br = excluded.is_br, heavy = excluded.heavy,
    heavy_family = excluded.heavy_family, sad = excluded.sad, ressalva = excluded.ressalva,
    recog_rank = excluded.recog_rank, built_at = excluded.built_at;
  get diagnostics v_n = row_count;
  -- os títulos que saíram das prateleiras (não foram tocados nesta construção)
  delete from public.mesa_titles t where t.built_at < now();

  -- 2) Glossário: df/idf de todas as palavras do acervo. Nunca toca em
  --    rótulos, kind, tema nem nas marcas (são do WP-CURA).
  with pairs as (
    select distinct t.media_type, t.tmdb_id, (e->>'id')::int as kw_id, lower(e->>'name') as nm
      from public.mesa_titles t
      join public.movie_cache mc on mc.tmdb_id = t.tmdb_id and mc.media_type = t.media_type
      cross join lateral jsonb_array_elements(case when jsonb_typeof(mc.keywords) = 'array' then mc.keywords else '[]'::jsonb end) e
     where (e->>'id') ~ '^[0-9]+$' and lower(coalesce(e->>'name', '')) <> all(c_bad)
  ),
  agg as (
    select kw_id, min(nm) as name_en, count(*) as df from pairs group by kw_id
  )
  insert into public.mesa_kw as mk (kw_id, name_en, df, idf)
  select agg.kw_id, coalesce(agg.name_en, ''), agg.df, ln(greatest(v_n, 1)::float / agg.df)::real from agg
  on conflict (kw_id) do update set name_en = excluded.name_en, df = excluded.df, idf = excluded.idf;
  get diagnostics v_kw = row_count;

  with cur as (select distinct x as kw_id from public.mesa_titles t cross join lateral unnest(t.kw) x)
  update public.mesa_kw mk set df = 0, idf = 0
   where mk.df <> 0 and not exists (select 1 from cur where cur.kw_id = mk.kw_id);

  -- 3) Índice invertido das palavras específicas (2 ≤ df ≤ 400): o conjunto
  --    novo entra, os pares que saíram são apagados.
  with fresh as materialized (
    select distinct x as kw_id, t.media_type, t.tmdb_id
      from public.mesa_titles t
      cross join lateral unnest(t.kw) x
      join public.mesa_kw mk on mk.kw_id = x
     where mk.df between 2 and 400
  ),
  gone as (
    delete from public.mesa_title_kw tk
     where not exists (select 1 from fresh f where f.kw_id = tk.kw_id and f.media_type = tk.media_type and f.tmdb_id = tk.tmdb_id)
    returning 1
  ),
  added as (
    insert into public.mesa_title_kw (kw_id, media_type, tmdb_id)
    select f.kw_id, f.media_type, f.tmdb_id from fresh f
    on conflict (kw_id, media_type, tmdb_id) do nothing
    returning 1
  )
  select (select count(*) from fresh) into v_tkw;

  -- 4) Encaixe título × ocasião (§4.1). As ocasiões vêm do seed do WP-CURA;
  --    sem seed, a tabela fica vazia e a Mesa mostra "sem ocasiões".
  --    Um só comando: regra + épocas + overrides +1, menos os −1; o que saiu
  --    é apagado e o resto entra por upsert.
  with
  rule as materialized (
  select o.key, t.media_type as mt, t.tmdb_id as id, least(1, f.fit)::real as fit
    from public.mesa_occasions o
    cross join public.mesa_titles t
    left join public.mesa_comment_flags cf on cf.media_type = t.media_type and cf.tmdb_id = t.tmdb_id
    cross join lateral (
      select
        (case
           when o.mood_w ? '*' then coalesce((o.mood_w->>'*')::float, 1)
           when o.require_mood_or_genre is not null
                and not (t.mood in (select jsonb_array_elements_text(coalesce(o.require_mood_or_genre->'moods', '[]'::jsonb))))
             then coalesce((o.require_mood_or_genre->>'genre_weight')::float, 0.5)
           else coalesce((o.mood_w->>t.mood)::float, 0)
         end)
        + 0.25 * least(2, (select count(*) from unnest(o.tones_plus) tp where tp = any(t.kwn)))
        + (case when o.comment_signal is not null and o.comment_signal = any(coalesce(cf.signals, '{}'::text[])) then 0.40 else 0 end)
        - (case when (t.kwn && o.tones_minus)
                  or ('triste' = any(o.tones_minus) and t.sad)
                  or ('pesado' = any(o.tones_minus) and t.heavy) then 0.35 else 0 end)
        as fit
    ) f
   where o.is_active and o.season_event is null
     and (o.media is null or t.media_type = o.media)
     and (t.media_type <> 'movie' or ((o.rt_min is null or t.runtime >= o.rt_min) and (o.rt_max is null or t.runtime <= o.rt_max)))
     and (t.media_type <> 'tv' or o.ep_max is null or t.ep_runtime <= o.ep_max)
     and (t.media_type <> 'tv' or o.total_min is null or t.total_min >= o.total_min)
     and (t.media_type <> 'tv' or o.total_max is null or t.total_min <= o.total_max)
     and (not o.ended_only or (t.media_type = 'tv' and coalesce(t.ended, false)))
     and t.vote_count >= coalesce(case when t.oracle = 'cypher' then coalesce(o.vc_min_cypher, o.vc_min) else o.vc_min end, 0)
     and (o.va_min is null or t.vote_avg >= o.va_min)
     and (o.age_max is null or t.age is null or t.age <= o.age_max)
     and not (t.mood = any(o.exclude_moods))
     and (o.require_mood_or_genre is null
          or t.mood in (select jsonb_array_elements_text(coalesce(o.require_mood_or_genre->'moods', '[]'::jsonb)))
          or t.genre_ids && coalesce((select array_agg(g::int) from jsonb_array_elements_text(coalesce(o.require_mood_or_genre->'genres', '[]'::jsonb)) g
                                      where g ~ '^[0-9]+$'), '{}'::int[]))
     and not ('heavy' = any(o.exclude_flags) and t.heavy)
     and not ('heavy_family' = any(o.exclude_flags) and t.heavy_family)
     and not ('sad' = any(o.exclude_flags) and t.sad)
     and f.fit >= 0.5
  ),
  -- Épocas: a palavra do evento + as listas do evento.
  season as (
  select o.key, t.media_type as mt, t.tmdb_id as id, 1::real as fit
    from public.mesa_occasions o
    join public.mesa_titles t
      on o.season_event = any(t.kwn)
      or (t.media_type = 'movie' and t.tmdb_id in (
            select (x)::int
              from public.seasonal_events e
              cross join lateral jsonb_array_elements(coalesce(e.movie_ids, '[]'::jsonb) || coalesce(e.movie_lists, '[]'::jsonb)) el
              cross join lateral jsonb_array_elements_text(case when jsonb_typeof(el) = 'array' then el else jsonb_build_array(el) end) x
             where e.id = o.season_event and x ~ '^[0-9]+$'))
   where o.is_active and o.season_event is not null
     -- M3 (05/11/2026): a época aplica as exclusões da própria linha, como a
     -- regra: no Natal (exclude_flags {heavy}, exclude_moods {dark-and-scary,
     -- drug-trip}) não entram mais A Caça, Elle, Terrifier 3, Noite do Terror…
     -- As exceções curadas (Gremlins) entram pelos +1 do "plus".
     and not (t.mood = any(o.exclude_moods))
     and not ('heavy' = any(o.exclude_flags) and t.heavy)
     and not ('heavy_family' = any(o.exclude_flags) and t.heavy_family)
     and not ('sad' = any(o.exclude_flags) and t.sad)
  ),
  -- No Halloween, também os títulos de Sombrio com encaixe em "susto".
  hallo as (
  select o.key, r.mt, r.id, r.fit
    from public.mesa_occasions o
    join rule r on r.key = 'susto'
    join public.mesa_titles t on t.media_type = r.mt and t.tmdb_id = r.id and t.mood = 'dark-and-scary'
   where o.is_active and o.season_event = 'halloween'
     -- m9 (05/11/2026): a regra de "susto" roda antes dos vetos −1 de "susto";
     -- sem isto A Serbian Film, Salò, Nekromantik e Holocausto Canibal entravam
     -- no Halloween. Os títulos pesados também ficam de fora.
     and not t.heavy
     and not exists (select 1 from public.mesa_occasion_overrides ov
                      where ov.occasion_key = 'susto' and ov.media_type = r.mt and ov.tmdb_id = r.id and ov.sign = -1)
  ),
  -- Overrides +1 (comentário confirmado ou curadoria): encaixe 1, respeitando a
  -- mídia própria da ocasião.
  plus as (
  select ov.occasion_key as key, ov.media_type as mt, ov.tmdb_id as id, 1::real as fit, ov.source
    from public.mesa_occasion_overrides ov
    join public.mesa_occasions o on o.key = ov.occasion_key and o.is_active
    join public.mesa_titles t on t.media_type = ov.media_type and t.tmdb_id = ov.tmdb_id
   where ov.sign = 1 and (o.media is null or t.media_type = o.media)
     -- M5 (05/11/2026): o +1 acrescenta, mas nunca passa por cima da segurança
     -- da ocasião: idade máxima e marcas excluídas (heavy, heavy_family, sad)
     -- valem também para ele. Em "Domingo em família" saem FNAF (heavy_family),
     -- Wandinha (16), Big Time Rush, Enola Holmes 3 e Os Goldbergs (14).
     -- O humor excluído (exclude_moods) é tom, não segurança: é justamente o
     -- que o +1 curado corrige (Goosebumps e A Hora do Arrepio, livres até 10
     -- anos, na família; Gremlins no Natal), e por isso não vale aqui.
     and (o.age_max is null or t.age is null or t.age <= o.age_max)
     and not ('heavy' = any(o.exclude_flags) and t.heavy)
     and not ('heavy_family' = any(o.exclude_flags) and t.heavy_family)
     and not ('sad' = any(o.exclude_flags) and t.sad)
  ),
  fresh as materialized (
  select u.key, u.mt, u.id, max(u.fit) as fit,
         coalesce(max(u.source) filter (where u.source <> 'regra'), 'regra') as source
    from (
      select rule.key, rule.mt, rule.id, rule.fit, 'regra'::text as source from rule
      union all select season.key, season.mt, season.id, season.fit, 'regra' from season
      union all select hallo.key, hallo.mt, hallo.id, hallo.fit, 'regra' from hallo
      union all select plus.key, plus.mt, plus.id, plus.fit, plus.source from plus
    ) u
   where not exists (select 1 from public.mesa_occasion_overrides ov
                      where ov.occasion_key = u.key and ov.media_type = u.mt and ov.tmdb_id = u.id and ov.sign = -1)
   group by u.key, u.mt, u.id
  ),
  gone as (
    delete from public.mesa_title_occasions mto
     where not exists (select 1 from fresh f where f.key = mto.occasion_key and f.mt = mto.media_type and f.id = mto.tmdb_id)
    returning 1
  ),
  added as (
    insert into public.mesa_title_occasions (occasion_key, media_type, tmdb_id, fit, source)
    select f.key, f.mt, f.id, f.fit, f.source from fresh f
    on conflict (occasion_key, media_type, tmdb_id) do update set fit = excluded.fit, source = excluded.source
    returning 1
  )
  select (select count(*) from fresh) into v_occ;

  -- 5) Metadados: disponibilidade (≥ 30 por oráculo participante, na mídia em
  --    que a ocasião vale; sem mídia própria, conta filmes) e a versão.
  select coalesce(jsonb_object_agg(o.key, jsonb_build_object(
           'movie', jsonb_build_object('bogart', coalesce(cn.bm, 0), 'fincher', coalesce(cn.fm, 0), 'cypher', coalesce(cn.cm, 0)),
           'tv',    jsonb_build_object('bogart', coalesce(cn.bt, 0), 'fincher', coalesce(cn.ft, 0), 'cypher', coalesce(cn.ct, 0)),
           'available', (
             select coalesce(bool_and(case coalesce(o.media, 'movie')
                                       when 'movie' then case s.seat when 'bogart' then coalesce(cn.bm, 0) when 'fincher' then coalesce(cn.fm, 0) else coalesce(cn.cm, 0) end
                                       else case s.seat when 'bogart' then coalesce(cn.bt, 0) when 'fincher' then coalesce(cn.ft, 0) else coalesce(cn.ct, 0) end
                                     end >= 30), false)
               from unnest(array['bogart','fincher','cypher']) as s(seat)
              where not (s.seat = any(o.pass_oracles))))), '{}'::jsonb)
    into v_avail
    from public.mesa_occasions o
    left join (
      select mto.occasion_key,
             count(*) filter (where t.oracle = 'bogart'  and t.media_type = 'movie') as bm,
             count(*) filter (where t.oracle = 'fincher' and t.media_type = 'movie') as fm,
             count(*) filter (where t.oracle = 'cypher'  and t.media_type = 'movie') as cm,
             count(*) filter (where t.oracle = 'bogart'  and t.media_type = 'tv') as bt,
             count(*) filter (where t.oracle = 'fincher' and t.media_type = 'tv') as ft,
             count(*) filter (where t.oracle = 'cypher'  and t.media_type = 'tv') as ct
        from public.mesa_title_occasions mto
        join public.mesa_titles t on t.media_type = mto.media_type and t.tmdb_id = mto.tmdb_id
       group by mto.occasion_key
    ) cn on cn.occasion_key = o.key
   where o.is_active;

  insert into public.mesa_meta (key, value, updated_at) values ('occasion_availability', v_avail, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  select md5(coalesce(string_agg(t.media_type || ':' || t.tmdb_id || ':' || t.oracle || ':' || t.mood, ',' order by t.media_type, t.tmdb_id), ''))
    into v_hash from public.mesa_titles t;
  select m.value into v_old from public.mesa_meta m where m.key = 'catalog';
  v_changed := v_old is null or coalesce(v_old->>'hash', '') <> v_hash or coalesce((v_old->>'version')::bigint, 0) = 0;
  v_version := case when v_changed then extract(epoch from now())::bigint else (v_old->>'version')::bigint end;

  insert into public.mesa_meta (key, value, updated_at)
  values ('catalog', jsonb_build_object('version', v_version, 'dirty', false, 'built_at', now(), 'hash', v_hash,
                                        'titles', v_n, 'ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return jsonb_build_object('titles', v_n, 'kw', v_kw, 'title_kw', v_tkw, 'title_occasions', v_occ,
                            'version', v_version, 'changed', v_changed,
                            'ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $$;

revoke all on function public.mesa_build_titles() from public, anon, authenticated;
