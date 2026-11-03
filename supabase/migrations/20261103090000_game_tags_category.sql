-- 03/11/2026 (tarde, adendo das 13h22) — pacote T: a categoria de tag "Jogos".
--
-- Pedido do Bruno: as conquistas do pôquer viram tags de uma categoria nova,
-- Jogos (vermelha), e a roleta do Poster Jackpot ganha as suas. Nome em
-- inglês, um emoji que nenhuma outra tag do site usa.
--
-- Onde mora: em special_tags, com a coluna nova `category` ('special' por
-- padrão — as edições II, III… dos eventos continuam nascendo especiais —;
-- 'games' nas 16 tags abaixo). A posse continua em user_special_tags. O site
-- separa as duas pela coluna: as de Jogos vão para a aba própria e viram pins
-- com category 'games' (profiles.active_tag.category = 'games').
--
-- Aviso e story: diferente das especiais de evento, uma tag de Jogos nova
-- vira o sussurro "Tag desbloqueada" e o story no Feed dos Amigos, como as
-- básicas e as de tema. Quem decide é o banco, na hora em que a tag é
-- concedida (gatilho em user_special_tags), pelo mesmo registro de "tag já
-- vista" do resto do site (user_unlocked_tags, categoria 'games'):
--   • a pessoa nunca sincronizou as tags (sem nenhuma linha lá) → nada agora:
--     a primeira sincronização da home registra tudo calada, como sempre;
--   • senão, registra; se a linha é nova → sussurro + story.
-- O app novo também manda as tags de Jogos na sincronização (e acha a linha
-- já lá); o app antigo não conhece a categoria e as manda como 'special' —
-- o banco troca para 'games' antes de registrar, para não avisar duas vezes.
-- Tags de Jogos vindas do aparelho só contam se a pessoa tem a tag no banco
-- (nada que vire aviso ou story depende do relato do cliente).
--
-- Feed: o app antigo não sabe desenhar um story de categoria 'games' (sairia
-- a chave do texto crua), então get_friends_feed só devolve esses stories a
-- quem pede 'games' em p_kinds — o mesmo esquema do story do lendário.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.sync_unlocked_tags_and_notify(uuid,jsonb)', '1a5b66d77451b0dd7a9234abd0ed2d87'),
      ('public.sync_unlocked_tags_from_home(uuid,jsonb)', '96de9abf0dedc5393b327ffdb5e8ff97'),
      ('public.get_friends_feed(integer,text[])', '7c9e9d0c6061cc08a434062f68e57990')
    ) v(sig, expected)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.expected then
      raise exception 'A função % mudou em produção desde 03/11/2026: releia com pg_get_functiondef antes de aplicar', r.sig;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- A coluna da categoria
-- ---------------------------------------------------------------------------

alter table public.special_tags add column if not exists category text not null default 'special';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'special_tags_category_check') then
    alter table public.special_tags add constraint special_tags_category_check check (category in ('special', 'games'));
  end if;
end $$;

-- Nas tags de Jogos, nome e emoji não se repetem (o registro de "tag vista" e
-- o story são pelo nome; o emoji único é regra do Bruno). A conferência contra
-- as outras categorias foi feita à mão nesta migração (src/lib/tags.ts, as
-- especiais e as edições dos eventos, a sala secreta).
create unique index if not exists special_tags_games_name_key on public.special_tags (name) where category = 'games';
create unique index if not exists special_tags_games_emoji_key on public.special_tags (emoji) where category = 'games';

-- ---------------------------------------------------------------------------
-- As 16 tags
-- ---------------------------------------------------------------------------
-- requirement_data: source ('poker' | 'jackpot'), e nas que têm contador,
-- metric + goal (o banco concede por eles; o modal de Tags mostra o progresso
-- com get_my_game_tag_progress()). As do pôquer seguem escondidas até o
-- lançamento do Pôster Poker (starts_at em 2100); quem concede é o fim do
-- torneio no servidor (poker_award_marks). As do Jackpot valem desde a
-- abertura da roleta para todos (31/10, 01h de Brasília).

