-- 18/11/2026 — Protocolo Reborn, onda 1 do banco (achado A1 de
-- claude/otimizacao/banco.md, parte 2 de 2: as funções de previsão).
--
-- predict_ratings (e o predict_ratings_v4, que só a chama) e
-- predict_ratings_outside: 30% de todo o tempo do banco desde 24/11/2025;
-- 4,9 s para prever 20 títulos; get_title_prediction (a nota prevista ao
-- abrir um filme) 0,7–3,6 s; predict-watchlist-ratings 3 s; match-movie 6 s.
--
-- A fórmula não muda (nem um coeficiente). Mudam só de onde vêm os dados:
--   • nota/votos do público, diretor e palavras-chave: title_features (linha
--     estreita, palavras já filtradas) em vez do movie_cache e do JSON;
--   • o df do IDF: keyword_df (pronto) em vez de abrir o JSON de ~8,4 mil
--     filmes a cada chamada (2,5 s);
--   • a prateleira e o humor de cada título: pool_titles em vez de desmontar
--     recommendation_pools;
--   • o termo de comunidade só é somado para os títulos que entram na conta
--     (o histórico da pessoa e os pedidos), não para o catálogo inteiro;
--   • kdf e as prateleiras ficam MATERIALIZED, para o planejador não montar
--     laços aninhados sobre estimativas erradas.
-- As três tabelas são mantidas por gatilho (síncrono), então o resultado é o
-- mesmo de antes, número por número (o ensaio compara as duas versões lado a
-- lado: diferença máxima < 1e-6).
--
-- Padrão de reescrita: a definição vem do banco (pg_get_functiondef) e cada
-- trecho trocado precisa aparecer exatamente o número de vezes esperado; se
-- alguém tiver mexido na função, a migração para com erro em vez de aplicar
-- por cima.

create or replace function pg_temp.swap_n(p_def text, p_old text, p_new text, p_times integer, p_label text)
returns text
language plpgsql
as $f$
begin
  if (length(p_def) - length(replace(p_def, p_old, ''))) / length(p_old) <> p_times then
    raise exception '%: o trecho não aparece % vez(es)', p_label, p_times;
  end if;
  return replace(p_def, p_old, p_new);
end;
$f$;

-- trechos comuns às duas funções
create or replace function pg_temp.swap_common(p_def text, p_label text)
returns text
language plpgsql
as $f$
declare
  v text := p_def;
