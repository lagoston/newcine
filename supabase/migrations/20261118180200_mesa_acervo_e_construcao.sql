-- 18/11/2026 — Protocolo Reborn, onda 2 do banco (achado A9 de
-- claude/otimizacao/banco.md: a Mesa dos Oráculos).
--
-- O que a medição mostrou (18/11, pg_stat_statements com track = all, dentro
-- de begin/rollback), diferente do palpite da auditoria:
--   • os "tons exibíveis" de mesa_reasons custam 0,14 ms por título (4 ms por
--     página de 30 do Acervo): já usam o índice de mesa_kw. Uma tabela nova
--     de tons pré-calculados não se paga — NÃO foi feita. As 185 mil
--     varreduras de mesa_kw vêm do "skw" (uma por chamada, ~1,5 ms);
--   • o que pesa em mesa_acervo2 (85–177 ms por página, quente) é a escolha
--     da página: o vetor da pessoa (5.197 previsões) era comparado linha a
--     linha com cada título da prateleira — 1,26 milhão de comparações
--     descartadas no plano (laço aninhado sobre o vetor inteiro), ~54 ms.
--
-- 1) mesa_acervo2: o vetor é aberto só nos títulos da prateleira pedida
--    (u.id = any(v_ids)). Os outros nunca casavam com nada: mesma resposta
--    (o ensaio compara o JSON inteiro, por conta e por prateleira).
--
-- 2) mesa_build_titles (cron das 06:20 UTC): gravava todo dia as ~6,5 mil
--    linhas de mesa_titles, as ~16 mil de mesa_kw e as ~7,5 mil de
--    mesa_title_occasions mesmo sem mudança (116 mil, 287 mil e 135 mil
--    UPDATEs em 13 dias; tabelas inchando). Agora cada UPDATE só acontece
--    quando algum valor muda:
--      • mesa_titles: o conjunto novo vira uma CTE (novo); o upsert tem WHERE
--        "algo mudou"; quem saiu das prateleiras é apagado por "não está em
--        novo" (antes: built_at < now(), o que obrigava a tocar em todas as
--        linhas). built_at passa a ser "a última vez que a linha mudou" —
--        ninguém mais lê essa coluna (conferido nas funções e no app);
--      • mesa_kw e mesa_title_occasions: WHERE "algo mudou" no upsert.
--    As contagens devolvidas (titles, kw, title_occasions) continuam sendo o
--    tamanho do conjunto novo, como antes.
--
-- Padrão: definição vinda do banco, troca de trechos conferidos.

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

-- 1) mesa_acervo2
do $do$
declare
  v_def text := pg_get_functiondef('public.mesa_acervo2(text,text,text,text,integer,integer)'::regprocedure);
begin
  if position('u.id = any(v_ids)' in v_def) > 0 then
    raise exception 'mesa_acervo2: o vetor já é aberto só na prateleira';
  end if;

  v_def := pg_temp.swap_n(v_def,
$s$      cross join lateral unnest(uv.ids, uv.mu, uv.pr) as u(id, mu, pr)
     where uv.user_id = v_uid and uv.media_type = v_media
  ),
$s$,
$s$      cross join lateral unnest(uv.ids, uv.mu, uv.pr) as u(id, mu, pr)
     where uv.user_id = v_uid and uv.media_type = v_media
       -- 18/11/2026 (Reborn): só as previsões dos títulos desta prateleira; o
       -- vetor inteiro (5 mil) era comparado com cada título, um por um
       and u.id = any(v_ids)
  ),
$s$, 1, 'mesa_acervo2 vec');

  execute v_def;
end;
$do$;

-- 2) mesa_build_titles
do $do$
declare
  v_def text := pg_get_functiondef('public.mesa_build_titles()'::regprocedure);
