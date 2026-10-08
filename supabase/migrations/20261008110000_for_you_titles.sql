-- Home: "Filmes Para Você" e "Séries Para Você".
--
-- Um top 10 por tipo, tirado das 3 prateleiras (humores) favoritas do
-- usuário — a mesma ordem da Biblioteca dos Oráculos
-- (get_user_favorite_moods_order) — nos 3 oráculos (Bogart, Fincher e
-- Cypher). Ficam de fora os títulos que já estão na biblioteca dele (nota ou
-- watchlist). A ordem é a nota prevista pela fórmula de sempre
-- (predict_ratings_v4: maior expectativa primeiro), e cada título diz de
-- qual oráculo e prateleira veio (a prateleira favorita mais alta em que ele
-- mora).
--
-- Sem prateleira favorita (ninguém avaliado ainda) ou sem títulos com
-- previsão, a função devolve vazio e a home esconde a lista.

create or replace function public.get_for_you_titles__impl(
  p_user_id uuid,
  p_media_type text,
  p_limit integer default 10
)
returns table(
  id integer,
  media_type text,
  predicted_rating integer,
  chance_9plus double precision,
  card_type text,
  mood_key text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_moods text[];
  v_ids integer[];
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
begin
  if p_user_id is null or p_media_type not in ('movie', 'tv') then
    return;
  end if;

  -- As 3 prateleiras favoritas (só as que já têm alguma nota).
  select array_agg(f.mood_key order by f.score desc, f.mood_key)
  into v_moods
  from (
    select fm.mood_key, fm.score
    from public.get_user_favorite_moods_order__impl(p_user_id) fm
    where fm.score > 0
    order by fm.score desc, fm.mood_key
    limit 3
  ) f;

  if v_moods is null then
    return;
  end if;

  -- Candidatos: os títulos dessas prateleiras nos 3 oráculos, fora da
  -- biblioteca do usuário.
  select array_agg(distinct x.tid)
  into v_ids
  from public.recommendation_pools rp
  cross join lateral (
    select (e)::integer as tid
    from jsonb_array_elements_text(
      case when p_media_type = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else coalesce(rp.movie_ids, '[]'::jsonb) end
    ) e
  ) x
  where rp.card_type in ('bogart', 'fincher', 'cypher')
    and rp.mood_key = any(v_moods)
    and not exists (
      select 1 from public.user_movies um
      where um.user_id = p_user_id
        and um.movie_id = x.tid
        and coalesce(um.media_type, 'movie') = p_media_type
    );

  if v_ids is null then
    return;
  end if;

  return query
  with pred as (
    select pr.id, pr.mu, pr.predicted_rating, pr.chance_9plus
    from public.predict_ratings_v4(p_user_id, p_media_type, v_ids) pr
    where pr.mu is not null
  ),
  src as (
    select distinct on (x.tid) x.tid, rp.card_type, rp.mood_key
    from public.recommendation_pools rp
    cross join lateral (
      select (e)::integer as tid
      from jsonb_array_elements_text(
        case when p_media_type = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else coalesce(rp.movie_ids, '[]'::jsonb) end
      ) e
    ) x
    where rp.card_type in ('bogart', 'fincher', 'cypher')
      and rp.mood_key = any(v_moods)
    order by x.tid, array_position(v_moods, rp.mood_key), rp.card_type
  )
  select p.id, p_media_type, p.predicted_rating, p.chance_9plus, s.card_type, s.mood_key
  from pred p
  join src s on s.tid = p.id
  order by p.mu desc, p.id
  limit v_limit;
end;
$function$;

revoke all on function public.get_for_you_titles__impl(uuid, text, integer) from public, anon, authenticated;

-- Chamada pelo site: sempre para quem está logado.
create or replace function public.get_for_you_titles(
  p_media_type text,
  p_limit integer default 10
)
returns table(
  id integer,
  media_type text,
  predicted_rating integer,
  chance_9plus double precision,
  card_type text,
  mood_key text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select * from public.get_for_you_titles__impl(auth.uid(), p_media_type, p_limit);
$function$;

revoke all on function public.get_for_you_titles(text, integer) from public, anon;
grant execute on function public.get_for_you_titles(text, integer) to authenticated;
