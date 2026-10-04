-- Feed dos Amigos (home, logo abaixo das Recomendações do Dia).
--
-- Junta três coisas que viviam separadas — "Melhores dos amigos" (home),
-- "Na watchlist dos amigos" (comunidade) e "Atividade dos amigos" (perfil) —
-- num feed estilo stories:
--
--   • cada story é a interação de um amigo com uma obra: avaliou, guardou na
--     watchlist ou escreveu uma resenha (a linha de user_movies + a resenha);
--   • o feed mostra só as 10 interações mais recentes dos amigos. Quando
--     surge uma nova, a mais antiga sai; as que ficam não expiram;
--   • quem vê pode curtir (vira sussurro 'story_like' para o amigo) e
--     comentar ('story_comment'); o dono responde no próprio story e quem
--     comentou recebe 'story_reply';
--   • ver um story apaga o anel chamativo dele (feed_story_views). Se o
--     amigo mexer de novo na obra (nova nota, resenha), o story volta ao topo
--     e acende de novo.
--
-- Os stories não têm tabela própria: saem de user_movies/reviews. Curtidas,
-- comentários e visualizações são presos ao par (dono, obra). Todo acesso é
-- pelas funções abaixo (security definer), que conferem a amizade.

-- ---------------------------------------------------------------------------
-- Novos tipos de sussurro
-- ---------------------------------------------------------------------------

alter table public.friend_indications
  drop constraint if exists recommendations_type_check;
alter table public.friend_indications
  add constraint recommendations_type_check
  check (type = any (array['movie','friend_request','new_episode','tag_unlocked','story_like','story_comment','story_reply']));

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.feed_story_likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  movie_id int not null,
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  -- descurtir só desliga (curtir de novo não manda outro sussurro)
  liked boolean not null default true,
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, owner_id, movie_id, media_type)
);
create index if not exists feed_story_likes_story_idx
  on public.feed_story_likes (owner_id, movie_id, media_type) where liked;

create table if not exists public.feed_story_comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  movie_id int not null,
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now(),
  -- removido pelo autor ou pelo dono do story (fica fora das listas)
  removed_at timestamptz
);
create index if not exists feed_story_comments_story_idx
  on public.feed_story_comments (owner_id, movie_id, media_type, created_at);
create index if not exists feed_story_comments_author_idx
  on public.feed_story_comments (author_id, created_at desc);

create table if not exists public.feed_story_views (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  movie_id int not null,
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  viewed_at timestamptz not null default now(),
  primary key (viewer_id, owner_id, movie_id, media_type)
);

-- Sem políticas: só as funções abaixo leem e escrevem.
alter table public.feed_story_likes enable row level security;
alter table public.feed_story_comments enable row level security;
alter table public.feed_story_views enable row level security;

create index if not exists user_movies_user_updated_idx
  on public.user_movies (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Um story em JSON (visto por p_viewer)
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

-- Pode ver/curtir/comentar: o dono ou um amigo dele.
create or replace function public.feed_can_access(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer is not null and (p_viewer = p_owner or public.are_friends(p_viewer, p_owner));
$$;

-- ---------------------------------------------------------------------------
-- O feed: as 10 interações mais recentes dos amigos + o seu último story
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

-- Um story avulso (aberto a partir de um sussurro).
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
  if not public.feed_can_access(uid, p_owner) then
    return null;
  end if;
  return public.feed_story_json(uid, p_owner, p_movie_id, coalesce(p_media_type, 'movie'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Visto
-- ---------------------------------------------------------------------------

create or replace function public.mark_feed_story_viewed(p_owner uuid, p_movie_id int, p_media_type text default 'movie')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or uid = p_owner or not public.are_friends(uid, p_owner) then
    return;
  end if;
  insert into public.feed_story_views (viewer_id, owner_id, movie_id, media_type, viewed_at)
  values (uid, p_owner, p_movie_id, coalesce(p_media_type, 'movie'), now())
  on conflict (viewer_id, owner_id, movie_id, media_type) do update set viewed_at = excluded.viewed_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Curtir
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
  v_title text;
  v_poster text;
  total int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if uid = p_owner or not public.are_friends(uid, p_owner) then
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

  -- o sussurro só sai na primeira curtida
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

-- ---------------------------------------------------------------------------
-- Comentários
-- ---------------------------------------------------------------------------

create or replace function public.feed_comment_json(c public.feed_story_comments, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'content', c.content,
    'created_at', c.created_at,
    'mine', c.author_id = p_viewer,
    'can_remove', c.author_id = p_viewer or c.owner_id = p_viewer,
    'author', jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url))
  from public.profiles p
  where p.id = c.author_id;
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
  if not public.feed_can_access(uid, p_owner) then
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
  if not public.feed_can_access(uid, p_owner) then
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
  -- freio contra enxurrada: até 10 comentários por minuto
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
    -- comentário de um amigo: avisa o dono
    insert into public.friend_indications (from_user_id, to_user_id, type, movie_id, movie_title, movie_poster, media_type, message, read)
    values (uid, p_owner, 'story_comment', p_movie_id, v_title, v_poster, mt, left(body, 280), false);
  else
    -- resposta do dono: avisa quem já comentou neste story
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

create or replace function public.remove_feed_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    return false;
  end if;
  update public.feed_story_comments c
  set removed_at = now()
  where c.id = p_comment_id and c.removed_at is null and (c.author_id = uid or c.owner_id = uid);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on function public.feed_story_json(uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function public.feed_comment_json(public.feed_story_comments, uuid) from public, anon, authenticated;
revoke all on function public.feed_can_access(uuid, uuid) from public, anon, authenticated;

revoke all on function public.get_friends_feed(int) from public, anon;
revoke all on function public.get_feed_story(uuid, int, text) from public, anon;
revoke all on function public.mark_feed_story_viewed(uuid, int, text) from public, anon;
revoke all on function public.toggle_feed_like(uuid, int, text) from public, anon;
revoke all on function public.get_feed_comments(uuid, int, text) from public, anon;
revoke all on function public.add_feed_comment(uuid, int, text, text) from public, anon;
revoke all on function public.remove_feed_comment(uuid) from public, anon;

grant execute on function public.get_friends_feed(int) to authenticated;
grant execute on function public.get_feed_story(uuid, int, text) to authenticated;
grant execute on function public.mark_feed_story_viewed(uuid, int, text) to authenticated;
grant execute on function public.toggle_feed_like(uuid, int, text) to authenticated;
grant execute on function public.get_feed_comments(uuid, int, text) to authenticated;
grant execute on function public.add_feed_comment(uuid, int, text, text) to authenticated;
grant execute on function public.remove_feed_comment(uuid) to authenticated;