-- As 5 do pôquer que já existiam: só nome, emoji, textos e categoria (os ids ficam).
update public.special_tags set
  name = 'All-in', emoji = '♠️', category = 'games',
  description = 'First tournament won. I gave it a 10. Don''t tell anyone.',
  description_pt = 'Primeiro torneio vencido. Dei nota 10. Não conta pra ninguém.',
  requirement_description = 'Win your first Poster Poker tournament',
  requirement_description_pt = 'Vença o seu primeiro torneio do Pôster Poker',
  requirement_data = coalesce(requirement_data, '{}'::jsonb) || '{"source": "poker", "metric": "poker_wins", "goal": 1}'::jsonb
where id = 'poker-first-win';

update public.special_tags set
  name = 'Outfoxed', emoji = '🎯', category = 'games',
  description = 'Took me off the table in a tournament. Few can say that. Say it.',
  description_pt = 'Me tirou da mesa num torneio. Poucos podem dizer isso. Diga.',
  requirement_description = 'Knock out the Fox in a tournament',
  requirement_description_pt = 'Elimine o Raposo num torneio',
  requirement_data = coalesce(requirement_data, '{}'::jsonb) || '{"source": "poker"}'::jsonb
where id = 'poker-fox-hunter';

update public.special_tags set
  name = 'Clean Sweep', emoji = '🧹', category = 'games',
  description = 'Knocked out all three in one tournament. A gorgeous massacre. I''m jealous.',
  description_pt = 'Eliminou os três no mesmo torneio. Que massacre lindo. Fiquei com inveja.',
  requirement_description = 'Knock out all three oracles in the same tournament',
  requirement_description_pt = 'Elimine os três oráculos no mesmo torneio',
  requirement_data = coalesce(requirement_data, '{}'::jsonb) || '{"source": "poker"}'::jsonb
where id = 'poker-clean-sweep';

update public.special_tags set
  name = 'Poker Face', emoji = '😐', category = 'games',
  description = 'Took a big pot with the worse hand, and nobody saw. I did. Bravo.',
  description_pt = 'Levou um pote grande com a pior mão, e ninguém viu. Eu vi. Aplaudo.',
  requirement_description = 'Win a pot of 20+ big blinds without showdown when an opponent who folded had the better hand',
  requirement_description_pt = 'Leve um pote de 20 BB ou mais sem showdown quando um oponente que desistiu tinha mão melhor',
  requirement_data = coalesce(requirement_data, '{}'::jsonb) || '{"source": "poker"}'::jsonb
where id = 'poker-oscar-bluff';

update public.special_tags set
  name = 'Seven Nights', emoji = '🌙', category = 'games',
  description = 'Seven straight days of tournaments. I don''t watch that many films a week.',
  description_pt = 'Sete dias seguidos de torneio. Nem eu vejo tanto filme numa semana.',
  requirement_description = 'Play a tournament on 7 days in a row (Brasília time)',
  requirement_description_pt = 'Jogue torneio 7 dias seguidos (dia de Brasília)',
  requirement_data = coalesce(requirement_data, '{}'::jsonb) || '{"source": "poker"}'::jsonb
where id = 'poker-seven-nights';

