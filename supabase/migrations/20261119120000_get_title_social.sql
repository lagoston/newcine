-- 19/11/2026 — Protocolo Reborn, onda 3 do banco (rede.md, A3 e 4.3).
--
-- As bolhas "quem já viu este título" (src/components/movieDetails/
-- useTitleFriends.ts) são uma cascata de 4 a 11 consultas EM SÉRIE a cada
-- título aberto: friendships → user_movies → profiles → reviews; se sobram
-- vagas, reviews de outras pessoas → profiles → user_movies; se ainda sobram,
-- get_friends_of_friends → user_movies → profiles → reviews. No 4G, cada ida
-- custa 100–300 ms.
--
-- get_title_social devolve numa ida a mesma lista que o hook monta: até
-- p_limit (5) objetos { user_id, username, avatar_url, rating, review_title,
-- is_watchlist_only? }, na mesma ordem de grupos:
--   1. amigos que avaliaram (sorteados), depois amigos que só têm na watchlist
--      (rating null, is_watchlist_only true);
--   2. se sobram vagas: resenhas com título de qualquer pessoa ainda não
--      mostrada (sorteadas);
--   3. se ainda sobram: amigos de amigos que avaliaram, depois os que só têm
--      na watchlist.
-- 'Unknown' quando o perfil não é visível, como no hook.
--
-- RPC NOVA (só acréscimo). SECURITY INVOKER de propósito: cada leitura roda
-- com as políticas de quem chama (profile_visibility, contas escondidas,
-- private.rls_hidden_owner_ids()), então a função só enxerga o que a pessoa
-- logada já enxerga pelas tabelas — não há regra de privacidade copiada à mão.
-- Sem login devolve [] (o hook também não roda sem login).
--
-- Duas diferenças pequenas para o hook, as duas para o lado mais certo:
--   • no nível 2 o hook busca a nota da pessoa só pelo número do título, sem
--     o tipo (filme/série com o mesmo número se misturam); aqui vale a nota
--     do mesmo tipo e, só se não houver, a do outro;
--   • o hook olha "as 20 primeiras" resenhas sem ordem definida; aqui são as
--     20 mais antigas. Hoje nenhum título tem mais de 1 resenha.
-- Nenhum índice novo: user_movies (movie_id, media_type), reviews (movie_id,
-- media_type) e friendships (requester_id) / (addressee_id) já existem.

create or replace function public.get_title_social(
  p_id integer,
  p_media_type text default 'movie',
  p_limit integer default 5
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_mt text := case when p_media_type = 'tv' then 'tv' else 'movie' end;
  v_max integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_out jsonb := '[]'::jsonb;
  v_used uuid[] := '{}';
  v_part jsonb;
  v_ids uuid[];
begin
  if v_uid is null or p_id is null then
    return '[]'::jsonb;
  end if;

  -- Nível 1: amigos (quem avaliou primeiro, depois quem só tem na watchlist)
  with friends as (
    select distinct case when f.requester_id = v_uid then f.addressee_id else f.requester_id end as fid
      from friendships f
     where f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid)
  ),
  pick as (
    select um.user_id, um.rating, random() as rnd
      from user_movies um
      join friends on friends.fid = um.user_id
     where um.movie_id = p_id and um.media_type = v_mt
     order by (um.rating is null), rnd
     limit v_max
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'user_id', pick.user_id,
             'username', coalesce(nullif(p.username, ''), 'Unknown'),
             'avatar_url', nullif(p.avatar_url, ''),
             'rating', pick.rating,
             'review_title', case when pick.rating is not null then nullif(rv.title, '') end)
           || case when pick.rating is null then jsonb_build_object('is_watchlist_only', true) else '{}'::jsonb end
           order by (pick.rating is null), pick.rnd), '[]'::jsonb),
         coalesce(array_agg(pick.user_id), '{}')
    into v_part, v_ids
    from pick
    left join profiles p on p.id = pick.user_id
    left join reviews rv on rv.user_id = pick.user_id and rv.movie_id = p_id and rv.media_type = v_mt;
  v_out := v_out || v_part;
  v_used := v_used || v_ids;

  -- Nível 2: resenhas com título de quem ainda não apareceu
  if jsonb_array_length(v_out) < v_max then
    with pick as (
      select r.user_id, r.title, random() as rnd
        from (select r0.user_id, r0.title
                from reviews r0
               where r0.movie_id = p_id and r0.media_type = v_mt and r0.title is not null
               order by r0.created_at, r0.id
               limit 20) r
       where r.user_id <> all(v_used)
       order by rnd
       limit v_max - jsonb_array_length(v_out)
    )
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'user_id', pick.user_id,
               'username', coalesce(nullif(p.username, ''), 'Unknown'),
               'avatar_url', nullif(p.avatar_url, ''),
               'rating', (select um.rating from user_movies um
                           where um.movie_id = p_id and um.user_id = pick.user_id
                           order by (um.media_type = v_mt) desc
                           limit 1),
               'review_title', pick.title)
             order by pick.rnd), '[]'::jsonb),
           coalesce(array_agg(pick.user_id), '{}')
      into v_part, v_ids
      from pick
      left join profiles p on p.id = pick.user_id;
    v_out := v_out || v_part;
    v_used := v_used || v_ids;
  end if;

  -- Nível 3: amigos de amigos (mesma prioridade do nível 1)
  if jsonb_array_length(v_out) < v_max then
    with pick as (
      select um.user_id, um.rating, random() as rnd
        from user_movies um
       where um.movie_id = p_id and um.media_type = v_mt
         and um.user_id in (select g.user_id from get_friends_of_friends(v_uid) g)
         and um.user_id <> all(v_used)
       order by (um.rating is null), rnd
       limit v_max - jsonb_array_length(v_out)
    )
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'user_id', pick.user_id,
               'username', coalesce(nullif(p.username, ''), 'Unknown'),
               'avatar_url', nullif(p.avatar_url, ''),
               'rating', pick.rating,
               'review_title', case when pick.rating is not null then nullif(rv.title, '') end)
             || case when pick.rating is null then jsonb_build_object('is_watchlist_only', true) else '{}'::jsonb end
             order by (pick.rating is null), pick.rnd), '[]'::jsonb)
      into v_part
      from pick
      left join profiles p on p.id = pick.user_id
      left join reviews rv on rv.user_id = pick.user_id and rv.movie_id = p_id and rv.media_type = v_mt;
    v_out := v_out || v_part;
  end if;

  return v_out;
end;
$function$;

revoke all on function public.get_title_social(integer, text, integer) from public, anon;
grant execute on function public.get_title_social(integer, text, integer) to authenticated, service_role;

comment on function public.get_title_social(integer, text, integer) is
  '19/11/2026 (Reborn): as bolhas de quem já viu o título numa ida só (amigos, resenhas, amigos de amigos; até p_limit). Mesmo resultado do hook useTitleFriends. SECURITY INVOKER: só o que quem chama já enxerga.';
