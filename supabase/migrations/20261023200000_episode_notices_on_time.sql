-- Avisos de episódio novo na hora certa (23/10/2026, a pedido do Bruno).
--
-- O que estava errado:
--   1. O aviso só saía quando a série era atualizada do TMDB, e uma série no
--      ar só vence a cada 7 dias. O episódio 8 de Dark Matter (15/10 no TMDB)
--      virou aviso em 20/10, na atualização seguinte; o 9 (22/10) só sairia
--      em 27/10.
--   2. notify_new_episode avisava quem já tinha marcado o episódio como
--      visto (o Bruno viu o 8 em 16/10 e recebeu o aviso em 20/10).
--   3. A atualização olhava a data do dia em UTC: se acontecesse no próprio
--      dia do episódio, avisava antes de ele sair (os streamings americanos
--      soltam à noite, no horário dos EUA).
--
-- Agora:
--   - notify_aired_episodes(), todo dia à 01h10 de Brasília (04h10 UTC),
--     logo depois da atualização da madrugada, avisa os episódios que já
--     saíram, direto do que está guardado (sem pedir nada ao TMDB);
--   - um episódio com data D (a data do TMDB, que é a dos EUA) conta como
--     lançado a partir da 01h de D+1 em Brasília (episode_release_cutoff):
--     nunca antes de sair (a Apple solta às 21h de Nova York, 22h de
--     Brasília; as redes americanas, entre 20h e 23h de Nova York);
--   - o aviso vai para quem tem a série na biblioteca desde o dia do episódio
--     (ou antes), não marcou o episódio como visto e não é bot;
--   - tv_episode_notices guarda os episódios já avisados (um aviso por
--     episódio, mesmo que o aviso tenha sido apagado depois);
--   - séries com episódio que saiu desde a última atualização entram primeiro
--     na atualização da madrugada (titles_due_for_refresh), para o nome e a
--     data do episódio estarem certos quando o aviso sair;
--   - marcar o episódio como visto marca o aviso dele como lido;
--   - a cache-title deixou de avisar (o aviso é só daqui).

create table if not exists public.tv_episode_notices (
  tmdb_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  air_date date,
  recipients integer not null default 0,
  notified_at timestamptz not null default now(),
  primary key (tmdb_id, season_number, episode_number)
);
alter table public.tv_episode_notices enable row level security;
revoke all on public.tv_episode_notices from anon, authenticated;

-- Até que data (do TMDB) um episódio já saiu: data D vale a partir da 01h de
-- D+1 em Brasília.
create or replace function public.episode_release_cutoff(p_at timestamptz default now())
returns date
language sql
stable
set search_path = public
as $$
  select ((p_at at time zone 'America/Sao_Paulo') - interval '1 hour')::date - 1;
$$;

