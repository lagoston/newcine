-- Feed dos Amigos: limites maiores.
--
--   • até 4 stories por amigo (eram 2);
--   • até 40 stories no feed (eram 10);
--   • o "Você" acompanha: as suas 4 interações mais recentes dos últimos 30
--     dias que não estão ocultas (as mesmas que os amigos veem) e, entre
--     elas, as que você ocultou.
--
-- A validade de 30 dias não muda.

create or replace function public.get_friends_feed(p_limit int default 40)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 40), 1), 60);
  per_friend constant int := 4;
  since timestamptz := now() - interval '30 days';
  stories jsonb;
  mine jsonb;
  friends int;
begin
  if uid is null then
    return jsonb_build_object('stories', '[]'::jsonb, 'me', null, 'mine', '[]'::jsonb, 'friend_count', 0);
  end if;

  -- amigos: só os não ocultos dos últimos 30 dias, 4 por amigo, 40 no total
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

  -- você: os mesmos 4 que os amigos veem e, entre eles, os que você ocultou
  with own as (
    select um.user_id, um.movie_id, coalesce(um.media_type, 'movie') as media_type,
           greatest(um.created_at, coalesce(um.updated_at, um.created_at), coalesce(r.updated_at, r.created_at, um.created_at)) as at,
           exists (
             select 1 from public.feed_hidden_stories h
             where h.owner_id = um.user_id and h.movie_id = um.movie_id
               and h.media_type = coalesce(um.media_type, 'movie') and h.hidden
           ) as is_hidden
    from public.user_movies um
    left join public.reviews r
      on r.user_id = um.user_id and r.movie_id = um.movie_id and coalesce(r.media_type, 'movie') = coalesce(um.media_type, 'movie')
     and not coalesce(r.is_ai_generated, false) and nullif(trim(r.content), '') is not null
    where um.user_id = uid
  ),
  own_recent as (
    select o.*,
           sum(case when o.is_hidden then 0 else 1 end)
             over (order by o.at desc, o.movie_id rows between unbounded preceding and current row) as visible_upto
    from own o
    where o.at > since
  ),
  own_pick as (
    select * from own_recent
    where (not is_hidden and visible_upto <= per_friend)
       or (is_hidden and visible_upto < per_friend)
    order by at desc, movie_id
    limit 12
  )
  select coalesce(jsonb_agg(public.feed_story_json(uid, o.user_id, o.movie_id, o.media_type) order by o.at desc, o.movie_id), '[]'::jsonb)
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
$$;
