-- Feed dos Amigos: o dono pode ocultar um story da visão dos amigos.
--
-- O story oculto some do feed dos amigos (a próxima interação dele toma o
-- lugar entre as 10), não abre por link de sussurro e não aceita curtidas
-- nem comentários de mais ninguém. O dono continua vendo o próprio story,
-- com a marca de oculto, e pode mostrá-lo de novo quando quiser. Vale para
-- o par (dono, obra): uma nota nova na mesma obra continua oculta.

create table if not exists public.feed_hidden_stories (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  movie_id int not null,
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  -- mostrar de novo só desliga (nada é apagado)
  hidden boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (owner_id, movie_id, media_type)
);

alter table public.feed_hidden_stories enable row level security;

create or replace function public.feed_story_hidden(p_owner uuid, p_movie_id int, p_media_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select h.hidden from public.feed_hidden_stories h
    where h.owner_id = p_owner and h.movie_id = p_movie_id and h.media_type = coalesce(p_media_type, 'movie')
  ), false);
$$;

-- Quem vê este story: o dono sempre; um amigo, se não estiver oculto.
create or replace function public.feed_story_visible(p_viewer uuid, p_owner uuid, p_movie_id int, p_media_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer is not null and (
    p_viewer = p_owner
    or (public.are_friends(p_viewer, p_owner) and not public.feed_story_hidden(p_owner, p_movie_id, p_media_type))
  );
$$;

-- Ocultar / mostrar o próprio story.
create or replace function public.toggle_feed_story_hidden(p_movie_id int, p_media_type text default 'movie')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mt text := coalesce(p_media_type, 'movie');
  now_hidden boolean;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.user_movies um
    where um.user_id = uid and um.movie_id = p_movie_id and coalesce(um.media_type, 'movie') = mt
  ) then
    raise exception 'story_not_found';
  end if;

  insert into public.feed_hidden_stories as h (owner_id, movie_id, media_type, hidden)
  values (uid, p_movie_id, mt, true)
  on conflict (owner_id, movie_id, media_type)
  do update set hidden = not h.hidden, updated_at = now()
  returning h.hidden into now_hidden;

  return jsonb_build_object('hidden', now_hidden);
end;
$$;

-- ---------------------------------------------------------------------------
-- O story em JSON ganha `hidden`
-- ---------------------------------------------------------------------------

