-- "Filmes/Séries Para Você": guarda o resultado por usuário.
--
-- Prever os ~700 títulos das 3 prateleiras favoritas leva 1,5s; a home
-- não pode esperar isso a cada visita. A função pública passa a guardar o
-- top 20 de cada tipo em for_you_cache e só recalcula quando a biblioteca
-- da pessoa muda (quantidade de títulos ou última alteração), quando as
-- prateleiras dos oráculos mudam ou depois de 24 horas.

create table if not exists public.for_you_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  fingerprint text not null,
  items jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (user_id, media_type)
);

-- Sem políticas: só a função abaixo (security definer) lê e escreve.
alter table public.for_you_cache enable row level security;
revoke all on table public.for_you_cache from anon, authenticated;

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
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  v_fp text;
  v_items jsonb;
  v_cached public.for_you_cache%rowtype;
begin
  if uid is null or p_media_type not in ('movie', 'tv') then
    return;
  end if;

  -- Impressão digital da biblioteca + das prateleiras.
  select count(*)::text || ':' ||
         coalesce(floor(extract(epoch from max(greatest(um.created_at, coalesce(um.updated_at, um.created_at)))))::bigint::text, '0')
  into v_fp
  from public.user_movies um
  where um.user_id = uid;

  v_fp := v_fp || ':' || coalesce((
    select floor(extract(epoch from max(rp.updated_at)))::bigint::text from public.recommendation_pools rp
  ), '0');

  select * into v_cached
  from public.for_you_cache c
  where c.user_id = uid and c.media_type = p_media_type;

  if found and v_cached.fingerprint = v_fp and v_cached.computed_at > now() - interval '24 hours' then
    v_items := v_cached.items;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'media_type', f.media_type,
             'predicted_rating', f.predicted_rating,
             'chance_9plus', f.chance_9plus,
             'card_type', f.card_type,
             'mood_key', f.mood_key
           ) order by f.ord), '[]'::jsonb)
    into v_items
    from public.get_for_you_titles__impl(uid, p_media_type, 20)
      with ordinality as f(id, media_type, predicted_rating, chance_9plus, card_type, mood_key, ord);

    insert into public.for_you_cache as c (user_id, media_type, fingerprint, items, computed_at)
    values (uid, p_media_type, v_fp, v_items, now())
    on conflict on constraint for_you_cache_pkey
    do update set fingerprint = excluded.fingerprint, items = excluded.items, computed_at = excluded.computed_at;
  end if;

  return query
  select (x.e->>'id')::integer,
         x.e->>'media_type',
         (x.e->>'predicted_rating')::integer,
         (x.e->>'chance_9plus')::double precision,
         x.e->>'card_type',
         x.e->>'mood_key'
  from jsonb_array_elements(v_items) with ordinality as x(e, n)
  order by x.n
  limit v_limit;
end;
$function$;

revoke all on function public.get_for_you_titles(text, integer) from public, anon;
grant execute on function public.get_for_you_titles(text, integer) to authenticated;