-- As 4 novas do pôquer (escondidas) e as 7 do Jackpot (valendo).
insert into public.special_tags (
  id, name, emoji, category, description, description_pt, requirement_description, requirement_description_pt,
  starts_at, ends_at, requirement_type, requirement_data
) values
  ('poker-high-stakes', 'High Stakes', '💎', 'games',
   'Put a poster from your collection on the table and walked out with two. Nerve pays.',
   'Apostou um pôster da coleção e saiu da mesa com dois. Coragem paga.',
   'Win a tournament with a poster from your collection as the stake',
   'Vença um torneio apostando um pôster da sua coleção',
   '2100-01-01 00:00:00+00', null, 'custom', '{"source": "poker"}'),
  ('poker-royal-flush', 'Royal Flush', '⚜️', 'games',
   'Beat the legendary table, the toughest one. Even the Snake went quiet.',
   'Venceu a mesa do lendário, a mais difícil. Até a Cobra ficou quieta.',
   'Win a legendary tournament',
   'Vença um torneio lendário',
   '2100-01-01 00:00:00+00', null, 'custom', '{"source": "poker"}'),
  ('poker-full-house', 'Full House', '🖼️', 'games',
   'All nine Poster Poker posters on the wall. A full house.',
   'Os nove pôsteres do Pôster Poker na parede. Casa cheia.',
   'Own all 9 Poster Poker posters',
   'Tenha os 9 pôsteres do Pôster Poker',
   '2100-01-01 00:00:00+00', null, 'custom', '{"source": "poker", "metric": "poker_posters", "goal": 9}'),
  ('poker-card-shark', 'Card Shark', '🦈', 'games',
   'Ten tournaments won. The table smells you coming.',
   'Dez torneios vencidos. A mesa já sente o cheiro de longe.',
   'Win 10 tournaments',
   'Vença 10 torneios',
   '2100-01-01 00:00:00+00', null, 'custom', '{"source": "poker", "metric": "poker_wins", "goal": 10}'),
  ('jackpot-gambler', 'Gambler', '🎰', 'games',
   'Ten spins on the wheel. The machine knows your name now.',
   'Dez giros na roleta. A máquina já sabe o seu nome.',
   'Spin the Poster Jackpot wheel 10 times (with a regular or special chip)',
   'Dê 10 giros na roleta do Poster Jackpot (com ficha comum ou especial)',
   '2026-10-31 04:00:00+00', null, 'custom', '{"source": "jackpot", "metric": "spins", "goal": 10}'),
  ('jackpot-high-roller', 'High Roller', '💸', 'games',
   'A hundred spins. At this table, the chips never cool down.',
   'Cem giros. Nesta mesa, a ficha nunca esfria.',
   'Spin the wheel 100 times (with a regular or special chip)',
   'Dê 100 giros na roleta (com ficha comum ou especial)',
   '2026-10-31 04:00:00+00', null, 'custom', '{"source": "jackpot", "metric": "spins", "goal": 100}'),
  ('jackpot-lucky-charm', 'Lucky Charm', '🍀', 'games',
   'Filled the bar and spun for free. Luck likes the stubborn.',
   'Encheu a barra e girou de graça. A sorte gosta de quem insiste.',
   'Use your first Lucky Spin',
   'Use o seu primeiro Giro da Sorte',
   '2026-10-31 04:00:00+00', null, 'custom', '{"source": "jackpot", "metric": "lucky_spins", "goal": 1}'),
  ('jackpot-jackpot', 'Jackpot', '💰', 'games',
   'The wheel stopped on gold. First legendary in the collection.',
   'A roleta parou no dourado. Primeiro lendário na coleção.',
   'Pull your first legendary poster',
   'Tire o seu primeiro pôster lendário',
   '2026-10-31 04:00:00+00', null, 'custom', '{"source": "jackpot", "metric": "legendary_pulls", "goal": 1}'),
  ('jackpot-shiny-hunter', 'Shiny Hunter', '🌈', 'games',
   'Ten posters with an effect. The collection glows in the dark.',
   'Dez pôsteres com efeito. A coleção brilha no escuro.',
   'Have 10 posters with an effect',
   'Tenha 10 pôsteres com efeito',
   '2026-10-31 04:00:00+00', null, 'custom', '{"source": "jackpot", "metric": "effect_posters", "goal": 10}'),
  ('jackpot-croupier', 'Croupier', '🤝', 'games',
   'Ten trades with friends. Now you''re the one dealing.',
   'Dez trocas com amigos. Agora quem distribui é você.',
   'Make 10 poster trades with friends',
   'Faça 10 trocas de pôster com amigos',
   '2026-10-31 04:00:00+00', null, 'custom', '{"source": "jackpot", "metric": "trades", "goal": 10}'),
  ('jackpot-curator', 'Curator', '🗃️', 'games',
   'Fifty posters in the collection. Time to open a museum.',
   'Cinquenta pôsteres na coleção. Já dá para abrir um museu.',
   'Have 50 posters in your collection',
   'Tenha 50 pôsteres na coleção',
   '2026-10-31 04:00:00+00', null, 'custom', '{"source": "jackpot", "metric": "posters", "goal": 50}')