begin
  if position('novo as materialized' in v_def) > 0 then
    raise exception 'mesa_build_titles: já grava só o que mudou';
  end if;

  -- mesa_titles: o INSERT sai da frente das CTEs…
  v_def := pg_temp.swap_n(v_def,
$s$  insert into public.mesa_titles (media_type, tmdb_id, oracle, mood, year, decade, runtime, ep_runtime, total_min, seasons,
                                  ended, vote_count, vote_avg, pop_pct, countries, director_key, collection_id, coll_pos,
                                  genre_ids, kw, kwn, age, is_bw, is_anime, is_br, heavy, heavy_family, sad, ressalva,
                                  recog_rank, built_at)
  with st as (
$s$,
$s$  -- 18/11/2026 (Reborn): o conjunto novo vira a CTE "novo"; só é gravada a
  -- linha que mudou, e sai quem não está em "novo"
  with st as (
$s$, 1, 'mesa_build_titles cabeça');

  -- …o SELECT final vira a CTE "novo"…
  v_def := pg_temp.swap_n(v_def,
$s$  select k.mt, k.id, k.o, k.m,
         extract(year from k.release_date)::smallint,
$s$,
$s$  , novo as materialized (
  select k.mt, k.id, k.o, k.m,
         extract(year from k.release_date)::smallint,
$s$, 1, 'mesa_build_titles novo');

  -- …o upsert lê de "novo"…
  v_def := pg_temp.swap_n(v_def,
$s$         now()
    from k
  on conflict (media_type, tmdb_id) do update set
$s$,
$s$         now()
    from k
  ),
  gravados as (
  insert into public.mesa_titles (media_type, tmdb_id, oracle, mood, year, decade, runtime, ep_runtime, total_min, seasons,
                                  ended, vote_count, vote_avg, pop_pct, countries, director_key, collection_id, coll_pos,
                                  genre_ids, kw, kwn, age, is_bw, is_anime, is_br, heavy, heavy_family, sad, ressalva,
                                  recog_rank, built_at)
  select * from novo
  on conflict (media_type, tmdb_id) do update set
$s$, 1, 'mesa_build_titles upsert');

  -- …só quando algo mudou; e quem saiu é apagado por não estar em "novo"
  v_def := pg_temp.swap_n(v_def,
$s$    recog_rank = excluded.recog_rank, built_at = excluded.built_at;
  get diagnostics v_n = row_count;
  -- os títulos que saíram das prateleiras (não foram tocados nesta construção)
  delete from public.mesa_titles t where t.built_at < now();
$s$,
$s$    recog_rank = excluded.recog_rank, built_at = excluded.built_at
    where (mesa_titles.oracle, mesa_titles.mood, mesa_titles.year, mesa_titles.decade, mesa_titles.runtime,
           mesa_titles.ep_runtime, mesa_titles.total_min, mesa_titles.seasons, mesa_titles.ended, mesa_titles.vote_count,
           mesa_titles.vote_avg, mesa_titles.pop_pct, mesa_titles.countries, mesa_titles.director_key,
           mesa_titles.collection_id, mesa_titles.coll_pos, mesa_titles.genre_ids, mesa_titles.kw, mesa_titles.kwn,
           mesa_titles.age, mesa_titles.is_bw, mesa_titles.is_anime, mesa_titles.is_br, mesa_titles.heavy,
           mesa_titles.heavy_family, mesa_titles.sad, mesa_titles.ressalva, mesa_titles.recog_rank)
          is distinct from
          (excluded.oracle, excluded.mood, excluded.year, excluded.decade, excluded.runtime,
           excluded.ep_runtime, excluded.total_min, excluded.seasons, excluded.ended, excluded.vote_count,
           excluded.vote_avg, excluded.pop_pct, excluded.countries, excluded.director_key,
           excluded.collection_id, excluded.coll_pos, excluded.genre_ids, excluded.kw, excluded.kwn,
           excluded.age, excluded.is_bw, excluded.is_anime, excluded.is_br, excluded.heavy,
           excluded.heavy_family, excluded.sad, excluded.ressalva, excluded.recog_rank)
  returning 1
  ),
  -- os títulos que saíram das prateleiras
  sairam as (
    delete from public.mesa_titles t
     where not exists (select 1 from novo n where n.mt = t.media_type and n.id = t.tmdb_id)
    returning 1
  )
  select count(*) into v_n from novo;
$s$, 1, 'mesa_build_titles mudou');

  -- mesa_kw: só as palavras cujo nome, df ou idf mudou
  v_def := pg_temp.swap_n(v_def,
$s$  insert into public.mesa_kw as mk (kw_id, name_en, df, idf)
  select agg.kw_id, coalesce(agg.name_en, ''), agg.df, ln(greatest(v_n, 1)::float / agg.df)::real from agg
  on conflict (kw_id) do update set name_en = excluded.name_en, df = excluded.df, idf = excluded.idf;
  get diagnostics v_kw = row_count;
$s$,
$s$  , gravadas as (
  insert into public.mesa_kw as mk (kw_id, name_en, df, idf)
  select agg.kw_id, coalesce(agg.name_en, ''), agg.df, ln(greatest(v_n, 1)::float / agg.df)::real from agg
  on conflict (kw_id) do update set name_en = excluded.name_en, df = excluded.df, idf = excluded.idf
    -- 18/11/2026 (Reborn): só a palavra que mudou
    where (mk.name_en, mk.df, mk.idf) is distinct from (excluded.name_en, excluded.df, excluded.idf)
  returning 1
  )
  select count(*) into v_kw from agg;
$s$, 1, 'mesa_build_titles mesa_kw');

  -- mesa_title_occasions: só o encaixe que mudou
  v_def := pg_temp.swap_n(v_def,
$s$    on conflict (occasion_key, media_type, tmdb_id) do update set fit = excluded.fit, source = excluded.source
    returning 1
$s$,
$s$    on conflict (occasion_key, media_type, tmdb_id) do update set fit = excluded.fit, source = excluded.source
      -- 18/11/2026 (Reborn): só o encaixe que mudou
      where (mesa_title_occasions.fit, mesa_title_occasions.source) is distinct from (excluded.fit, excluded.source)
    returning 1
$s$, 1, 'mesa_build_titles ocasiões');

  execute v_def;
end;
$do$;