create or replace function public.feed_story_json(p_viewer uuid, p_owner uuid, p_movie_id int, p_media_type text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', um.user_id::text || ':' || mt.media_type || ':' || um.movie_id,
    'owner', jsonb_build_object(
      'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
      'avatar_frame', p.avatar_frame, 'plan_type', p.plan_type, 'active_tag', p.active_tag),
    'movie_id', um.movie_id,
    'media_type', mt.media_type,
    'title', coalesce(mv.title, mc.title_pt, mc.title_en),
    'title_pt', mc.title_pt,
    'title_en', mc.title_en,
    'poster_path', mc.poster_path,
    'poster_path_pt', mc.poster_path_pt,
    'backdrop_path', mc.backdrop_path,
    'release_date', coalesce(mc.release_date, mv.release_date),
    'rating', um.rating,
    'kind', case when r.id is not null then 'review' when um.rating is null then 'watchlist' else 'rate' end,
    'review', case when r.id is null then null else jsonb_build_object(
      'title', r.title,
      'excerpt', left(r.content, 320),
      'truncated', char_length(r.content) > 320,
      'has_spoilers', coalesce(r.has_spoilers, false)) end,
    'activity_at', act.at,
    'hidden', public.feed_story_hidden(um.user_id, um.movie_id, mt.media_type),
    'like_count', (
      select count(*) from public.feed_story_likes l
      where l.owner_id = um.user_id and l.movie_id = um.movie_id and l.media_type = mt.media_type and l.liked),
    'liked', p_viewer is not null and exists (
      select 1 from public.feed_story_likes l
      where l.user_id = p_viewer and l.owner_id = um.user_id and l.movie_id = um.movie_id
        and l.media_type = mt.media_type and l.liked),
    'likers', (
      select coalesce(jsonb_agg(jsonb_build_object('username', x.username, 'avatar_url', x.avatar_url) order by x.updated_at desc), '[]'::jsonb)
      from (
        select lp.username, lp.avatar_url, l.updated_at
        from public.feed_story_likes l
        join public.profiles lp on lp.id = l.user_id
        where l.owner_id = um.user_id and l.movie_id = um.movie_id and l.media_type = mt.media_type and l.liked
        order by l.updated_at desc
        limit 3
      ) x),
    'comment_count', (
      select count(*) from public.feed_story_comments c
      where c.owner_id = um.user_id and c.movie_id = um.movie_id and c.media_type = mt.media_type and c.removed_at is null),
    'seen', p_viewer is not null and (p_viewer = um.user_id or exists (
      select 1 from public.feed_story_views v
      where v.viewer_id = p_viewer and v.owner_id = um.user_id and v.movie_id = um.movie_id
        and v.media_type = mt.media_type and v.viewed_at >= act.at))
  )
  from public.user_movies um
  cross join lateral (select coalesce(um.media_type, 'movie') as media_type) mt
  join public.profiles p on p.id = um.user_id
  left join public.movies mv on mv.id = um.movie_id and mv.media_type = mt.media_type
  left join lateral (
    select * from public.movie_cache c where c.tmdb_id = um.movie_id and c.media_type = mt.media_type limit 1
  ) mc on true
  left join lateral (
    select * from public.reviews rv
    where rv.user_id = um.user_id and rv.movie_id = um.movie_id and coalesce(rv.media_type, 'movie') = mt.media_type
      and not coalesce(rv.is_ai_generated, false) and nullif(trim(rv.content), '') is not null
    limit 1
  ) r on true
  cross join lateral (
    select greatest(um.created_at, coalesce(um.updated_at, um.created_at), coalesce(r.updated_at, r.created_at, um.created_at)) as at
  ) act
  where um.user_id = p_owner and um.movie_id = p_movie_id and mt.media_type = coalesce(p_media_type, 'movie');
$$;

-- ---------------------------------------------------------------------------
-- O feed deixa de fora os ocultos (o seu, em `me`, aparece sempre)
-- ---------------------------------------------------------------------------

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
  top as (
    select * from cand order by at desc, user_id, movie_id limit lim
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
  ) x;

  select count(*) into friends
  from public.friendships f
  where f.status = 'accepted' and (f.requester_id = uid or f.addressee_id = uid);

  return jsonb_build_object('stories', stories, 'me', mine, 'friend_count', friends);
end;
$$;

-- ---------------------------------------------------------------------------
-- Story oculto: não abre, não recebe curtida nem comentário de amigos
-- ---------------------------------------------------------------------------

create or replace function public.get_feed_story(p_owner uuid, p_movie_id int, p_media_type text default 'movie')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if not public.feed_story_visible(uid, p_owner, p_movie_id, p_media_type) then
    return null;
  end if;
  return public.feed_story_json(uid, p_owner, p_movie_id, coalesce(p_media_type, 'movie'));
end;
$$;

create or replace function public.toggle_feed_like(p_owner uuid, p_movie_id int, p_media_type text default 'movie')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mt text := coalesce(p_media_type, 'movie');
  now_liked boolean;
  was_notified boolean;
  v_title text;
  v_poster text;
  total int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if uid = p_owner or not public.feed_story_visible(uid, p_owner, p_movie_id, mt) then
    raise exception 'not_allowed';
  end if;
  if not exists (
    select 1 from public.user_movies um
    where um.user_id = p_owner and um.movie_id = p_movie_id and coalesce(um.media_type, 'movie') = mt
  ) then
    raise exception 'story_not_found';
  end if;

  insert into public.feed_story_likes as l (user_id, owner_id, movie_id, media_type, liked)
  values (uid, p_owner, p_movie_id, mt, true)
  on conflict (user_id, owner_id, movie_id, media_type)
  do update set liked = not l.liked, updated_at = now()
  returning l.liked, l.notified into now_liked, was_notified;

  if now_liked and not was_notified then
    select coalesce(mc.title_pt, mv.title, mc.title_en), coalesce(mc.poster_path_pt, mc.poster_path)
    into v_title, v_poster
    from (select 1) one
    left join public.movies mv on mv.id = p_movie_id and mv.media_type = mt
    left join public.movie_cache mc on mc.tmdb_id = p_movie_id and mc.media_type = mt;

    insert into public.friend_indications (from_user_id, to_user_id, type, movie_id, movie_title, movie_poster, media_type, read)
    values (uid, p_owner, 'story_like', p_movie_id, v_title, v_poster, mt, false);

    update public.feed_story_likes
    set notified = true
    where user_id = uid and owner_id = p_owner and movie_id = p_movie_id and media_type = mt;
  end if;

  select count(*) into total
  from public.feed_story_likes l
  where l.owner_id = p_owner and l.movie_id = p_movie_id and l.media_type = mt and l.liked;

  return jsonb_build_object('liked', now_liked, 'like_count', total);
