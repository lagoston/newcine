-- Feed dos Amigos: pôster LENDÁRIO do Poster Jackpot vira story (02/11/2026).
--
-- Pedido do Bruno: quando alguém tira um pôster lendário na roleta, os
-- amigos veem esse momento nos stories da home, como veem uma nota ou uma
-- tag nova — com curtir, comentar, visto e ocultar funcionando igual.
--
-- Onde mora: em feed_achievement_stories, como mais um tipo de conquista
-- (kind = 'jackpot', com o id do giro em pull_id). Por que ali e não numa
-- tabela nova com um media_type novo:
--   • o "endereço" do story continua sendo media_type = 'achievement' +
--     movie_id = id da conquista. Curtidas, comentários, visualizações,
--     ocultar e os sussurros já aceitam 'achievement' (nenhuma check
--     constraint de media_type precisa abrir) e o id da conquista nunca
--     colide com o de uma tag ou evento;
--   • os sussurros de curtida/comentário já abrem stories de conquista sem
--     o botão "Ver filme" — num media_type novo, o app antigo trataria o
--     story como filme e abriria a obra errada (movie_id = id do giro).
--
-- De onde vem: gatilho AFTER INSERT em jackpot_pulls (só lendário). O
-- story é enfeite: um erro nele nunca impede o giro. Giro anulado
-- (jackpot_reset_user marca voided) some do feed na leitura — nada é
-- apagado; se um dia o giro voltar a valer, o story volta junto.
--
-- Os lendários que já saíram e não foram anulados viram story agora, com a
-- data do giro (a roleta abriu em 30/10, então todos estão dentro dos 30
-- dias do feed; os 40 lendários de teste do Bruno foram anulados no reset e
-- ficam de fora).
--
-- App antigo (o APK leva o site dentro e não se atualiza sozinho): ele não
-- sabe desenhar o story novo (sairia um cartão vazio com "feed.kind.jackpot"
-- no cabeçalho). Por isso get_friends_feed(p_limit) — a chamada dele —
-- continua devolvendo só os tipos de sempre, e o site novo pede os tipos
-- extras que sabe desenhar em get_friends_feed(p_limit, p_kinds), com
-- p_kinds = '{jackpot}'. O segundo parâmetro NÃO tem padrão de propósito:
-- assim o PostgREST nunca fica em dúvida entre as duas versões (com só
-- p_limit, só a primeira serve; com os dois, só a segunda).

-- ---------------------------------------------------------------------------
-- Conquista do tipo 'jackpot'
-- ---------------------------------------------------------------------------

alter table public.feed_achievement_stories
  add column if not exists pull_id bigint references public.jackpot_pulls(id) on delete cascade;

alter table public.feed_achievement_stories drop constraint if exists feed_achievement_stories_kind_check;
alter table public.feed_achievement_stories add constraint feed_achievement_stories_kind_check
  check (kind in ('tag', 'event', 'jackpot'));

alter table public.feed_achievement_stories drop constraint if exists feed_achievement_stories_jackpot_pull_check;
alter table public.feed_achievement_stories add constraint feed_achievement_stories_jackpot_pull_check
  check (kind <> 'jackpot' or pull_id is not null);

-- um story por giro
create unique index if not exists feed_achievement_jackpot_key
  on public.feed_achievement_stories (pull_id) where kind = 'jackpot';

-- ---------------------------------------------------------------------------
-- Giro lendário = story
-- ---------------------------------------------------------------------------

create or replace function public.trigger_feed_jackpot_story()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rarity = 'legendary' and not coalesce(new.voided, false) then
    insert into public.feed_achievement_stories (owner_id, kind, pull_id, created_at)
    values (new.user_id, 'jackpot', new.id, coalesce(new.created_at, now()))
    on conflict (pull_id) where kind = 'jackpot' do nothing;
  end if;
  return new;
exception when others then
  -- o story é enfeite: nunca impede o giro
  return new;
end;
$$;

create or replace trigger feed_jackpot_story
  after insert on public.jackpot_pulls
  for each row
  when (new.rarity = 'legendary')
  execute function public.trigger_feed_jackpot_story();

-- os lendários que já saíram (e valem) ganham o story agora
insert into public.feed_achievement_stories (owner_id, kind, pull_id, created_at)
select jp.user_id, 'jackpot', jp.id, jp.created_at
from public.jackpot_pulls jp
where jp.rarity = 'legendary' and not jp.voided
on conflict (pull_id) where kind = 'jackpot' do nothing;

-- ---------------------------------------------------------------------------
-- Momento do story: giro anulado = story que não existe (sem curtir,
-- comentar, ocultar nem abrir pelo sussurro)
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
        and (a.kind <> 'jackpot' or exists (
          select 1 from public.jackpot_pulls jp where jp.id = a.pull_id and not jp.voided))
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

-- ---------------------------------------------------------------------------
-- Sussurros de curtida/comentário: título da obra, o pôster sorteado no
-- lugar da capa, 🎰 no lugar do emoji da tag e tag_category = 'jackpot'
-- (o site novo desenha o pôster; o antigo mostra 🎰 + o título).
-- ---------------------------------------------------------------------------