on conflict (id) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  category = excluded.category,
  description = excluded.description,
  description_pt = excluded.description_pt,
  requirement_description = excluded.requirement_description,
  requirement_description_pt = excluded.requirement_description_pt,
  requirement_data = excluded.requirement_data;

-- ---------------------------------------------------------------------------
-- Sincronização das tags vistas (aviso + story)
-- ---------------------------------------------------------------------------

-- A lista de tags que o aparelho mandou, já arrumada: tag de Jogos (pelo
-- nome, mandada como 'games' ou, pelo app antigo, como 'special') só entra se
-- a pessoa tem a tag no banco, com o nome e o emoji do banco.
create or replace function public.normalize_synced_tags(p_user_id uuid, p_tags jsonb)
returns table (category text, tag_name text, tag_emoji text)
language sql
stable
security definer
set search_path = public
as $$
  with raw as (
    select (t->>'category') as category, (t->>'name') as tag_name, (t->>'emoji') as tag_emoji
    from jsonb_array_elements(case when jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end) as t
  )
  select r.category, r.tag_name, r.tag_emoji
  from raw r
  where r.category is distinct from 'games'
    and not (r.category = 'special'
             and exists (select 1 from special_tags g where g.category = 'games' and g.name = r.tag_name))
  union
  select 'games', g.name, g.emoji
  from raw r
  join special_tags g on g.category = 'games' and g.name = r.tag_name
  join user_special_tags u on u.user_id = p_user_id and u.tag_id = g.id
  where r.category in ('games', 'special');
$$;
revoke all on function public.normalize_synced_tags(uuid, jsonb) from public, anon, authenticated;

