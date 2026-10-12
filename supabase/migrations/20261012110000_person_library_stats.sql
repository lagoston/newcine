-- Página da pessoa: "você e ela" (12/10/2026). Quantos títulos da biblioteca
-- de quem está vendo têm essa pessoa no elenco (os 10 primeiros nomes que o
-- movie_cache guarda), a média das notas dadas a eles e a média geral da
-- pessoa, para comparar. Filmes e séries juntos.
--
-- O índice GIN deixa a busca "quem tem o ator X no elenco" rápida em todo o
-- movie_cache.

create index if not exists movie_cache_cast_members_gin
  on public.movie_cache using gin (cast_members jsonb_path_ops);

create or replace function public.get_person_library_stats(p_person_id integer)
returns table (rated integer, watchlist integer, avg_rating numeric, overall_avg numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select um.movie_id, coalesce(um.media_type, 'movie') as media_type, um.rating
    from public.user_movies um
    where um.user_id = auth.uid()
  ),
  with_person as (
    select m.rating
    from mine m
    join public.movie_cache mc on mc.tmdb_id = m.movie_id and mc.media_type = m.media_type
    where mc.cast_members @> jsonb_build_array(jsonb_build_object('id', p_person_id))
  )
  select
    (select count(*) from with_person where rating is not null)::integer,
    (select count(*) from with_person where rating is null)::integer,
    (select round(avg(rating)::numeric, 1) from with_person where rating is not null),
    (select round(avg(rating)::numeric, 1) from mine where rating is not null);
$$;

grant execute on function public.get_person_library_stats(integer) to authenticated;
