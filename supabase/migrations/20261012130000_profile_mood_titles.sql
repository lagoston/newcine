-- Roda dos humores do perfil (12/10/2026): em que prateleira (humor) está
-- cada filme avaliado de alguém. O perfil cruza isso com as palavras-chave
-- dos filmes para mostrar os temas mais bem avaliados em cada humor.
--
-- Mesma regra da personalidade (refresh_user_persona): só filmes, só os
-- avaliados, prateleiras dos três oráculos (sem a Surpresa Aleatória).
-- Mesma visibilidade da biblioteca (can_view_user_content).

create or replace function public.get_profile_mood_titles(p_user_id uuid)
returns table (movie_id integer, mood_key text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct um.movie_id, rp.mood_key
    from public.user_movies um
    join public.recommendation_pools rp on rp.mood_key <> 'random-surprise'
   cross join lateral jsonb_array_elements(rp.movie_ids) e(value)
   where um.user_id = p_user_id
     and um.rating is not null
     and um.media_type = 'movie'
     and (e.value #>> '{}')::integer = um.movie_id
     and public.can_view_user_content(p_user_id);
$$;

revoke all on function public.get_profile_mood_titles(uuid) from public;
grant execute on function public.get_profile_mood_titles(uuid) to anon, authenticated;
