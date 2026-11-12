-- 11/11/2026 — O trailer na porta "A Mesa dos Oráculos" da home (pedido do Bruno).
--
-- No primeiro segundo da home, o conteúdo da porta desliza para o lado e roda,
-- sem som, o trailer de um dos filmes mais recomendados para a pessoa nas três
-- prateleiras favoritas dela (a partir dos 10 s, para pular as vinhetas do
-- começo). Tocar no trailer abre o filme.
--
-- Esta função só escolhe os candidatos: até 12 filmes das três prateleiras da
-- Persona (mesa_top3), ainda não avaliados, na ordem da nota prevista (o vetor
-- da Mesa, mesa_user_vec); sem vetor, na ordem do público. Quem não tem as três
-- prateleiras ainda recebe os mais recomendados do acervo inteiro. Os títulos
-- que sabidamente não têm trailer (movie_cache.trailer = '{}') ficam de fora;
-- o trailer conhecido vai junto (trailer_key), e o site pergunta ao TMDB pelos
-- que ainda não se sabe.
--
-- Leve de propósito (roda na abertura da home): não calcula vetor nenhum; quem
-- não tem vetor fica com a ordem do público. Só leitura; nada é apagado.

create or replace function public.get_home_trailer_pick()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_top3 text[];
  v_has_vec boolean;
  v_items jsonb;
begin
  if v_uid is null or exists (select 1 from bot_accounts b where b.user_id = v_uid) then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;

  v_top3 := coalesce(mesa_top3(v_uid), '{}'::text[]);
  v_has_vec := exists (select 1 from mesa_user_vec uv where uv.user_id = v_uid and uv.media_type = 'movie');

  with vec as (
    select u.id, u.mu
      from mesa_user_vec uv
      cross join lateral unnest(uv.ids, uv.mu) as u(id, mu)
     where uv.user_id = v_uid and uv.media_type = 'movie'
  ),
  pool as (
    select t.tmdb_id as id, v.mu, t.vote_avg, t.vote_count, mc.trailer->>'key' as trailer_key
      from mesa_titles t
      left join vec v on v.id = t.tmdb_id
      left join movie_cache mc on mc.tmdb_id = t.tmdb_id and mc.media_type = 'movie'
     where t.media_type = 'movie'
       and (cardinality(v_top3) = 0 or t.mood = any(v_top3))
       -- '{}' = o título não tem trailer (null = ainda não se sabe)
       and (mc.trailer is null or mc.trailer <> '{}'::jsonb)
       and not exists (select 1 from user_movies um
                        where um.user_id = v_uid and um.movie_id = t.tmdb_id
                          and um.media_type = 'movie' and um.rating is not null)
  ),
  top as (
    select p.*
      from pool p
     order by case when v_has_vec then p.mu end desc nulls last,
              p.vote_avg desc nulls last,
              p.vote_count desc nulls last,
              p.id
     limit 12
  )
  select jsonb_agg(jsonb_build_object('id', top.id,
                                      'mu', round(top.mu::numeric, 2),
                                      'trailer_key', top.trailer_key)
                   order by case when v_has_vec then top.mu end desc nulls last, top.vote_avg desc nulls last, top.vote_count desc nulls last, top.id)
    into v_items
    from top;

  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'moods', to_jsonb(v_top3));
end;
$function$;

revoke all on function public.get_home_trailer_pick() from public, anon;
grant execute on function public.get_home_trailer_pick() to authenticated;
