-- O botão da Biblioteca dos Oráculos no Oracle Hub (31/10/2026) mostra
-- quantas prateleiras e quantos títulos os três oráculos guardam. Antes esse
-- número vinha junto das escolhas do painel "Escolhidos a dedo"
-- (get_oracle_hub_picks_v2), que saiu do Hub; esta função só conta.

create or replace function public.get_oracle_library_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pools as (
    select rp.movie_ids, rp.tv_ids
      from recommendation_pools rp
     where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart', 'fincher', 'cypher')
  )
  select jsonb_build_object(
    'shelves', (select count(*) from pools),
    'titles', (select count(*) from (
                 select jsonb_array_elements_text(coalesce(movie_ids, '[]'::jsonb)) from pools
                 union all
                 select jsonb_array_elements_text(coalesce(tv_ids, '[]'::jsonb)) from pools) t));
$$;
grant execute on function public.get_oracle_library_stats() to anon, authenticated;
