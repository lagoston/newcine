-- 18/11/2026 — Protocolo Reborn, onda 1 do banco (achado A1 de
-- claude/otimizacao/banco.md, parte 1 de 2: as tabelas de apoio).
--
-- predict_ratings e predict_ratings_outside somavam 30% de todo o tempo do
-- banco desde 24/11/2025: 4,9 s para prever 20 títulos, 0,7–3,6 s para abrir
-- um filme. O grosso não dependia de quem pede:
--   • o IDF das palavras-chave abria o JSON `keywords` dos ~8,4 mil filmes do
--     movie_cache (98.840 entradas) a cada chamada: 2,5 s sozinho;
--   • o termo de comunidade e o viés de cada pessoa juntavam todas as notas
--     do site com o movie_cache inteiro (linhas largas, ~7,4 KB cada) só para
--     pegar a nota do público.
--
-- Duas tabelas de apoio, mantidas por gatilho no movie_cache (síncrono, então
-- sempre iguais ao movie_cache e a previsão continua exata):
--   • title_features: por título, só o que a previsão usa — nota e votos do
--     público, diretor e as palavras-chave já filtradas (sem as 4 genéricas:
--     'based on novel or book', 'based on comic', 'duringcreditsstinger',
--     'aftercreditsstinger'), como int[]. Linha estreita: a junção com
--     user_movies vira um hash join pequeno.
--   • keyword_df: em quantos filmes do movie_cache cada palavra-chave aparece
--     (o df do IDF), contando todas as palavras, exatamente como o kdf_raw
--     antigo. Atualizada pela diferença (+1/−1) a cada título que entra, sai
--     ou muda de palavras.
--
-- Os gatilhos são por comando (FOR EACH STATEMENT, com as tabelas de
-- transição), então a cache-title, que grava 25 títulos de uma vez, paga uma
-- vez só. A atualização de keyword_df pega um advisory lock da transação
-- (só quando alguma palavra muda de fato), para duas gravações simultâneas
-- nunca se travarem uma à outra.
--
-- Nenhuma tela lê essas tabelas: só as funções de previsão (SECURITY
-- DEFINER). RLS ligada e sem política; anon e authenticated sem acesso.

create table if not exists public.title_features (
  tmdb_id      integer not null,
  media_type   text    not null,
  vote_average numeric,
  vote_count   integer,
  director     text,
  kw_ids       integer[] not null default '{}',
  primary key (tmdb_id, media_type)
);

comment on table public.title_features is
  '18/11/2026: o que predict_ratings usa de cada título do movie_cache (nota e votos do público, diretor, palavras-chave filtradas). Mantida pelos gatilhos title_features_sync_*; não gravar direto.';

create table if not exists public.keyword_df (
  kw_id integer primary key,
  df    integer not null
);

comment on table public.keyword_df is
  '18/11/2026: em quantos filmes (media_type = movie) do movie_cache cada palavra-chave aparece. Mantida pelos gatilhos title_features_sync_*; não gravar direto.';

alter table public.title_features enable row level security;
alter table public.keyword_df enable row level security;
revoke all on public.title_features from anon, authenticated;
revoke all on public.keyword_df from anon, authenticated;

-- As palavras-chave de um título, do jeito que a previsão sempre filtrou
-- (array_agg distinct dos ids cujo nome não é uma das 4 genéricas; sem nome
-- também fica de fora, como no lower(null) not in (...) de antes).
create or replace function public.title_kw_ids(p_keywords jsonb)
returns integer[]
language sql
immutable
parallel safe
as $function$
  select coalesce(array_agg(distinct (k->>'id')::int), '{}')
    from jsonb_array_elements(case when jsonb_typeof(p_keywords) = 'array' then p_keywords else '[]'::jsonb end) k
   where lower(k->>'name') not in ('based on novel or book', 'based on comic', 'duringcreditsstinger', 'aftercreditsstinger')
     and (k->>'id') ~ '^[0-9]+$'
$function$;

-- Todas as palavras de um filme (sem filtro), para o df.
create or replace function public.title_kw_all(p_keywords jsonb)
returns integer[]
language sql
immutable
parallel safe
as $function$
  select coalesce(array_agg(distinct (k->>'id')::int), '{}')
    from jsonb_array_elements(case when jsonb_typeof(p_keywords) = 'array' then p_keywords else '[]'::jsonb end) k
   where (k->>'id') ~ '^[0-9]+$'
$function$;

