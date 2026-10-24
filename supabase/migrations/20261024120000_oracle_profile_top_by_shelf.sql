-- Perfil do oráculo, ajuste de 24/10/2026 (pedido do Bruno):
--   - o Top 10 (filmes e séries) passa a ser de cada pessoa: o 1º é uma
--     surpresa entre os 10 mais bem avaliados do oráculo (o site sorteia a
--     cada abertura) e os outros 9 são o mais bem avaliado de cada uma das
--     nove prateleiras, na ordem das prateleiras favoritas da pessoa
--     (profiles.persona_scores; as que faltam, na ordem padrão). A função
--     devolve os 10 candidatos à surpresa e os 3 melhores de cada prateleira
--     (o site pula o que já saiu como surpresa);
--   - fora do Top 10 o que saiu nos últimos 365 dias (a nota ainda está
--     amadurecendo);
--   - votos mínimos: filmes 500 (Cypher 50); séries 300 no Bogart, 100 no
--     Fincher e 40 no Cypher (as réguas das prateleiras). Prateleira sem
--     ninguém acima da régua usa o melhor com 20 votos ou mais;
--   - saíram "As nove prateleiras" e os gêneros (as seções sumiram do
--     perfil). As décadas ficam, para a década de ouro.

create or replace function public.get_oracle_profile(p_oracle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min_movie integer := case when p_oracle = 'cypher' then 50 else 500 end;
  v_min_tv integer := case p_oracle when 'bogart' then 300 when 'fincher' then 100 else 40 end;
  v_default text[] := array['adventures', 'mind-blowing', 'laugh-out-loud', 'catharsis', 'adrenaline', 'romantic', 'family-time', 'dark-and-scary', 'drug-trip'];
  v_moods text[];
  v_result jsonb;
begin
  if p_oracle is null or p_oracle not in ('bogart', 'fincher', 'cypher') then
    return null;
  end if;

  -- As prateleiras na ordem da pessoa: as da persona com títulos avaliados,
  -- depois as outras na ordem padrão.
  select coalesce(array_agg(x.mk order by x.ord), '{}') into v_moods
    from (
      select distinct on (e.s ->> 'mood_key') e.s ->> 'mood_key' as mk, e.ord
        from profiles p,
             jsonb_array_elements(case when jsonb_typeof(p.persona_scores) = 'array' then p.persona_scores else '[]'::jsonb end) with ordinality as e(s, ord)
       where v_uid is not null and p.id = v_uid
         and coalesce((e.s ->> 'films')::int, 0) > 0
         and e.s ->> 'mood_key' = any(v_default)
       order by e.s ->> 'mood_key', e.ord
    ) x;
  v_moods := v_moods || array(
    select d.m from unnest(v_default) with ordinality as d(m, o)
     where not (d.m = any(v_moods))
     order by d.o
  );

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
           mc.runtime, mc.director, mc.director_id, mc.origin_country,
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
  -- Candidatos ao Top 10: nota do público, 20+ votos, lançados há mais de um ano.
  ranked as (
    select i.*, (i.vc >= case when i.mt = 'movie' then v_min_movie else v_min_tv end) as qualified
      from item i
     where i.va is not null and i.vc >= 20
       and i.release_date is not null and i.release_date <= current_date - 365
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
    'mood_order', to_jsonb(v_moods),
    'highlights', jsonb_build_object(
      'popular', (select j from item order by vc desc nulls last limit 1),
      'best', (select j from item where vc >= v_min_movie order by va desc nulls last, vc desc limit 1),
      'newest', (select j from item where release_date <= current_date order by release_date desc nulls last limit 1),
      'oldest', (select j from item where release_date is not null order by release_date asc limit 1),
      'gem', (select j from item, gem_cut where va is not null and vc >= 50 and vc <= gem_cut.p30 order by va desc, vc desc limit 1),
      'bomb', (select j from item where va is not null and vc >= 50 order by va asc, vc desc limit 1),
      'obscure', (select j from item where vc >= 5 and poster_path is not null order by vc asc, release_date desc nulls last limit 1)
    ),
    'top', (
      select jsonb_object_agg(tp.key, jsonb_build_object(
               'overall', (select coalesce(jsonb_agg(x.j order by x.va desc, x.vc desc), '[]'::jsonb)
                             from (select r.j, r.va, r.vc from ranked r
                                    where r.mt = tp.mt and r.qualified
                                    order by r.va desc, r.vc desc limit 10) x),
               'shelves', (select coalesce(jsonb_agg(jsonb_build_object('mood', m.mk, 'items', (
                                       select coalesce(jsonb_agg(y.j order by y.q desc, y.va desc, y.vc desc), '[]'::jsonb)
                                         from (select r.j, r.qualified as q, r.va, r.vc from ranked r
                                                where r.mt = tp.mt and r.mood_key = m.mk
                                                order by r.qualified desc, r.va desc, r.vc desc limit 3) y)) order by m.o), '[]'::jsonb)
                             from unnest(v_moods) with ordinality as m(mk, o))))
        from (values ('movies', 'movie'), ('series', 'tv')) as tp(key, mt)
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
