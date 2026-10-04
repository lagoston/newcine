-- Feed dos Amigos: conquistas viram stories.
--
--   • tag desbloqueada (básica, tema, comunidade, oráculo) = um story por tag;
--   • tags especiais NÃO viram story uma a uma. Em vez disso, concluir as
--     missões de um evento (Halloween, Natal…) gera um story especial de
--     conclusão daquela edição, com as três tags.
--
-- Os stories de conquista moram em feed_achievement_stories. No resto do
-- feed eles são "obras" do tipo media_type = 'achievement' e movie_id = id
-- da conquista, então curtidas, comentários, visualizações, ocultar e os
-- sussurros funcionam igual aos dos filmes.
--
-- De onde vêm:
--   • tag: sync_unlocked_tags_and_notify (o site manda as tags que a pessoa
--     tem; as novas viram aviso e agora também story). Na PRIMEIRA
--     sincronização de alguém tudo é "novo", então ela não gera stories —
--     só as tags que aparecerem depois;
--   • evento: gatilho em user_special_tags quando a última tag do evento
--     (a da decoração, de qualquer edição) é concedida. Quem já concluiu
--     recebe o story agora, com a data da conclusão.

-- ---------------------------------------------------------------------------
-- 'achievement' passa a valer como tipo de obra
-- ---------------------------------------------------------------------------

alter table public.feed_story_likes drop constraint if exists feed_story_likes_media_type_check;
alter table public.feed_story_likes add constraint feed_story_likes_media_type_check
  check (media_type in ('movie', 'tv', 'achievement'));

alter table public.feed_story_comments drop constraint if exists feed_story_comments_media_type_check;
alter table public.feed_story_comments add constraint feed_story_comments_media_type_check
  check (media_type in ('movie', 'tv', 'achievement'));

alter table public.feed_story_views drop constraint if exists feed_story_views_media_type_check;
alter table public.feed_story_views add constraint feed_story_views_media_type_check
  check (media_type in ('movie', 'tv', 'achievement'));

alter table public.feed_hidden_stories drop constraint if exists feed_hidden_stories_media_type_check;
alter table public.feed_hidden_stories add constraint feed_hidden_stories_media_type_check
  check (media_type in ('movie', 'tv', 'achievement'));

alter table public.friend_indications drop constraint if exists recommendations_media_type_check;
alter table public.friend_indications add constraint recommendations_media_type_check
  check (media_type in ('movie', 'tv', 'achievement'));

-- ---------------------------------------------------------------------------
-- Conquistas
-- ---------------------------------------------------------------------------

create table if not exists public.feed_achievement_stories (
  id int generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('tag', 'event')),
  -- tag
  tag_category text,
  tag_name text,
  -- tag: o emoji dela; evento: o da última tag (🎃, 🎅…)
  tag_emoji text,
  -- evento
  event_id text,
  edition int,
  created_at timestamptz not null default now()
);

create unique index if not exists feed_achievement_tag_key
  on public.feed_achievement_stories (owner_id, tag_category, tag_name) where kind = 'tag';
create unique index if not exists feed_achievement_event_key
  on public.feed_achievement_stories (owner_id, event_id, edition) where kind = 'event';
create index if not exists feed_achievement_owner_idx
  on public.feed_achievement_stories (owner_id, created_at desc);

-- Sem políticas: só as funções do feed leem.
alter table public.feed_achievement_stories enable row level security;

-- ---------------------------------------------------------------------------
-- Tag nova = story (menos as especiais e menos a 1ª sincronização)
-- ---------------------------------------------------------------------------