create or replace function public.sync_title_features()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.title_features as tf (tmdb_id, media_type, vote_average, vote_count, director, kw_ids)
    select n.tmdb_id, n.media_type, n.vote_average, n.vote_count, n.director, public.title_kw_ids(n.keywords)
      from new_rows n
    on conflict (tmdb_id, media_type) do update
      set vote_average = excluded.vote_average, vote_count = excluded.vote_count,
          director = excluded.director, kw_ids = excluded.kw_ids;

    select exists (select 1 from new_rows n where n.media_type = 'movie' and cardinality(public.title_kw_all(n.keywords)) > 0)
      into v_changed;
    if v_changed then
      perform pg_advisory_xact_lock(hashtext('public.keyword_df'));
      insert into public.keyword_df as kd (kw_id, df)
      select x.kw, count(*)::integer
        from new_rows n cross join lateral unnest(public.title_kw_all(n.keywords)) x(kw)
       where n.media_type = 'movie'
       group by x.kw
       order by x.kw
      on conflict (kw_id) do update set df = kd.df + excluded.df;
    end if;

  elsif tg_op = 'UPDATE' then
    -- linhas cuja chave mudou (raro): a antiga sai
    delete from public.title_features tf
     using old_rows o
     where tf.tmdb_id = o.tmdb_id and tf.media_type = o.media_type
       and not exists (select 1 from new_rows n where n.tmdb_id = o.tmdb_id and n.media_type = o.media_type);

    insert into public.title_features as tf (tmdb_id, media_type, vote_average, vote_count, director, kw_ids)
    select n.tmdb_id, n.media_type, n.vote_average, n.vote_count, n.director, public.title_kw_ids(n.keywords)
      from new_rows n
      left join old_rows o on o.tmdb_id = n.tmdb_id and o.media_type = n.media_type
     where o.tmdb_id is null
        or o.vote_average is distinct from n.vote_average
        or o.vote_count is distinct from n.vote_count
        or o.director is distinct from n.director
        or o.keywords is distinct from n.keywords
    on conflict (tmdb_id, media_type) do update
      set vote_average = excluded.vote_average, vote_count = excluded.vote_count,
          director = excluded.director, kw_ids = excluded.kw_ids;

    -- df: só a diferença entre as palavras de antes e as de agora
    with o as (
      select distinct o.tmdb_id, x.kw
        from old_rows o cross join lateral unnest(public.title_kw_all(o.keywords)) x(kw)
       where o.media_type = 'movie'
    ),
    n as (
      select distinct n.tmdb_id, x.kw
        from new_rows n cross join lateral unnest(public.title_kw_all(n.keywords)) x(kw)
       where n.media_type = 'movie'
    ),
    d as (
      select kw, sum(delta)::integer as delta
        from (select kw, -1 as delta from o union all select kw, 1 from n) z
       group by kw
      having sum(delta) <> 0
    )
    select exists (select 1 from d) into v_changed;

    if v_changed then
      perform pg_advisory_xact_lock(hashtext('public.keyword_df'));
      with o as (
        select distinct o.tmdb_id, x.kw
          from old_rows o cross join lateral unnest(public.title_kw_all(o.keywords)) x(kw)
         where o.media_type = 'movie'
      ),
      n as (
        select distinct n.tmdb_id, x.kw
          from new_rows n cross join lateral unnest(public.title_kw_all(n.keywords)) x(kw)
         where n.media_type = 'movie'
      ),
      d as (
        select kw, sum(delta)::integer as delta
          from (select kw, -1 as delta from o union all select kw, 1 from n) z
         group by kw
        having sum(delta) <> 0
      )
      insert into public.keyword_df as kd (kw_id, df)
      select d.kw, d.delta from d order by d.kw
      on conflict (kw_id) do update set df = kd.df + excluded.df;
    end if;

  elsif tg_op = 'DELETE' then
    delete from public.title_features tf
     using old_rows o
     where tf.tmdb_id = o.tmdb_id and tf.media_type = o.media_type;

    select exists (select 1 from old_rows o where o.media_type = 'movie' and cardinality(public.title_kw_all(o.keywords)) > 0)
      into v_changed;
    if v_changed then
      perform pg_advisory_xact_lock(hashtext('public.keyword_df'));
      insert into public.keyword_df as kd (kw_id, df)
      select x.kw, -count(*)::integer
        from old_rows o cross join lateral unnest(public.title_kw_all(o.keywords)) x(kw)
       where o.media_type = 'movie'
       group by x.kw
       order by x.kw
      on conflict (kw_id) do update set df = kd.df + excluded.df;
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function public.sync_title_features() from public, anon, authenticated;


create trigger title_features_sync_ins
  after insert on public.movie_cache
  referencing new table as new_rows
  for each statement execute function public.sync_title_features();

create trigger title_features_sync_upd
  after update on public.movie_cache
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.sync_title_features();

create trigger title_features_sync_del
  after delete on public.movie_cache
  referencing old table as old_rows
  for each statement execute function public.sync_title_features();

-- carga inicial (≈10 mil títulos; uns poucos segundos)
lock table public.movie_cache in share row exclusive mode;

insert into public.title_features (tmdb_id, media_type, vote_average, vote_count, director, kw_ids)
select mc.tmdb_id, mc.media_type, mc.vote_average, mc.vote_count, mc.director, public.title_kw_ids(mc.keywords)
  from public.movie_cache mc;

insert into public.keyword_df (kw_id, df)
select x.kw, count(*)::integer
  from public.movie_cache mc cross join lateral unnest(public.title_kw_all(mc.keywords)) x(kw)
 where mc.media_type = 'movie'
 group by x.kw;

analyze public.title_features;
analyze public.keyword_df;