create or replace function public.feed_story_notice(p_owner uuid, p_movie_id int, p_media_type text)
returns table(title text, poster text, tag_name text, tag_emoji text, tag_category text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(p_media_type, 'movie') = 'achievement' then
    -- tag: nome da tag; evento: id do evento em tag_name e a edição em title;
    -- jackpot: título da obra e o pôster sorteado
    return query
      select case when a.kind = 'tag' then a.tag_name
                  when a.kind = 'jackpot' then coalesce(mc.title_pt, mc.title_en)
                  else a.edition::text end,
             case when a.kind = 'jackpot' then pi.file_path else null::text end,
             case when a.kind = 'tag' then a.tag_name
                  when a.kind = 'jackpot' then null::text
                  else a.event_id end,
             case when a.kind = 'jackpot' then '🎰'::text else a.tag_emoji end,
             case when a.kind = 'tag' then a.tag_category
                  when a.kind = 'jackpot' then 'jackpot'::text
                  else 'event' end
      from public.feed_achievement_stories a
      left join public.jackpot_pulls jp on a.kind = 'jackpot' and jp.id = a.pull_id
      left join public.poster_items pi on pi.id = jp.item_id
      left join lateral (
        select c.title_pt, c.title_en from public.movie_cache c
        where c.tmdb_id = pi.tmdb_id and c.media_type = pi.media_type
        limit 1
      ) mc on true
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
-- O story em JSON. No jackpot:
--   • title/title_pt/title_en/poster_path/backdrop_path/release_date são os
--     da OBRA (o "Ver a obra" do visualizador abre o filme certo);
--   • 'jackpot' traz o prêmio: o pôster sorteado (file_path), raridade,
--     número de colecionador, efeito, o tipo do giro (pull_kind: 'lucky' =
--     Giro da Sorte), media_type/tmdb_id da obra, títulos e ano.
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
             'title', case when a.kind = 'jackpot' then coalesce(mc.title_pt, mc.title_en) else coalesce(a.tag_name, a.event_id) end,
             'title_pt', case when a.kind = 'jackpot' then mc.title_pt end,
             'title_en', case when a.kind = 'jackpot' then mc.title_en end,
             'poster_path', case when a.kind = 'jackpot' then mc.poster_path end,
             'poster_path_pt', case when a.kind = 'jackpot' then mc.poster_path_pt end,
             'backdrop_path', case when a.kind = 'jackpot' then mc.backdrop_path end,
             'release_date', case when a.kind = 'jackpot' then mc.release_date end,
             'rating', null::int,
             'kind', a.kind,
             'review', null::jsonb,
             'achievement', case
               when a.kind = 'tag' then jsonb_build_object(
                 'category', a.tag_category, 'name', a.tag_name, 'emoji', a.tag_emoji)
               when a.kind = 'event' then jsonb_build_object(
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
               else null::jsonb
             end
           )
           -- só o jackpot ganha a chave nova: os outros stories saem iguais
           -- ao que eram (byte a byte) para o app antigo
           || case when a.kind = 'jackpot' then jsonb_build_object(
                'jackpot', public.poster_item_json(pi) || jsonb_build_object(
                  'pull_id', jp.id,
                  'effect', jp.effect,
                  'pull_kind', jp.kind))
              else '{}'::jsonb end,
           a.created_at
    into base, v_at
    from public.feed_achievement_stories a
    join public.profiles p on p.id = a.owner_id
    left join public.seasonal_events se on se.id = a.event_id
    left join public.jackpot_pulls jp on a.kind = 'jackpot' and jp.id = a.pull_id
    left join public.poster_items pi on pi.id = jp.item_id
    left join lateral (
      select * from public.movie_cache c where c.tmdb_id = pi.tmdb_id and c.media_type = pi.media_type limit 1
    ) mc on true
    where a.id = p_movie_id and a.owner_id = p_owner
      and (a.kind <> 'jackpot' or (pi.id is not null and not jp.voided));
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
-- O feed. A versão de dois parâmetros é a de verdade; p_kinds lista os tipos
-- extras que o site sabe desenhar (hoje só 'jackpot'). Fora isso é a regra
-- de sempre (20261008100000): 5 por amigo dos últimos 30 dias, oculto não é
-- reposto, 50 no total (máx. 75), e "os seus" = a mesma janela de 5.
-- ---------------------------------------------------------------------------

create or replace function public.get_friends_feed(p_limit integer, p_kinds text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 50), 1), 75);
  per_friend constant int := 5;
  since timestamptz := now() - interval '30 days';
  with_jackpot boolean := 'jackpot' = any (coalesce(p_kinds, '{}'::text[]));
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
    where a.kind <> 'jackpot'
       or (with_jackpot and exists (
             select 1 from public.jackpot_pulls jp where jp.id = a.pull_id and not jp.voided))
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
      and (a.kind <> 'jackpot'
           or (with_jackpot and exists (
                 select 1 from public.jackpot_pulls jp where jp.id = a.pull_id and not jp.voided)))
  ),
  -- A mesma janela de 5 que os amigos veem, com as ocultas marcadas.
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
$$;

-- A chamada do app antigo: só os tipos de sempre (sem o jackpot).
create or replace function public.get_friends_feed(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.get_friends_feed(p_limit, '{}'::text[]);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on function public.trigger_feed_jackpot_story() from public, anon, authenticated;
revoke all on function public.get_friends_feed(integer, text[]) from public, anon;
grant execute on function public.get_friends_feed(integer, text[]) to authenticated;