end;
$$;

create or replace function public.get_feed_comments(p_owner uuid, p_movie_id int, p_media_type text default 'movie')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_out jsonb;
begin
  if not public.feed_story_visible(uid, p_owner, p_movie_id, p_media_type) then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(public.feed_comment_json(x, uid) order by x.created_at), '[]'::jsonb)
  into v_out
  from (
    select * from public.feed_story_comments c
    where c.owner_id = p_owner and c.movie_id = p_movie_id and c.media_type = coalesce(p_media_type, 'movie')
      and c.removed_at is null
    order by c.created_at desc
    limit 100
  ) x;
  return v_out;
end;
$$;

create or replace function public.add_feed_comment(p_owner uuid, p_movie_id int, p_media_type text, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mt text := coalesce(p_media_type, 'movie');
  body text := btrim(coalesce(p_content, ''));
  v_row public.feed_story_comments;
  v_title text;
  v_poster text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.feed_story_visible(uid, p_owner, p_movie_id, mt) then
    raise exception 'not_allowed';
  end if;
  if char_length(body) = 0 or char_length(body) > 500 then
    raise exception 'invalid_content';
  end if;
  if not exists (
    select 1 from public.user_movies um
    where um.user_id = p_owner and um.movie_id = p_movie_id and coalesce(um.media_type, 'movie') = mt
  ) then
    raise exception 'story_not_found';
  end if;
  if (select count(*) from public.feed_story_comments c
      where c.author_id = uid and c.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.feed_story_comments (author_id, owner_id, movie_id, media_type, content)
  values (uid, p_owner, p_movie_id, mt, body)
  returning * into v_row;

  select coalesce(mc.title_pt, mv.title, mc.title_en), coalesce(mc.poster_path_pt, mc.poster_path)
  into v_title, v_poster
  from (select 1) one
  left join public.movies mv on mv.id = p_movie_id and mv.media_type = mt
  left join public.movie_cache mc on mc.tmdb_id = p_movie_id and mc.media_type = mt;

  if uid <> p_owner then
    insert into public.friend_indications (from_user_id, to_user_id, type, movie_id, movie_title, movie_poster, media_type, message, read)
    values (uid, p_owner, 'story_comment', p_movie_id, v_title, v_poster, mt, left(body, 280), false);
  else
    insert into public.friend_indications (from_user_id, to_user_id, type, movie_id, movie_title, movie_poster, media_type, message, read)
    select uid, a.author_id, 'story_reply', p_movie_id, v_title, v_poster, mt, left(body, 280), false
    from (
      select distinct c.author_id
      from public.feed_story_comments c
      where c.owner_id = p_owner and c.movie_id = p_movie_id and c.media_type = mt
        and c.removed_at is null and c.author_id <> p_owner
    ) a;
  end if;

  return public.feed_comment_json(v_row, uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on function public.feed_story_hidden(uuid, int, text) from public, anon, authenticated;
revoke all on function public.feed_story_visible(uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function public.feed_story_json(uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function public.toggle_feed_story_hidden(int, text) from public, anon;
grant execute on function public.toggle_feed_story_hidden(int, text) to authenticated;