begin
  -- a nota do público de cada título avaliado
  v := pg_temp.swap_n(v,
$s$  join movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
$s$,
$s$  join title_features mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
$s$, 1, p_label || ' allr');

  -- o humor de cada filme de prateleira
  v := pg_temp.swap_n(v,
$s$pool_movie as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.movie_ids) x
  where rp.mood_key <> 'random-surprise'
),
$s$,
$s$pool_movie as materialized (
  select distinct on (pt.tmdb_id) pt.tmdb_id m, pt.mood_key
  from pool_titles pt
  where pt.media_type = 'movie' and pt.mood_key <> 'random-surprise'
  order by pt.tmdb_id, pt.mood_key
),
$s$, 1, p_label || ' pool_movie');

  -- as palavras-chave (histórico e pedidos): já filtradas em title_features
  v := pg_temp.swap_n(v,
$s$         coalesce((select array_agg(distinct (k->>'id')::int) from jsonb_array_elements(coalesce(mc.keywords, '[]'::jsonb)) k
                   where lower(k->>'name') not in (select name from bad_kw)), '{}') kws
$s$,
$s$         mc.kw_ids kws
$s$, 2, p_label || ' kws');

  -- o histórico de filmes da pessoa
  v := pg_temp.swap_n(v,
$s$  join movie_cache mc on mc.tmdb_id = a.m and mc.media_type = 'movie'
$s$,
$s$  join title_features mc on mc.tmdb_id = a.m and mc.media_type = 'movie'
$s$, 1, p_label || ' h');

  -- o df de cada palavra: pronto em keyword_df
  v := pg_temp.swap_n(v,
$s$kdf_raw as (
  select (kk->>'id')::int v, count(distinct mc2.tmdb_id) df
  from movie_cache mc2
  cross join lateral jsonb_array_elements(coalesce(mc2.keywords, '[]'::jsonb)) kk
  join kw_needed kn on kn.k = (kk->>'id')::int
  where mc2.media_type = 'movie'
  group by 1
),
kdf as (
$s$,
$s$kdf_raw as (
  select kd.kw_id v, kd.df
  from keyword_df kd
  join kw_needed kn on kn.k = kd.kw_id
),
kdf as materialized (
$s$, 1, p_label || ' kdf');

  -- comunidade: só os títulos que entram na conta
  v := pg_temp.swap_n(v,
$s$  where a.u <> p_user_id
    and not exists (select 1 from bot_accounts b where b.user_id = a.u)
  group by a.m, a.mt
$s$,
$s$  where a.u <> p_user_id
    and not exists (select 1 from bot_accounts b where b.user_id = a.u)
    and (a.m in (select h.m from h) or a.m in (select c.cid from c))
  group by a.m, a.mt
$s$, 1, p_label || ' comm');

  return v;
end;
$f$;

-- predict_ratings (o predict_ratings_v4 só repassa para ela)
do $do$
declare
  v_def text := pg_get_functiondef('public.predict_ratings(uuid,text,integer[],integer)'::regprocedure);
begin
  if position('title_features' in v_def) > 0 then
    raise exception 'predict_ratings: já usa title_features';
  end if;

  v_def := pg_temp.swap_common(v_def, 'predict_ratings');

  v_def := pg_temp.swap_n(v_def,
$s$pool_tv as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.tv_ids) x
  where rp.mood_key <> 'random-surprise'
),
$s$,
$s$pool_tv as materialized (
  select distinct on (pt.tmdb_id) pt.tmdb_id m, pt.mood_key
  from pool_titles pt
  where pt.media_type = 'tv' and pt.mood_key <> 'random-surprise'
  order by pt.tmdb_id, pt.mood_key
),
$s$, 1, 'predict_ratings pool_tv');

  v_def := pg_temp.swap_n(v_def,
$s$  from movie_cache mc
  left join pool_movie pm on pm.m = mc.tmdb_id and p_media_type = 'movie'
$s$,
$s$  from title_features mc
  left join pool_movie pm on pm.m = mc.tmdb_id and p_media_type = 'movie'
$s$, 1, 'predict_ratings c');

  if position('movie_cache mc' in v_def) > 0 or position('recommendation_pools' in v_def) > 0 then
    raise exception 'predict_ratings: sobrou leitura do movie_cache/recommendation_pools fora do ndocs';
  end if;

  execute v_def;
end;
$do$;

-- predict_ratings_outside (filmes de fora das prateleiras)
do $do$
declare
  v_def text := pg_get_functiondef('public.predict_ratings_outside(uuid,integer[],integer)'::regprocedure);
begin
  if position('title_features' in v_def) > 0 then
    raise exception 'predict_ratings_outside: já usa title_features';
  end if;

  v_def := pg_temp.swap_common(v_def, 'predict_ratings_outside');

  v_def := pg_temp.swap_n(v_def,
$s$  from movie_cache mc
  where mc.media_type = 'movie' and mc.tmdb_id = any(p_ids)
$s$,
$s$  from title_features mc
  where mc.media_type = 'movie' and mc.tmdb_id = any(p_ids)
$s$, 1, 'predict_ratings_outside c');

  if position('movie_cache mc' in v_def) > 0 or position('recommendation_pools' in v_def) > 0 then
    raise exception 'predict_ratings_outside: sobrou leitura do movie_cache/recommendation_pools fora do ndocs';
  end if;

  execute v_def;
end;
$do$;