create or replace function public.sync_unlocked_tags_and_notify(p_user_id uuid, p_tags jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  notified_count integer := 0;
  had_before boolean;
  fresh jsonb;
begin
  perform public.assert_caller_is(p_user_id);

  had_before := exists (select 1 from user_unlocked_tags u where u.user_id = p_user_id);

  -- 03/11/2026: a lista passa por normalize_synced_tags (tags de Jogos conferidas no banco).
  with incoming as (
    select n.category, n.tag_name, n.tag_emoji
    from public.normalize_synced_tags(p_user_id, p_tags) n
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

  if had_before then
    insert into feed_achievement_stories (owner_id, kind, tag_category, tag_name, tag_emoji)
    select distinct on (f->>'category', f->>'name')
           p_user_id, 'tag', f->>'category', left(f->>'name', 60), left(coalesce(f->>'emoji', ''), 16)
    from jsonb_array_elements(fresh) f
    -- 03/11/2026: as de Jogos também viram story (as especiais de evento continuam fora).
    where f->>'category' in ('basic', 'theme', 'community', 'oracle', 'games')
      and nullif(btrim(f->>'name'), '') is not null
    on conflict (owner_id, tag_category, tag_name) where kind = 'tag' do nothing;
  end if;

  return notified_count;
end;
$function$;

create or replace function public.sync_unlocked_tags_from_home(p_user_id uuid, p_tags jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_caller_is(p_user_id);
  if not exists (select 1 from public.user_unlocked_tags u where u.user_id = p_user_id) then
    -- 03/11/2026: mesma arrumação da lista (tags de Jogos como 'games', conferidas).
    insert into public.user_unlocked_tags (user_id, category, tag_name)
    select p_user_id, n.category, n.tag_name
    from public.normalize_synced_tags(p_user_id, p_tags) n
    where nullif(btrim(n.tag_name), '') is not null
    on conflict (user_id, category, tag_name) do nothing;
    return 0;
  end if;
  return public.sync_unlocked_tags_and_notify(p_user_id, p_tags);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Tag de Jogos concedida → registro de "vista" + sussurro + story
-- ---------------------------------------------------------------------------
-- cineoracle.game_tags_silent = 'on' (só dentro de uma migração): registra
-- como já avisada, sem sussurro nem story — para as concessões em lote de
-- quem já merecia a tag no dia em que ela nasceu.
create or replace function public.trigger_game_tag_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st record;
  n int;
begin
  select s.name, s.emoji, s.category into st from special_tags s where s.id = new.tag_id;
  if not found or st.category is distinct from 'games' then
    return null;
  end if;
  if exists (select 1 from bot_accounts b where b.user_id = new.user_id) then
    return null;
  end if;
  -- Quem nunca sincronizou as tags: a primeira sincronização da home registra
  -- tudo calada (sync_unlocked_tags_from_home), inclusive esta.
  if not exists (select 1 from user_unlocked_tags u where u.user_id = new.user_id) then
    return null;
  end if;

  insert into user_unlocked_tags (user_id, category, tag_name)
  values (new.user_id, 'games', st.name)
  on conflict (user_id, category, tag_name) do nothing;
  get diagnostics n = row_count;
  if n = 0 or coalesce(current_setting('cineoracle.game_tags_silent', true), '') = 'on' then
    return null;
  end if;

  insert into friend_indications (from_user_id, to_user_id, type, tag_name, tag_emoji, tag_category, message, read)
  values (null, new.user_id, 'tag_unlocked', st.name, st.emoji, 'games', null, false);

  insert into feed_achievement_stories (owner_id, kind, tag_category, tag_name, tag_emoji, created_at)
  values (new.user_id, 'tag', 'games', left(st.name, 60), left(coalesce(st.emoji, ''), 16), coalesce(new.unlocked_at, now()))
  on conflict (owner_id, tag_category, tag_name) where kind = 'tag' do nothing;
  return null;
exception when others then
  -- O aviso é enfeite: um erro aqui nunca desfaz a concessão da tag.
  raise warning 'game tag notice (user_special_tags): %', sqlerrm;
  return null;
end;
$$;
revoke all on function public.trigger_game_tag_unlocked() from public, anon, authenticated;

create or replace trigger game_tag_unlocked
  after insert on public.user_special_tags
  for each row execute function public.trigger_game_tag_unlocked();

-- ---------------------------------------------------------------------------
-- Feed: stories de tag de Jogos só para quem pede 'games' em p_kinds
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_friends_feed(p_limit integer, p_kinds text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 50), 1), 75);
  per_friend constant int := 5;
  since timestamptz := now() - interval '30 days';
  with_jackpot boolean := 'jackpot' = any (coalesce(p_kinds, '{}'::text[]));
  -- 03/11/2026: stories de tag da categoria Jogos só para quem sabe desenhá-los (o app antigo não tem a categoria).
  with_games boolean := 'games' = any (coalesce(p_kinds, '{}'::text[]));
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
    where (a.kind <> 'jackpot'
           or (with_jackpot and exists (
                 select 1 from public.jackpot_pulls jp where jp.id = a.pull_id and not jp.voided)))
      and (with_games or a.kind <> 'tag' or a.tag_category is distinct from 'games')
  ),
  recent as (
    select c.* from cand c where c.at > since
  ),
  ranked as (
    select r.*, row_number() over (partition by r.user_id order by r.at desc, r.media_type, r.movie_id) as rn
    from recent r
  ),
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
      and (with_games or a.kind <> 'tag' or a.tag_category is distinct from 'games')
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