create or replace function public.notify_new_episode(
  p_tmdb_id integer, p_movie_title text, p_movie_poster text,
  p_season_number integer, p_episode_number integer, p_episode_name text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_air date;
  v_count integer := 0;
begin
  -- Um aviso por episódio.
  if exists (select 1 from tv_episode_notices n
              where n.tmdb_id = p_tmdb_id and n.season_number = p_season_number and n.episode_number = p_episode_number) then
    return 0;
  end if;

  select nullif(e ->> 'air_date', '')::date into v_air
    from movie_cache mc
    cross join lateral jsonb_array_elements(coalesce(mc.seasons_data, '[]'::jsonb)) s
    cross join lateral jsonb_array_elements(coalesce(s -> 'episodes', '[]'::jsonb)) e
   where mc.tmdb_id = p_tmdb_id and mc.media_type = 'tv'
     and (s ->> 'season_number')::int = p_season_number
     and (e ->> 'episode_number')::int = p_episode_number
   limit 1;

  -- Ainda não saiu: não avisa (e não registra, para avisar quando sair).
  if v_air is not null and v_air > public.episode_release_cutoff() then
    return 0;
  end if;

  insert into friend_indications (
    from_user_id, to_user_id, type, media_type,
    movie_id, movie_title, movie_poster,
    season_number, episode_number, episode_name,
    message, read
  )
  select null, um.user_id, 'new_episode', 'tv',
         p_tmdb_id, p_movie_title, p_movie_poster,
         p_season_number, p_episode_number, p_episode_name,
         null, false
    from user_movies um
   where um.movie_id = p_tmdb_id
     and um.media_type = 'tv'
     -- tinha a série no dia do episódio (quem adiciona depois não recebe
     -- aviso dos episódios antigos)
     and (v_air is null or (um.created_at at time zone 'America/Sao_Paulo')::date <= v_air)
     and not exists (select 1 from bot_accounts b where b.user_id = um.user_id)
     and not exists (select 1 from watched_episodes we
                      where we.user_id = um.user_id and we.tmdb_id = p_tmdb_id
                        and we.season_number = p_season_number and we.episode_number = p_episode_number)
     and not exists (select 1 from friend_indications fi
                      where fi.to_user_id = um.user_id and fi.type = 'new_episode' and fi.movie_id = p_tmdb_id
                        and fi.season_number = p_season_number and fi.episode_number = p_episode_number);

  get diagnostics v_count = row_count;

  insert into tv_episode_notices (tmdb_id, season_number, episode_number, air_date, recipients)
  values (p_tmdb_id, p_season_number, p_episode_number, v_air, v_count)
  on conflict do nothing;

  return v_count;
end;
$$;

revoke all on function public.notify_new_episode(integer, text, text, integer, integer, text) from public, anon, authenticated;

-- A rodada diária: episódios que já saíram (até 14 dias atrás) de séries que
-- alguém tem na biblioteca e que ainda não viraram aviso.
create or replace function public.notify_aired_episodes(p_lookback_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff date := public.episode_release_cutoff();
  r record;
  v_total integer := 0;
begin
  for r in
    select mc.tmdb_id, mc.title_en, mc.poster_path,
           (s.s ->> 'season_number')::int sn, (e ->> 'episode_number')::int en, e ->> 'name' ename,
           (e ->> 'air_date')::date ad
      from movie_cache mc
      -- as duas últimas temporadas bastam (14 dias para trás)
      cross join lateral (select x.s from jsonb_array_elements(mc.seasons_data) with ordinality x(s, i)
                           where x.i > jsonb_array_length(mc.seasons_data) - 2) s
      cross join lateral jsonb_array_elements(coalesce(s.s -> 'episodes', '[]'::jsonb)) e
     where mc.media_type = 'tv'
       and jsonb_typeof(mc.seasons_data) = 'array'
       and (s.s ->> 'season_number')::int > 0
       and (e ->> 'air_date') ~ '^\d{4}-\d{2}-\d{2}$'
       and (e ->> 'air_date')::date between v_cutoff - p_lookback_days and v_cutoff
       and exists (select 1 from user_movies um where um.movie_id = mc.tmdb_id and um.media_type = 'tv')
       and not exists (select 1 from tv_episode_notices n
                        where n.tmdb_id = mc.tmdb_id
                          and n.season_number = (s.s ->> 'season_number')::int
                          and n.episode_number = (e ->> 'episode_number')::int)
     order by ad, mc.tmdb_id, sn, en
  loop
    v_total := v_total + public.notify_new_episode(r.tmdb_id, r.title_en, r.poster_path, r.sn, r.en, r.ename);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.notify_aired_episodes(integer) from public, anon, authenticated;

-- Marcar o episódio como visto apaga a bolinha do aviso dele.
create or replace function public.mark_episode_notice_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update friend_indications
     set read = true
   where to_user_id = new.user_id and type = 'new_episode' and movie_id = new.tmdb_id
     and season_number = new.season_number and episode_number = new.episode_number
     and read = false;
  return new;
exception when others then
  return new;
end;
$$;

create or replace trigger watched_episode_reads_notice
  after insert on public.watched_episodes
  for each row execute function public.mark_episode_notice_read();

-- Atualização da madrugada: primeiro as séries com episódio que saiu desde a
-- última atualização (para o aviso da 01h10 sair com nome e data certos);
-- depois, como antes, os títulos mais vencidos.
create or replace function public.titles_due_for_refresh(p_limit integer)
returns table(tmdb_id integer, media_type text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base as (
    select mc.tmdb_id, mc.media_type, mc.refreshed_at,
           mc.refreshed_at + make_interval(days => public.title_refresh_days(mc.media_type, mc.release_date, mc.in_production, mc.status)) due_at,
           -- só a última temporada (a que está no ar), para a consulta ficar leve
           case when mc.media_type = 'tv' and jsonb_typeof(mc.seasons_data) = 'array' and jsonb_array_length(mc.seasons_data) > 0
                then exists (select 1
                               from jsonb_array_elements(coalesce(mc.seasons_data -> (jsonb_array_length(mc.seasons_data) - 1) -> 'episodes', '[]'::jsonb)) e
                              where (e ->> 'air_date') ~ '^\d{4}-\d{2}-\d{2}$'
                                and (e ->> 'air_date')::date >= (mc.refreshed_at at time zone 'America/Sao_Paulo')::date
                                and (e ->> 'air_date')::date < (now() at time zone 'America/Sao_Paulo')::date)
                else false end episode_due,
           mc.budget, mc.number_of_seasons, mc.seasons_data
      from public.movie_cache mc
  )
  select b.tmdb_id, b.media_type
    from base b
   where b.due_at <= now()
      or b.episode_due
      or (b.media_type = 'movie' and b.budget is null)
      or (b.media_type = 'tv' and coalesce(b.number_of_seasons, 0) > 0 and (b.seasons_data is null or jsonb_array_length(b.seasons_data) = 0))
   order by b.episode_due desc, b.due_at
   limit greatest(1, least(p_limit, 200));
$function$;

-- A rodada diária, à 01h10 de Brasília (depois das quatro rodadas de
-- atualização, 00h05 a 00h50).
select cron.schedule('episode-notices', '10 4 * * *', $$select public.notify_aired_episodes()$$);
