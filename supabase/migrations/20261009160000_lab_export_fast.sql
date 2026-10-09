-- Exportação do laboratório mais rápida (09/10/2026).
--
-- Com os bots a public.lab_export_text() passou a levar ~1 min e a função de
-- borda lab-export caía no limite de 8 s do PostgREST ("canceling statement
-- due to statement timeout"). O gargalo eram as subconsultas por título
-- (diretor, palavras-chave, elenco, gêneros), que varriam as listas inteiras
-- a cada um dos milhares de títulos. Agora cada lista é montada uma vez só,
-- agrupada por título, e entra por junção. Formato de saída idêntico ao da
-- 20261009152000_lab_export.sql.

create or replace function public.lab_export_text()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
with uidx as (
  select z.user_id, (row_number() over (order by z.is_bot, z.user_id))::int - 1 u, z.is_bot
  from (
    select distinct um.user_id, exists (select 1 from bot_accounts b where b.user_id = um.user_id) is_bot
    from user_movies um where um.rating is not null
  ) z
),
t as (select distinct um.movie_id id, um.media_type mt from user_movies um where um.rating is not null),
tc as materialized (
  select mc.tmdb_id, mc.media_type, mc.vote_average, mc.vote_count, mc.release_date, mc.runtime, mc.episode_run_time,
         mc.number_of_seasons, nullif(mc.director, '') director, mc.genres_en, mc.keywords, mc.cast_members, mc.origin_country,
         row_number() over (order by mc.media_type, mc.tmdb_id) tn
  from movie_cache mc join t on t.id = mc.tmdb_id and t.mt = mc.media_type
),
tkw as materialized (
  select tc.tn, (k->>'id')::int kid, max(lower(k->>'name')) kname
  from tc cross join lateral jsonb_array_elements(coalesce(tc.keywords, '[]')) k
  group by tc.tn, (k->>'id')::int
),
kwidx as materialized (
  select kid, nt, (row_number() over (order by nt desc, kid))::int - 1 ki
  from (select kid, max(kname) kname, count(distinct tn) nt from tkw group by kid) z
  where nt >= 2 and kname not in ('based on novel or book', 'based on comic', 'duringcreditsstinger', 'aftercreditsstinger')
),
kwdf as (
  select (kk->>'id')::int kid, count(distinct mc2.tmdb_id) df
  from movie_cache mc2 cross join lateral jsonb_array_elements(coalesce(mc2.keywords, '[]')) kk
  where mc2.media_type = 'movie' group by 1
),
tkw_s as (
  select tkw.tn, string_agg(kwidx.ki::text, '/' order by kwidx.ki) s
  from tkw join kwidx using (kid) group by tkw.tn
),
dirs as (
  select director, (dense_rank() over (order by director))::int - 1 di
  from (select distinct director from tc where director is not null) z
),
tcast as materialized (
  select tc.tn, (c->>'id')::int cid, o
  from tc cross join lateral jsonb_array_elements(coalesce(tc.cast_members, '[]')) with ordinality cc(c, o) where o <= 5
),
castidx as (
  select cid, (row_number() over (order by nt desc, cid))::int - 1 ci
  from (select cid, count(distinct tn) nt from tcast group by cid) z where nt >= 2
),
tcast_s as (
  select tcast.tn, string_agg(castidx.ci::text, '/' order by tcast.o) s
  from tcast join castidx using (cid) group by tcast.tn
),
tgen_s as (
  select tc.tn, string_agg(g->>'id', '/' order by o) s
  from tc cross join lateral jsonb_array_elements(coalesce(tc.genres_en, '[]')) with ordinality gg(g, o) group by tc.tn
),
pm as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key, rp.card_type
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.movie_ids) x where rp.mood_key <> 'random-surprise'
),
pt as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key, rp.card_type
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.tv_ids) x where rp.mood_key <> 'random-surprise'
),
s_users as (
  select string_agg(concat_ws(E'\t', x.u, coalesce(p.subcategoria_id, ''),
           coalesce(round(p.pontos_e, 2)::text, ''), coalesce(round(p.pontos_i, 2)::text, ''), coalesce(round(p.pontos_c, 2)::text, ''),
           coalesce(round(p.pontos_s, 2)::text, ''), coalesce(round(p.pontos_r, 2)::text, ''), case when x.is_bot then 1 else 0 end),
         E'\n' order by x.u) s
  from uidx x left join profiles p on p.id = x.user_id
),
s_ratings as (
  select string_agg(concat_ws(E'\t', x.u, um.movie_id, case when um.media_type = 'tv' then 't' else 'm' end, um.rating,
           um.created_at::date - date '2024-01-01', coalesce(um.updated_at, um.created_at)::date - date '2024-01-01'),
         E'\n' order by x.u, um.media_type, um.movie_id) s
  from user_movies um join uidx x on x.user_id = um.user_id where um.rating is not null
),
s_watch as (
  select string_agg(concat_ws(E'\t', x.u, um.movie_id, case when um.media_type = 'tv' then 't' else 'm' end,
           um.created_at::date - date '2024-01-01'), E'\n' order by x.u, um.media_type, um.movie_id) s
  from user_movies um join uidx x on x.user_id = um.user_id where um.rating is null
),
s_titles as (
  select string_agg(concat_ws(E'\t',
    tc.tmdb_id, case when tc.media_type = 'tv' then 't' else 'm' end,
    coalesce(round(tc.vote_average, 3)::text, ''), coalesce(tc.vote_count::text, ''),
    coalesce(extract(year from tc.release_date)::int::text, ''), coalesce(tc.runtime::text, ''),
    coalesce(tc.episode_run_time::text, ''), coalesce(tc.number_of_seasons::text, ''),
    coalesce(dirs.di::text, ''),
    coalesce(case coalesce(case when tc.media_type = 'tv' then pt.mood_key else pm.mood_key end, '')
      when 'adrenaline' then 'A' when 'adventures' then 'V' when 'catharsis' then 'C' when 'dark-and-scary' then 'D'
      when 'drug-trip' then 'P' when 'family-time' then 'F' when 'laugh-out-loud' then 'L' when 'mind-blowing' then 'M'
      when 'romantic' then 'R' when '' then '' else '?' end, ''),
    coalesce(left(case when tc.media_type = 'tv' then pt.card_type else pm.card_type end, 1), ''),
    coalesce(tgen_s.s, ''),
    coalesce(tkw_s.s, ''),
    coalesce(tcast_s.s, ''),
    coalesce(array_to_string(tc.origin_country, '/'), '')
  ), E'\n' order by tc.tn) s
  from tc
  left join dirs on dirs.director = tc.director
  left join tgen_s on tgen_s.tn = tc.tn
  left join tkw_s on tkw_s.tn = tc.tn
  left join tcast_s on tcast_s.tn = tc.tn
  left join pm on pm.m = tc.tmdb_id and tc.media_type = 'movie'
  left join pt on pt.m = tc.tmdb_id and tc.media_type = 'tv'
),
s_kw as (
  select string_agg(concat_ws(E'\t', ki, coalesce(kwdf.df, 0), nt), E'\n' order by ki) s
  from kwidx left join kwdf using (kid)
)
select '##users' || E'\n' || coalesce((select s from s_users), '') || E'\n'
    || '##ratings' || E'\n' || coalesce((select s from s_ratings), '') || E'\n'
    || '##watchlist' || E'\n' || coalesce((select s from s_watch), '') || E'\n'
    || '##titles' || E'\n' || coalesce((select s from s_titles), '') || E'\n'
    || '##keywords' || E'\n' || '#ndocs' || E'\t' || (select count(*) from movie_cache where media_type = 'movie') || E'\n'
    || coalesce((select s from s_kw), '') || E'\n';
$$;

revoke all on function public.lab_export_text() from public, anon, authenticated;
grant execute on function public.lab_export_text() to service_role;
