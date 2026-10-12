-- Base de filmes no servidor, parte 2 (12/10/2026): as travas. Aplicada
-- depois de a cache-title e o novo tmdb-proxy estarem no ar (parte 1 em
-- 20261012120000_title_cache_server.sql).

-- Só o servidor grava o movie_cache. Os apps antigos (APK) que ainda tentam
-- gravar recebem erro e seguem (essas gravações sempre foram em segundo plano).
revoke insert, update, delete, truncate on public.movie_cache from anon, authenticated;

-- ---------- movies: o site não altera linha existente ----------

-- A tabela movies existe porque user_movies aponta para ela. Os apps antigos
-- ainda gravam nela antes de adicionar à biblioteca (por isso o INSERT
-- continua liberado), mas mudar uma linha que já existe passa a ser só do
-- servidor: um UPDATE vindo do site fica sem efeito.
create or replace function public.movies_guard_client_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    return old;
  end if;
  return new;
end;
$$;

create or replace trigger movies_guard_client_update
  before update on public.movies
  for each row execute function public.movies_guard_client_update();

-- ---------- user_movies: linha em movies e cache garantidos pelo banco ----------

-- Antes de entrar na biblioteca: se o título não tem linha em movies, ela é
-- criada aqui, com os dados do movie_cache (ou só o id, se o título ainda não
-- está no cache — a cache-title completa depois).
create or replace function public.ensure_movies_row_for_library()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  if exists (select 1 from public.movies m where m.id = new.movie_id and m.media_type = coalesce(new.media_type, 'movie')) then
    return new;
  end if;
  select mc.title_pt, mc.title_en, mc.release_date, mc.genres_pt, mc.genres_en, mc.director, mc.number_of_seasons
    into c
    from public.movie_cache mc
   where mc.tmdb_id = new.movie_id and mc.media_type = coalesce(new.media_type, 'movie');
  insert into public.movies (id, media_type, title, release_date, genres, director, number_of_seasons)
  values (
    new.movie_id,
    coalesce(new.media_type, 'movie'),
    coalesce(c.title_pt, c.title_en, ''),
    c.release_date,
    coalesce((select array_agg(g->>'name') from jsonb_array_elements(coalesce(c.genres_pt, c.genres_en, '[]'::jsonb)) g), '{}'),
    c.director,
    c.number_of_seasons
  )
  on conflict (id, media_type) do nothing;
  return new;
end;
$$;

create or replace trigger ensure_movies_row_for_library
  before insert on public.user_movies
  for each row execute function public.ensure_movies_row_for_library();

-- Depois de entrar: o que ainda não está no movie_cache é pedido à
-- cache-title (até 25 títulos por pedido). Vale para qualquer app, novo ou
-- antigo, e para as gravações em lote.
create or replace function public.request_cache_for_new_library_titles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missing jsonb;
  v_chunk jsonb;
  v_i integer := 0;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', t.movie_id, 'type', t.media_type)), '[]'::jsonb)
    into v_missing
    from (
      select distinct n.movie_id, coalesce(n.media_type, 'movie') as media_type
        from new_rows n
       where not exists (
         select 1 from public.movie_cache mc
          where mc.tmdb_id = n.movie_id and mc.media_type = coalesce(n.media_type, 'movie')
       )
       limit 500
    ) t;

  while v_i < jsonb_array_length(v_missing) loop
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_chunk
      from (select e from jsonb_array_elements(v_missing) with ordinality as x(e, n) where n > v_i and n <= v_i + 25) s;
    perform curation.request_title_cache(v_chunk, 'fill');
    v_i := v_i + 25;
  end loop;
  return null;
end;
$$;

create or replace trigger request_cache_for_new_library_titles
  after insert on public.user_movies
  referencing new table as new_rows
  for each statement execute function public.request_cache_for_new_library_titles();

-- ---------- Agenda ----------

-- As duas rotinas antigas (séries a cada noite e títulos em alta) passam
-- para a cache-title. Ficam desligadas, não apagadas.
do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname in ('refresh-tv-shows-biweekly', 'sync-trending-movies') loop
    perform cron.alter_job(job_id := v_job.jobid, active := false);
  end loop;
end $$;

-- 00h00 (Brasília): os filmes em alta da semana que ainda não estão na base.
select cron.schedule(
  'title-cache-trending',
  '0 3 * * *',
  $cron$select curation.request_title_cache('[]'::jsonb, 'trending');$cron$
);

-- 00h05 a 00h50: 4 rodadas de até 40 títulos vencidos (160 por noite).
select cron.schedule(
  'title-cache-refresh',
  '5,20,35,50 3 * * *',
  $cron$select curation.request_title_cache('[]'::jsonb, 'sweep');$cron$
);