create or replace function public.sync_unlocked_tags_and_notify(p_user_id uuid, p_tags jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  notified_count integer := 0;
  had_before boolean;
  fresh jsonb;
begin
  perform public.assert_caller_is(p_user_id);

  had_before := exists (select 1 from user_unlocked_tags u where u.user_id = p_user_id);

  with incoming as (
    select
      (t->>'category') as category,
      (t->>'name') as tag_name,
      (t->>'emoji') as tag_emoji
    from jsonb_array_elements(p_tags) as t
  ),
  newly_unlocked as (
    insert into user_unlocked_tags (user_id, category, tag_name)
    select p_user_id, incoming.category, incoming.tag_name
    from incoming
    on conflict (user_id, category, tag_name) do nothing
    returning category, tag_name
  )
  select coalesce(jsonb_agg(jsonb_build_object('category', nu.category, 'name', nu.tag_name, 'emoji', incoming.tag_emoji)), '[]'::jsonb)
  into fresh
  from newly_unlocked nu
  join incoming on incoming.category = nu.category and incoming.tag_name = nu.tag_name;

  insert into friend_indications (
    from_user_id, to_user_id, type,
    tag_name, tag_emoji, tag_category,
    message, read
  )
  select null, p_user_id, 'tag_unlocked', f->>'name', f->>'emoji', f->>'category', null, false
  from jsonb_array_elements(fresh) f;

  get diagnostics notified_count = row_count;

  -- story para os amigos: só tags comuns (as especiais têm o story do evento)
  -- e nunca na primeira sincronização, quando tudo parece novo
  if had_before then
    insert into feed_achievement_stories (owner_id, kind, tag_category, tag_name, tag_emoji)
    select distinct on (f->>'category', f->>'name')
           p_user_id, 'tag', f->>'category', left(f->>'name', 60), left(coalesce(f->>'emoji', ''), 16)
    from jsonb_array_elements(fresh) f
    where f->>'category' in ('basic', 'theme', 'community', 'oracle')
      and nullif(btrim(f->>'name'), '') is not null
    on conflict (owner_id, tag_category, tag_name) where kind = 'tag' do nothing;
  end if;

  return notified_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Missões do evento concluídas = story especial
-- ---------------------------------------------------------------------------

-- Nível da edição a partir do id da última tag ('ho-ho-ho' = 1, 'ho-ho-ho-2' = 2…)
create or replace function public.seasonal_decoration_level(p_tag_id text, p_decoration_tag text)
returns int
language sql
immutable
as $$
  select case
    when p_tag_id = p_decoration_tag then 1
    when p_tag_id ~ ('^' || p_decoration_tag || '-[0-9]+$') then (regexp_match(p_tag_id, '-([0-9]+)$'))[1]::int
    else null
  end;
$$;

create or replace function public.trigger_feed_event_story()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  lvl int;
begin
  for e in select * from public.seasonal_events se where se.decoration_tag is not null loop
    lvl := public.seasonal_decoration_level(new.tag_id, e.decoration_tag);
    if lvl is not null then
      insert into public.feed_achievement_stories (owner_id, kind, event_id, edition, tag_emoji, created_at)
      values (
        new.user_id, 'event', e.id, e.first_edition + lvl - 1,
        (select st.emoji from public.special_tags st where st.id = new.tag_id),
        coalesce(new.unlocked_at, now())
      )
      on conflict (owner_id, event_id, edition) where kind = 'event' do nothing;
    end if;
  end loop;
  return new;
exception when others then
  -- o story é enfeite: nunca impede a tag de ser concedida
  return new;
end;
$$;

create or replace trigger feed_event_story
  after insert on public.user_special_tags
  for each row execute function public.trigger_feed_event_story();

-- quem já concluiu ganha o story agora, com a data da conclusão
insert into public.feed_achievement_stories (owner_id, kind, event_id, edition, tag_emoji, created_at)
select ust.user_id, 'event', e.id, e.first_edition + lv.lvl - 1, st.emoji, coalesce(ust.unlocked_at, now())
from public.user_special_tags ust
join public.seasonal_events e on e.decoration_tag is not null
cross join lateral (select public.seasonal_decoration_level(ust.tag_id, e.decoration_tag) as lvl) lv
left join public.special_tags st on st.id = ust.tag_id
where lv.lvl is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Momento do story (agora também das conquistas)
-- ---------------------------------------------------------------------------

create or replace function public.feed_story_at(p_owner uuid, p_movie_id int, p_media_type text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(p_media_type, 'movie') = 'achievement' then (
      select a.created_at from public.feed_achievement_stories a
      where a.id = p_movie_id and a.owner_id = p_owner
    )
    else (
      select greatest(um.created_at, coalesce(um.updated_at, um.created_at), coalesce(r.updated_at, r.created_at, um.created_at))
      from public.user_movies um
      left join public.reviews r
        on r.user_id = um.user_id and r.movie_id = um.movie_id and coalesce(r.media_type, 'movie') = coalesce(um.media_type, 'movie')
       and not coalesce(r.is_ai_generated, false) and nullif(trim(r.content), '') is not null
      where um.user_id = p_owner and um.movie_id = p_movie_id and coalesce(um.media_type, 'movie') = coalesce(p_media_type, 'movie')
      limit 1
    )
  end;
$$;

-- Título/capa/emoji gravados nos sussurros de curtida e comentário.
create or replace function public.feed_story_notice(p_owner uuid, p_movie_id int, p_media_type text)
returns table(title text, poster text, tag_name text, tag_emoji text, tag_category text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(p_media_type, 'movie') = 'achievement' then
    -- tag: nome da tag; evento: id do evento em tag_name e a edição em title
    return query
      select case when a.kind = 'tag' then a.tag_name else a.edition::text end,
             null::text,
             case when a.kind = 'tag' then a.tag_name else a.event_id end,
             a.tag_emoji,
             case when a.kind = 'tag' then a.tag_category else 'event' end
      from public.feed_achievement_stories a
      where a.id = p_movie_id and a.owner_id = p_owner;
  else
    return query
      select coalesce(mc.title_pt, mv.title, mc.title_en), coalesce(mc.poster_path_pt, mc.poster_path), null::text, null::text, null::text
      from (select 1) one
      left join public.movies mv on mv.id = p_movie_id and mv.media_type = coalesce(p_media_type, 'movie')
      left join public.movie_cache mc on mc.tmdb_id = p_movie_id and mc.media_type = coalesce(p_media_type, 'movie');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- O story em JSON: obra ou conquista + a parte social
-- ---------------------------------------------------------------------------

create or replace function public.feed_story_json(p_viewer uuid, p_owner uuid, p_movie_id int, p_media_type text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mt text := coalesce(p_media_type, 'movie');
  base jsonb;
  v_at timestamptz;
begin
  if mt = 'achievement' then
    select jsonb_build_object(
             'id', a.owner_id::text || ':achievement:' || a.id,
             'owner', jsonb_build_object(
               'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
               'avatar_frame', p.avatar_frame, 'plan_type', p.plan_type, 'active_tag', p.active_tag),
             'movie_id', a.id,
             'media_type', 'achievement',
             'title', coalesce(a.tag_name, a.event_id),
             'title_pt', null::text,
             'title_en', null::text,
             'poster_path', null::text,
             'poster_path_pt', null::text,
             'backdrop_path', null::text,
             'release_date', null::text,
             'rating', null::int,
             'kind', a.kind,
             'review', null::jsonb,
             'achievement', case
               when a.kind = 'tag' then jsonb_build_object(
                 'category', a.tag_category, 'name', a.tag_name, 'emoji', a.tag_emoji)
               else jsonb_build_object(
                 'event_id', a.event_id,
                 'edition', a.edition,
                 'level', greatest(1, a.edition - se.first_edition + 1),
                 'emoji', a.tag_emoji,
                 'tags', (
                   select coalesce(jsonb_agg(jsonb_build_object('tag', st.id, 'name', st.name, 'emoji', st.emoji) order by s.ord), '[]'::jsonb)
                   from jsonb_array_elements(se.steps) with ordinality as s(v, ord)
                   join public.special_tags st
                     on st.id = public.seasonal_edition_tag(s.v->>'tag', greatest(1, a.edition - se.first_edition + 1))
                 ))
             end
           ),
           a.created_at
    into base, v_at
    from public.feed_achievement_stories a
    join public.profiles p on p.id = a.owner_id
    left join public.seasonal_events se on se.id = a.event_id
    where a.id = p_movie_id and a.owner_id = p_owner;
  else
    select jsonb_build_object(
             'id', um.user_id::text || ':' || m.media_type || ':' || um.movie_id,
             'owner', jsonb_build_object(
               'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
               'avatar_frame', p.avatar_frame, 'plan_type', p.plan_type, 'active_tag', p.active_tag),
             'movie_id', um.movie_id,
             'media_type', m.media_type,
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
               'has_spoilers', coalesce(r.has_spoilers, false)) end
           ),
           greatest(um.created_at, coalesce(um.updated_at, um.created_at), coalesce(r.updated_at, r.created_at, um.created_at))
    into base, v_at
    from public.user_movies um
    cross join lateral (select coalesce(um.media_type, 'movie') as media_type) m
    join public.profiles p on p.id = um.user_id
    left join public.movies mv on mv.id = um.movie_id and mv.media_type = m.media_type
    left join lateral (
      select * from public.movie_cache c where c.tmdb_id = um.movie_id and c.media_type = m.media_type limit 1
    ) mc on true
    left join lateral (
      select * from public.reviews rv
      where rv.user_id = um.user_id and rv.movie_id = um.movie_id and coalesce(rv.media_type, 'movie') = m.media_type
        and not coalesce(rv.is_ai_generated, false) and nullif(trim(rv.content), '') is not null
      limit 1
    ) r on true
    where um.user_id = p_owner and um.movie_id = p_movie_id and m.media_type = mt;
  end if;

  if base is null then
    return null;
  end if;

  return base || jsonb_build_object(
    'activity_at', v_at,
    'hidden', public.feed_story_hidden(p_owner, p_movie_id, mt),
    'like_count', (
      select count(*) from public.feed_story_likes l
      where l.owner_id = p_owner and l.movie_id = p_movie_id and l.media_type = mt and l.liked),
    'liked', p_viewer is not null and exists (
      select 1 from public.feed_story_likes l
      where l.user_id = p_viewer and l.owner_id = p_owner and l.movie_id = p_movie_id and l.media_type = mt and l.liked),
    'likers', (
      select coalesce(jsonb_agg(jsonb_build_object('username', x.username, 'avatar_url', x.avatar_url) order by x.updated_at desc), '[]'::jsonb)
      from (
        select lp.username, lp.avatar_url, l.updated_at
        from public.feed_story_likes l
        join public.profiles lp on lp.id = l.user_id
        where l.owner_id = p_owner and l.movie_id = p_movie_id and l.media_type = mt and l.liked
        order by l.updated_at desc
        limit 3
      ) x),
    'comment_count', (
      select count(*) from public.feed_story_comments c
      where c.owner_id = p_owner and c.movie_id = p_movie_id and c.media_type = mt and c.removed_at is null),
    'seen', p_viewer is not null and (p_viewer = p_owner or exists (
      select 1 from public.feed_story_views v
      where v.viewer_id = p_viewer and v.owner_id = p_owner and v.movie_id = p_movie_id
        and v.media_type = mt and v.viewed_at >= v_at))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- O feed: obras + conquistas (4 por amigo, 40 no total, 30 dias)
-- ---------------------------------------------------------------------------

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
  visible as (
    select c.* from cand c
    where c.at > since
      and not exists (
        select 1 from public.feed_hidden_stories h
        where h.owner_id = c.user_id and h.movie_id = c.movie_id and h.media_type = c.media_type and h.hidden
      )
  ),
  ranked as (
    select v.*, row_number() over (partition by v.user_id order by v.at desc, v.media_type, v.movie_id) as rn
    from visible v
  ),
  top as (
    select * from ranked where rn <= per_friend order by at desc, user_id, media_type, movie_id limit lim
  )
  select coalesce(jsonb_agg(public.feed_story_json(uid, t.user_id, t.movie_id, t.media_type) order by t.at desc, t.user_id, t.media_type, t.movie_id), '[]'::jsonb)
  into stories
  from top t;

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
  own_flagged as (
    select o.*, exists (
             select 1 from public.feed_hidden_stories h
             where h.owner_id = o.user_id and h.movie_id = o.movie_id and h.media_type = o.media_type and h.hidden
           ) as is_hidden
    from own o
    where o.at > since
  ),
  own_recent as (
    select o.*,
           sum(case when o.is_hidden then 0 else 1 end)
             over (order by o.at desc, o.media_type, o.movie_id rows between unbounded preceding and current row) as visible_upto
    from own_flagged o
  ),
  own_pick as (
    select * from own_recent
    where (not is_hidden and visible_upto <= per_friend)
       or (is_hidden and visible_upto < per_friend)
    order by at desc, media_type, movie_id
    limit 12
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
$$;

-- ---------------------------------------------------------------------------
-- Curtir, comentar e ocultar valem para conquistas
-- ---------------------------------------------------------------------------

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
  n record;
  total int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if uid = p_owner or not public.feed_story_visible(uid, p_owner, p_movie_id, mt) then
    raise exception 'not_allowed';
  end if;
  if public.feed_story_at(p_owner, p_movie_id, mt) is null then
    raise exception 'story_not_found';
  end if;

  insert into public.feed_story_likes as l (user_id, owner_id, movie_id, media_type, liked)
  values (uid, p_owner, p_movie_id, mt, true)
  on conflict (user_id, owner_id, movie_id, media_type)
  do update set liked = not l.liked, updated_at = now()
  returning l.liked, l.notified into now_liked, was_notified;

  if now_liked and not was_notified then
    select * into n from public.feed_story_notice(p_owner, p_movie_id, mt);

    insert into public.friend_indications (from_user_id, to_user_id, type, movie_id, movie_title, movie_poster, media_type, tag_name, tag_emoji, tag_category, read)
    values (uid, p_owner, 'story_like', p_movie_id, n.title, n.poster, mt, n.tag_name, n.tag_emoji, n.tag_category, false);

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
  n record;
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
  if public.feed_story_at(p_owner, p_movie_id, mt) is null then
    raise exception 'story_not_found';
  end if;
  if (select count(*) from public.feed_story_comments c
      where c.author_id = uid and c.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.feed_story_comments (author_id, owner_id, movie_id, media_type, content)
  values (uid, p_owner, p_movie_id, mt, body)
  returning * into v_row;

  select * into n from public.feed_story_notice(p_owner, p_movie_id, mt);

  if uid <> p_owner then
    insert into public.friend_indications (from_user_id, to_user_id, type, movie_id, movie_title, movie_poster, media_type, tag_name, tag_emoji, tag_category, message, read)
    values (uid, p_owner, 'story_comment', p_movie_id, n.title, n.poster, mt, n.tag_name, n.tag_emoji, n.tag_category, left(body, 280), false);
  else
    insert into public.friend_indications (from_user_id, to_user_id, type, movie_id, movie_title, movie_poster, media_type, tag_name, tag_emoji, tag_category, message, read)
    select uid, a.author_id, 'story_reply', p_movie_id, n.title, n.poster, mt, n.tag_name, n.tag_emoji, n.tag_category, left(body, 280), false
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
  if public.feed_story_at(uid, p_movie_id, mt) is null then
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
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on function public.trigger_feed_event_story() from public, anon, authenticated;
revoke all on function public.feed_story_notice(uuid, int, text) from public, anon, authenticated;
revoke all on function public.feed_story_at(uuid, int, text) from public, anon, authenticated;
revoke all on function public.feed_story_json(uuid, uuid, int, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sincronização feita pela home (em segundo plano)
-- ---------------------------------------------------------------------------
-- A home passa a conferir as tags de tempos em tempos para os stories de
-- tag nova saírem sem a pessoa abrir o modal de Tags. Na PRIMEIRA vez de
-- alguém, ela só registra o que a pessoa já tem — sem sussurro e sem story
-- (seriam dezenas de "tag nova" de tags antigas). Daí em diante é a mesma
-- sincronização de sempre.

create or replace function public.sync_unlocked_tags_from_home(p_user_id uuid, p_tags jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_caller_is(p_user_id);
  if not exists (select 1 from public.user_unlocked_tags u where u.user_id = p_user_id) then
    insert into public.user_unlocked_tags (user_id, category, tag_name)
    select p_user_id, t->>'category', t->>'name'
    from jsonb_array_elements(p_tags) as t
    where nullif(btrim(t->>'name'), '') is not null
    on conflict (user_id, category, tag_name) do nothing;
    return 0;
  end if;
  return public.sync_unlocked_tags_and_notify(p_user_id, p_tags);
end;
$$;

revoke all on function public.sync_unlocked_tags_from_home(uuid, jsonb) from public, anon;
grant execute on function public.sync_unlocked_tags_from_home(uuid, jsonb) to authenticated;
