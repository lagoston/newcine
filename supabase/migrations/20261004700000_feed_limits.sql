-- Feed dos Amigos: validade e limite por amigo.
--
--   • um story vale 30 dias (contados do momento da interação). Depois disso
--     sai do feed, não abre mais por sussurro para os amigos e não aceita
--     curtidas nem comentários. O dono continua abrindo o próprio;
--   • no máximo 2 stories por amigo entre os 10 do feed: as 2 interações
--     mais recentes de cada um, e dessas as 10 mais recentes no total.
--   • o seu ("Você") também só aparece se a sua última interação tiver
--     menos de 30 dias.

-- Momento do story: o maior entre a entrada na biblioteca, a última
-- mudança dela e a resenha (as do Oráculo não contam).
create or replace function public.feed_story_at(p_owner uuid, p_movie_id int, p_media_type text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(um.created_at, coalesce(um.updated_at, um.created_at), coalesce(r.updated_at, r.created_at, um.created_at))
  from public.user_movies um
  left join public.reviews r
    on r.user_id = um.user_id and r.movie_id = um.movie_id and coalesce(r.media_type, 'movie') = coalesce(um.media_type, 'movie')
   and not coalesce(r.is_ai_generated, false) and nullif(trim(r.content), '') is not null
  where um.user_id = p_owner and um.movie_id = p_movie_id and coalesce(um.media_type, 'movie') = coalesce(p_media_type, 'movie')
  limit 1;
$$;

-- Quem vê este story: o dono sempre; um amigo, se não estiver oculto nem
-- vencido (30 dias).
create or replace function public.feed_story_visible(p_viewer uuid, p_owner uuid, p_movie_id int, p_media_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer is not null and (
    p_viewer = p_owner
    or (
      public.are_friends(p_viewer, p_owner)
      and not public.feed_story_hidden(p_owner, p_movie_id, p_media_type)
      and coalesce(public.feed_story_at(p_owner, p_movie_id, p_media_type) > now() - interval '30 days', false)
    )
  );
$$;

create or replace function public.get_friends_feed(p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 10), 1), 30);
  per_friend constant int := 2;
  since timestamptz := now() - interval '30 days';
  stories jsonb;
  mine jsonb;
  friends int;
begin
  if uid is null then
    return jsonb_build_object('stories', '[]'::jsonb, 'me', null, 'friend_count', 0);
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
    where not exists (
      select 1 from public.feed_hidden_stories h
      where h.owner_id = um.user_id and h.movie_id = um.movie_id
        and h.media_type = coalesce(um.media_type, 'movie') and h.hidden
    )
  ),
  ranked as (
    select c.*, row_number() over (partition by c.user_id order by c.at desc, c.movie_id) as rn
    from cand c
    where c.at > since
  ),
  top as (
    select * from ranked where rn <= per_friend order by at desc, user_id, movie_id limit lim
  )
  select coalesce(jsonb_agg(public.feed_story_json(uid, t.user_id, t.movie_id, t.media_type) order by t.at desc, t.user_id, t.movie_id), '[]'::jsonb)
  into stories
  from top t;

  select public.feed_story_json(uid, x.user_id, x.movie_id, x.media_type)
  into mine
  from (
    select um.user_id, um.movie_id, coalesce(um.media_type, 'movie') as media_type,
           greatest(um.created_at, coalesce(um.updated_at, um.created_at), coalesce(r.updated_at, r.created_at, um.created_at)) as at
    from public.user_movies um
    left join public.reviews r
      on r.user_id = um.user_id and r.movie_id = um.movie_id and coalesce(r.media_type, 'movie') = coalesce(um.media_type, 'movie')
     and not coalesce(r.is_ai_generated, false) and nullif(trim(r.content), '') is not null
    where um.user_id = uid
    order by at desc
    limit 1
  ) x
  where x.at > since;

  select count(*) into friends
  from public.friendships f
  where f.status = 'accepted' and (f.requester_id = uid or f.addressee_id = uid);

  return jsonb_build_object('stories', stories, 'me', mine, 'friend_count', friends);
end;
$$;

revoke all on function public.feed_story_at(uuid, int, text) from public, anon, authenticated;
revoke all on function public.feed_story_visible(uuid, uuid, int, text) from public, anon, authenticated;
