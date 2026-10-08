-- Feed dos Amigos: 5 stories por amigo e story oculto não é reposto.
--
--   • Cada amigo aparece com os seus 5 stories mais recentes (eram 4), e o
--     feed inteiro passa de 40 para 50 (limite máximo 75), para caber a
--     mudança.
--   • Story oculto NÃO é substituído por um mais antigo: a janela de cada
--     pessoa são as 5 interações mais recentes, e as que ela ocultou somem
--     dessa janela sem abrir vaga. Quem ocultar os 5 não aparece para
--     ninguém. (Antes, os ocultos eram tirados primeiro e os mais antigos
--     subiam para completar os 4.)
--   • "Seus stories" (o seu círculo no feed) mostra a mesma janela de 5,
--     com os ocultos marcados — o que os amigos veem é ela sem os ocultos.

create or replace function public.get_friends_feed(p_limit integer default 50)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 50), 1), 75);
  per_friend constant int := 5;
  since timestamptz := now() - interval '30 days';
  stories jsonb;
  mine jsonb;
  friends int;
begin
  if uid is null then
    return jsonb_build_object('stories', '[]'::jsonb, 'me', null, 'mine', '[]'::jsonb, 'friend_count', 0);
  end if;

  with fr as (
    select case when f.requester_id = uid then f.addressee_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = uid or f.addressee_id = uid)
  ),
  cand as (
    select um.user_id, um.movie_id, coalesce(um.media_type, 'movie') as media_type,
           greatest(um.created_at, coalesce(um.updated_at, um.created_at), coalesce(r.updated_at, r.created_at, um.created_at)) as at
    from fr
    join public.user_movies um on um.user_id = fr.fid
    left join public.reviews r
      on r.user_id = um.user_id and r.movie_id = um.movie_id and coalesce(r.media_type, 'movie') = coalesce(um.media_type, 'movie')
     and not coalesce(r.is_ai_generated, false) and nullif(trim(r.content), '') is not null
    union all
    select a.owner_id, a.id, 'achievement', a.created_at
    from fr
    join public.feed_achievement_stories a on a.owner_id = fr.fid
  ),
  recent as (
    select c.* from cand c where c.at > since
  ),
  -- A janela de cada amigo: as 5 mais recentes, ocultas incluídas…
  ranked as (
    select r.*, row_number() over (partition by r.user_id order by r.at desc, r.media_type, r.movie_id) as rn
    from recent r
  ),
  -- …e só então as ocultas saem (sem abrir vaga para uma mais antiga).
  top as (
    select k.* from ranked k
    where k.rn <= per_friend
      and not exists (
        select 1 from public.feed_hidden_stories h
        where h.owner_id = k.user_id and h.movie_id = k.movie_id and h.media_type = k.media_type and h.hidden
      )
    order by k.at desc, k.user_id, k.media_type, k.movie_id
    limit lim
  )
  select coalesce(jsonb_agg(public.feed_story_json(uid, t.user_id, t.movie_id, t.media_type) order by t.at desc, t.user_id, t.media_type, t.movie_id), '[]'::jsonb)
  into stories
  from top t;

  -- Seus stories: a mesma janela de 5 (as ocultas vêm marcadas pelo
  -- feed_story_json, para você poder mostrar de novo).
  with own as (
    select um.user_id, um.movie_id, coalesce(um.media_type, 'movie') as media_type,
           greatest(um.created_at, coalesce(um.updated_at, um.created_at), coalesce(r.updated_at, r.created_at, um.created_at)) as at
    from public.user_movies um
    left join public.reviews r
      on r.user_id = um.user_id and r.movie_id = um.movie_id and coalesce(r.media_type, 'movie') = coalesce(um.media_type, 'movie')
     and not coalesce(r.is_ai_generated, false) and nullif(trim(r.content), '') is not null
    where um.user_id = uid
    union all
    select a.owner_id, a.id, 'achievement', a.created_at
    from public.feed_achievement_stories a
    where a.owner_id = uid
  ),
  own_pick as (
    select o.* from own o
    where o.at > since
    order by o.at desc, o.media_type, o.movie_id
    limit per_friend
  )
  select coalesce(jsonb_agg(public.feed_story_json(uid, o.user_id, o.movie_id, o.media_type) order by o.at desc, o.media_type, o.movie_id), '[]'::jsonb)
  into mine
  from own_pick o;

  select count(*) into friends
  from public.friendships f
  where f.status = 'accepted' and (f.requester_id = uid or f.addressee_id = uid);

  return jsonb_build_object(
    'stories', stories,
    'mine', mine,
    'me', mine -> 0,
    'friend_count', friends
  );
end;
$function$;
