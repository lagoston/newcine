-- Página da pessoa: "Você e ela" passa a contar a direção (13/10/2026).
--
-- A versão de 12/10 (get_person_library_stats) só olhava o elenco, então um
-- diretor que está entre os favoritos aparecia como "nenhum título na sua
-- biblioteca". Esta conta os títulos da biblioteca de quem está vendo em que
-- a pessoa está no elenco OU na direção, e separa as duas contagens.
--
-- Direção é reconhecida por qualquer uma destas pistas (o movie_cache ainda
-- não tem o director_id em todos os títulos):
--   • movie_cache.director_id = a pessoa;
--   • sem director_id, o nome do diretor igual ao nome da pessoa
--     (em séries, o campo guarda quem criou);
--   • o filme está em person_pages.movie_directed.
--
-- A função antiga continua existindo (nada é apagado).

create or replace function public.get_person_library_overlap(p_person_id integer)
returns table (
  rated integer,
  watchlist integer,
  avg_rating numeric,
  cast_rated integer,
  directed_rated integer,
  overall_avg numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with person as (
    select
      lower(pp.name) as name,
      coalesce(
        (select array_agg((e.value ->> 'id')::integer)
           from jsonb_array_elements(coalesce(pp.movie_directed, '[]'::jsonb)) e
          where (e.value ->> 'id') ~ '^[0-9]+$'),
        '{}'::integer[]
      ) as directed_ids
    from public.person_pages pp
    where pp.tmdb_id = p_person_id
  ),
  mine as (
    select um.movie_id, coalesce(um.media_type, 'movie') as media_type, um.rating
    from public.user_movies um
    where um.user_id = auth.uid()
  ),
  tagged as (
    select
      m.rating,
      coalesce(mc.cast_members @> jsonb_build_array(jsonb_build_object('id', p_person_id)), false) as in_cast,
      (
        coalesce(mc.director_id = p_person_id, false)
        or (mc.director_id is null and mc.director is not null and lower(mc.director) = (select name from person))
        or (m.media_type = 'movie' and m.movie_id = any (coalesce((select directed_ids from person), '{}'::integer[])))
      ) as directed
    from mine m
    join public.movie_cache mc on mc.tmdb_id = m.movie_id and mc.media_type = m.media_type
  ),
  hits as (
    select * from tagged where in_cast or directed
  )
  select
    (count(*) filter (where rating is not null))::integer,
    (count(*) filter (where rating is null))::integer,
    round(avg(rating)::numeric, 1),
    (count(*) filter (where rating is not null and in_cast))::integer,
    (count(*) filter (where rating is not null and directed))::integer,
    (select round(avg(rating)::numeric, 1) from mine where rating is not null)
  from hits;
$$;

revoke all on function public.get_person_library_overlap(integer) from public;
grant execute on function public.get_person_library_overlap(integer) to authenticated;
