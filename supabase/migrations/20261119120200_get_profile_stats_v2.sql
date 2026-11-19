-- 19/11/2026 — Protocolo Reborn, onda 3 do banco (rede.md, A4 e 4.3).
--
-- Para mostrar meia dúzia de números no Perfil, src/hooks/useProfileData.ts
-- baixa a biblioteca inteira e a linha completa do movie_cache de cada título
-- (sinopses, elenco, temporadas com todos os episódios, onde assistir,
-- palavras-chave): megabytes por abertura do Perfil, para somar no aparelho.
--
-- get_profile_stats_v2 devolve os números prontos, com as MESMAS regras do
-- cliente (conferidas no ensaio contra uma segunda implementação, passo a
-- passo, das contas do hook):
--   ratedMoviesCount    títulos com nota (com ou sem linha no movie_cache)
--   ratingDistribution  { "0": n, …, "10": n } dos títulos com nota
--   totalWatchTime      minutos: runtime dos filmes com nota + duração de cada
--                       episódio visto das séries com nota (a 1ª temporada com
--                       aquele número e, nela, o 1º episódio com aquele número
--                       — o find do cliente; episódio sem duração não soma)
--   friendsCount        amizades aceitas da pessoa
--   countries           { "US": { "count": n, "avg": média das notas } } pelo
--                       primeiro país de origem de cada título com nota
-- Só os títulos com linha no movie_cache entram em totalWatchTime e
-- countries (no cliente, os que faltam passam por uma busca de reserva; hoje
-- há 1 linha de biblioteca nessa situação no banco inteiro).
--
-- RPC NOVA (só acréscimo); o hook antigo continua valendo para o APK antigo.
-- SECURITY INVOKER de propósito: a biblioteca é lida com a política de quem
-- chama, então perfil privado / só-amigos / conta escondida dão zero para quem
-- não pode ver — exatamente o que o cliente calcularia. Vale também para os
-- episódios vistos: a política de watched_episodes só mostra os da própria
-- pessoa, então no perfil de OUTRA pessoa o tempo das séries não entra (é
-- assim hoje no cliente; não mudei, fica anotado no relatório).
-- Nenhum índice novo: user_movies (user_id, …), movie_cache (tmdb_id,
-- media_type), watched_episodes (user_id, tmdb_id) e friendships já têm.

create or replace function public.get_profile_stats_v2(p_user_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with lib as (
    select um.movie_id, um.media_type, um.rating
      from user_movies um
     where um.user_id = p_user_id
  ),
  -- os avaliados que têm linha no movie_cache (o "ratedMovies" do cliente)
  rated as (
    select l.movie_id, l.media_type, l.rating, mc.runtime, mc.origin_country
      from lib l
      join movie_cache mc on mc.tmdb_id = l.movie_id and mc.media_type = l.media_type
     where l.rating is not null
  ),
  eps as (
    select we.tmdb_id, we.season_number, we.episode_number
      from watched_episodes we
     where we.user_id = p_user_id
       and we.tmdb_id in (select r.movie_id from rated r where r.media_type = 'tv')
  ),
  shows as (
    select mc.tmdb_id, mc.seasons_data
      from movie_cache mc
     where mc.media_type = 'tv'
       and mc.tmdb_id in (select e.tmdb_id from eps e)
  ),
  -- a primeira temporada com aquele número
  seasons as (
    select distinct on (sh.tmdb_id, (s.val -> 'season_number'))
           sh.tmdb_id, s.val -> 'season_number' as sn, s.val -> 'episodes' as episodes
      from shows sh
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(sh.seasons_data) = 'array' then sh.seasons_data else '[]'::jsonb end
      ) with ordinality s(val, ord)
     order by sh.tmdb_id, (s.val -> 'season_number'), s.ord
  ),
  -- nela, o primeiro episódio com aquele número
  ep_rt as (
    select distinct on (e.tmdb_id, e.season_number, e.episode_number)
           x.val -> 'runtime' as rt
      from eps e
      join seasons se on se.tmdb_id = e.tmdb_id and se.sn = to_jsonb(e.season_number)
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(se.episodes) = 'array' then se.episodes else '[]'::jsonb end
      ) with ordinality x(val, ord)
     where x.val -> 'episode_number' = to_jsonb(e.episode_number)
     order by e.tmdb_id, e.season_number, e.episode_number, x.ord
  )
  select jsonb_build_object(
    'v', 2,
    'ratedMoviesCount', (select count(*) from lib l where l.rating is not null),
    'ratingDistribution', (select jsonb_object_agg(g.r::text, (select count(*) from lib l where l.rating = g.r))
                             from generate_series(0, 10) g(r)),
    'totalWatchTime',
        coalesce((select sum(coalesce(r.runtime, 0)) from rated r where r.media_type <> 'tv'), 0)
      + coalesce((select sum((e.rt #>> '{}')::numeric) from ep_rt e where jsonb_typeof(e.rt) = 'number'), 0),
    'friendsCount', (select count(*) from friendships f
                      where f.status = 'accepted' and (f.requester_id = p_user_id or f.addressee_id = p_user_id)),
    'countries', coalesce((
        select jsonb_object_agg(c.code, jsonb_build_object('count', c.n, 'avg', c.avg))
          from (select r.origin_country[1] as code, count(*) as n, sum(r.rating)::float8 / count(*) as avg
                  from rated r
                 where coalesce(r.origin_country[1], '') <> ''
                 group by 1) c), '{}'::jsonb)
  );
$function$;

revoke all on function public.get_profile_stats_v2(uuid) from public;
grant execute on function public.get_profile_stats_v2(uuid) to anon, authenticated, service_role;

comment on function public.get_profile_stats_v2(uuid) is
  '19/11/2026 (Reborn): os números do Perfil prontos (ratedMoviesCount, ratingDistribution, totalWatchTime, friendsCount, countries {code: {count, avg}}), com as regras de useProfileData. SECURITY INVOKER: respeita a visibilidade do perfil pela política de user_movies.';
