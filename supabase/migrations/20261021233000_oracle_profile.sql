-- Perfil do oráculo (21/10/2026): tocar na carta de um oráculo no Oracle Hub
-- abre a "página" dele, no estilo da página do ator/diretor. Tudo sai das
-- nove prateleiras daquele oráculo (recommendation_pools, filmes e séries)
-- cruzadas com o movie_cache e, para quem está logado, com a biblioteca.
--
-- get_oracle_profile(p_oracle) devolve:
--   - o acervo: filmes, séries, nota média do público, horas de filme, países,
--     anos (do mais antigo ao mais novo), décadas, os 5 gêneros e os 6
--     diretores que ele mais guarda (só filmes, com a foto quando o banco tem);
--   - as nove prateleiras (filmes, séries e quantos a pessoa já avaliou);
--   - os destaques: o mais popular, o mais bem avaliado, o mais novo, o mais
--     antigo, a joia escondida (melhor nota entre os 30% menos votados, com
--     pelo menos 50 votos), a maior bomba (pior nota, com 50 votos ou mais) e
--     o mais obscuro (menos votos, com pelo menos 5);
--   - o Top 10 de filmes e de séries pela nota do público (votos mínimos: 500;
--     no Cypher, que guarda o pouco visto, 50);
--   - "você e ele": avaliados, média, média geral, watchlist e notas 9/10.
-- Cada título vem com a nota da pessoa (ou só "na biblioteca", se for
-- Watchlist).

