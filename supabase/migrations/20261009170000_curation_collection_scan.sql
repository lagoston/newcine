-- Sagas dos filmes das prateleiras (09/10/2026).
--
-- Para avaliar a ideia do Bruno de pôr nas prateleiras as sagas dos filmes que
-- já estão nelas, é preciso saber a coleção do TMDB de cada filme curado. O
-- site só descobre isso quando alguém abre o filme (função de borda
-- movie-collection, que grava em movie_collections / movie_collection_parts /
-- movie_collection_checks). curation.collection_check(ids) chama a mesma
-- função de borda pelo pg_net para uma lista de filmes, de uma vez — o
-- resultado é o mesmo de alguém abrir cada filme, e o botão de saga do menu
-- já passa a aparecer pronto.

create table if not exists curation.collection_requests (
  req_id bigint primary key,
  movie_id integer not null,
  sent_at timestamptz not null default now()
);

create or replace function curation.collection_check(p_movie_ids integer[])
returns integer
language plpgsql
security definer
set search_path to 'curation', 'public'
as $$
declare
  v_id bigint;
  v_m integer;
  v_n integer := 0;
begin
  foreach v_m in array p_movie_ids loop
    select net.http_post(
      url := 'https://hewixvcatnuqftalzmtg.supabase.co/functions/v1/movie-collection',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhld2l4dmNhdG51cWZ0YWx6bXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MTY3NDMsImV4cCI6MjA2MDM5Mjc0M30.wK9jnuFFje_AtzqokWiuVYq2otYKW3rLPrIczw6ggFs'),
      body := jsonb_build_object('movieId', v_m),
      timeout_milliseconds := 60000
    ) into v_id;
    insert into curation.collection_requests (req_id, movie_id) values (v_id, v_m);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function curation.collection_check(integer[]) from public, anon, authenticated;

-- Detalhes do TMDB das continuações candidatas (curation.tmdb_get com kind
-- 'movie_details'; as respostas são copiadas do net._http_response para cá).
create table if not exists curation.movie_details (
  id integer primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Continuações candidatas: filmes das coleções do TMDB que têm pelo menos um
-- filme nas prateleiras e que ainda não estão em nenhuma. O oráculo segue a
-- regra de sempre (Bogart: 2000+ e 500+ votos; Fincher: até 1999 e 200+;
-- Cypher: o resto) e o humor é o dos irmãos já curados (o mais comum; no
-- empate, o do mais antigo). O piso de qualidade (lançado, 60+ min, nota 6,0+
-- e 100+ votos) é aplicado na consulta que usa a view.
create or replace view curation.saga_candidates as
with pm as (
  select (x)::int m, rp.card_type, rp.mood_key from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.movie_ids) x where rp.mood_key <> 'random-surprise'
),
sc as (select distinct p.collection_id from movie_collection_parts p join pm on pm.m = p.movie_id),
cand as (
  select p.movie_id, min(p.collection_id) collection_id, max(p.title_pt) title_pt
  from movie_collection_parts p join sc using (collection_id)
  where not exists (select 1 from pm where pm.m = p.movie_id)
  group by p.movie_id
),
sib as (
  select c.movie_id, pm.mood_key, pm.card_type, mc.release_date, p2.movie_id sib_id
  from cand c join movie_collection_parts p2 on p2.collection_id = c.collection_id
  join pm on pm.m = p2.movie_id
  left join movie_cache mc on mc.tmdb_id = p2.movie_id and mc.media_type = 'movie'
),
mood as (
  select distinct on (movie_id) movie_id, mood_key, n_sib from (
    select movie_id, mood_key, count(*) over (partition by movie_id, mood_key) k, count(*) over (partition by movie_id) n_sib, release_date
    from sib) z
  order by movie_id, k desc, release_date nulls last
),
rat as (
  select um.movie_id, count(*) n_all, count(*) filter (where b.user_id is null) n_real, round(avg(um.rating), 1) avg_all
  from user_movies um left join bot_accounts b on b.user_id = um.user_id
  where um.rating is not null and um.media_type = 'movie' group by um.movie_id
)
select c.movie_id, c.collection_id, mcol.name_pt saga, coalesce(c.title_pt, d.data->>'title') title_pt, d.data->>'title' title_en,
  nullif(d.data->>'release_date', '')::date release_date, (d.data->>'vote_average')::numeric va, (d.data->>'vote_count')::int vc,
  (d.data->>'runtime')::int runtime, (d.data->>'adult')::boolean adult, d.data->>'original_language' lang,
  (select string_agg(g->>'name', '/') from jsonb_array_elements(d.data->'genres') g) genres,
  m.mood_key, m.n_sib,
  case when extract(year from nullif(d.data->>'release_date', '')::date) >= 2000 and (d.data->>'vote_count')::int >= 500 then 'bogart'
       when extract(year from nullif(d.data->>'release_date', '')::date) < 2000 and (d.data->>'vote_count')::int >= 200 then 'fincher'
       else 'cypher' end oracle,
  coalesce(r.n_all, 0) n_rated, coalesce(r.n_real, 0) n_real, r.avg_all
from cand c
join curation.movie_details d on d.id = c.movie_id
left join movie_collections mcol on mcol.id = c.collection_id
left join mood m on m.movie_id = c.movie_id
left join rat r on r.movie_id = c.movie_id;