create or replace function public.get_oracle_profile(p_oracle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min_votes integer := case when p_oracle = 'cypher' then 50 else 500 end;
  v_result jsonb;
begin
  if p_oracle is null or p_oracle not in ('bogart', 'fincher', 'cypher') then
    return null;
  end if;

  with pool as (
    select distinct on (q.mt, q.id) q.mood_key, q.mt, q.id
      from (
        select rp.mood_key, 'movie'::text as mt, x::int as id
          from recommendation_pools rp, jsonb_array_elements_text(coalesce(rp.movie_ids, '[]'::jsonb)) x
         where rp.card_type = p_oracle and rp.mood_key <> 'random-surprise'
        union all
        select rp.mood_key, 'tv'::text, x::int
          from recommendation_pools rp, jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)) x
         where rp.card_type = p_oracle and rp.mood_key <> 'random-surprise'
      ) q
     order by q.mt, q.id, q.mood_key
  ),
  mine as (
    select um.movie_id as id, coalesce(um.media_type, 'movie') as mt, um.rating
      from user_movies um
     where v_uid is not null and um.user_id = v_uid
  ),
  t as (
    select p.mood_key, p.mt, p.id,
           mc.title_pt, mc.title_en, mc.poster_path, mc.poster_path_pt, mc.release_date,
           mc.vote_average::numeric as va, coalesce(mc.vote_count, 0) as vc,
           mc.runtime, mc.genres_pt, mc.genres_en, mc.director, mc.director_id, mc.origin_country,
           (m.id is not null) as in_lib, m.rating as my_rating
      from pool p
      left join movie_cache mc on mc.tmdb_id = p.id and mc.media_type = p.mt
      left join mine m on m.id = p.id and m.mt = p.mt
  ),
  item as (
    select t.*,
           jsonb_build_object(
             'id', t.id, 'type', t.mt, 'title_pt', t.title_pt, 'title_en', t.title_en,
             'poster', t.poster_path, 'poster_pt', t.poster_path_pt,
             'year', extract(year from t.release_date)::int,
             'vote', round(t.va, 1), 'votes', t.vc, 'mood', t.mood_key,
             'lib', t.in_lib, 'rating', t.my_rating
           ) as j
      from t
     where t.title_en is not null or t.title_pt is not null
  ),
  gem_cut as (
    select percentile_disc(0.3) within group (order by vc) as p30 from item where va is not null and vc >= 50
  )
  select jsonb_build_object(
    'oracle', p_oracle,
    'movies', (select count(*) from pool where mt = 'movie'),
    'series', (select count(*) from pool where mt = 'tv'),
    'avg_vote', (select round(avg(va) filter (where vc >= 20), 2) from t),
    'hours', (select round(sum(runtime) filter (where mt = 'movie' and runtime > 0) / 60.0) from t),
    'countries', (select count(distinct c) from t, unnest(coalesce(t.origin_country, '{}'::text[])) c),
    'top_country', (select c from t, unnest(coalesce(t.origin_country, '{}'::text[])) c group by c order by count(*) desc, c limit 1),
    'years', (select jsonb_build_object('min', min(extract(year from release_date))::int, 'max', max(extract(year from release_date))::int) from t where release_date <= current_date),
    'decades', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]'::jsonb)
                  from (select (floor(extract(year from release_date) / 10) * 10)::int as d, count(*) as n from t where release_date is not null group by 1) x),
    'genres', (select coalesce(jsonb_agg(jsonb_build_object('id', gid, 'pt', pt, 'en', en, 'n', n) order by n desc), '[]'::jsonb)
                 from (
                   select (g ->> 'id')::int as gid, min(g ->> 'name') as pt,
                          min((select e ->> 'name' from jsonb_array_elements(coalesce(t.genres_en, '[]'::jsonb)) e where e ->> 'id' = g ->> 'id' limit 1)) as en,
                          count(*) as n
                     from t, jsonb_array_elements(case when jsonb_typeof(t.genres_pt) = 'array' then t.genres_pt else '[]'::jsonb end) g
                    group by 1
                    order by n desc
                    limit 5
                 ) x),
    'directors', (select coalesce(jsonb_agg(jsonb_build_object('id', x.did, 'name', x.name, 'n', x.n, 'photo', coalesce(pe.profile_path, pp.profile_path)) order by x.n desc, x.name), '[]'::jsonb)
                    from (
                      select max(director_id) as did, director as name, count(*) as n
                        from t
                       where mt = 'movie' and director is not null and director <> ''
                       group by director
                      having count(*) >= 2
                       order by n desc, director
                       limit 6
                    ) x
                    left join people pe on pe.tmdb_id = x.did
                    left join person_pages pp on pp.tmdb_id = x.did),
    'shelves', (select coalesce(jsonb_agg(jsonb_build_object('mood', cm.mood_key, 'movies', coalesce(s.movies, 0), 'series', coalesce(s.series, 0), 'rated', coalesce(s.rated, 0)) order by cm.sort_order), '[]'::jsonb)
                  from cine_moods cm
                  left join (
                    select mood_key,
                           count(*) filter (where mt = 'movie') as movies,
                           count(*) filter (where mt = 'tv') as series,
                           count(*) filter (where my_rating is not null) as rated
                      from t group by mood_key
                  ) s on s.mood_key = cm.mood_key
                 where cm.mood_key <> 'random-surprise'),
    'highlights', jsonb_build_object(
      'popular', (select j from item order by vc desc nulls last limit 1),
      'best', (select j from item where vc >= v_min_votes order by va desc nulls last, vc desc limit 1),
      'newest', (select j from item where release_date <= current_date order by release_date desc nulls last limit 1),
      'oldest', (select j from item where release_date is not null order by release_date asc limit 1),
      'gem', (select j from item, gem_cut where va is not null and vc >= 50 and vc <= gem_cut.p30 order by va desc, vc desc limit 1),
      'bomb', (select j from item where va is not null and vc >= 50 order by va asc, vc desc limit 1),
      'obscure', (select j from item where vc >= 5 and poster_path is not null order by vc asc, release_date desc nulls last limit 1)
    ),
    'top', jsonb_build_object(
      'movies', (select coalesce(jsonb_agg(j order by va desc, vc desc), '[]'::jsonb)
                   from (select j, va, vc from item where mt = 'movie' and va is not null and vc >= v_min_votes and release_date <= current_date order by va desc, vc desc limit 10) x),
      'series', (select coalesce(jsonb_agg(j order by va desc, vc desc), '[]'::jsonb)
                   from (select j, va, vc from item where mt = 'tv' and va is not null and vc >= v_min_votes and release_date <= current_date order by va desc, vc desc limit 10) x)
    ),
    'you', case when v_uid is null then null else jsonb_build_object(
      'rated', (select count(*) from t where my_rating is not null),
      'avg', (select round(avg(my_rating), 2) from t where my_rating is not null),
      'overall', (select round(avg(rating), 2) from mine where rating is not null),
      'watchlist', (select count(*) from t where in_lib and my_rating is null),
      'loved', (select count(*) from t where my_rating >= 9)
    ) end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_oracle_profile(text) from public, anon;
grant execute on function public.get_oracle_profile(text) to authenticated;
