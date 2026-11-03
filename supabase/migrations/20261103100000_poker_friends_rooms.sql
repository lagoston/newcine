-- Pôster Poker — fase 3, pacote F3 (03/11/2026): mesa COM AMIGOS — salas, convites,
-- pôsteres de efeito e aposta de pôster (o lobby). A partida em si (estado, relógio,
-- fim) está em 20261103101000_poker_friends_match.sql.
--
-- Segurança: as tabelas novas têm RLS ligada e nenhuma política (o aparelho não lê
-- nem escreve nada direto). Toda escrita passa pela Edge poker-friends, que chama as
-- RPCs poker_room_* com a service role (poker_assert_service) e o uid do token. As
-- leituras sem cartas (get_poker_friends_home, get_poker_invites) são autenticadas e
-- só mostram o que é da própria pessoa. O tempo real é Broadcast privado
-- (tópico 'poker-room:<id>'), autorizado por RLS em realtime.messages para membros.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.poker_rooms (
  id uuid primary key default gen_random_uuid(),
  -- 6 letras/números sem os ambíguos (I, O, 0, 1).
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'closed')),
  -- null = sem aposta; senão cada pessoa aposta um pôster desta raridade.
  stake_rarity text check (stake_rarity in ('common', 'rare', 'epic', 'legendary')),
  -- Sobe a cada mudança; vai no ping do tempo real (o aparelho compara com o seu).
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  closed_reason text,
  -- A partida: só o servidor lê. O aparelho recebe a visão dele pela Edge.
  effects jsonb not null default '[]'::jsonb,
  seats jsonb,
  seed text,
  seed_hash text,
  engine_hash text,
  state_version smallint,
  proto smallint,
  params_version jsonb,
  state jsonb,
  events_tail jsonb not null default '[]'::jsonb,
  seq integer not null default 0,
  to_act text,
  deadline_at timestamptz,
  hands integer not null default 0,
  last_action_at timestamptz,
  start_idem uuid,
  winner_user uuid references public.profiles(id) on delete set null,
  winner_oracle text,
  result jsonb
);

create index if not exists poker_rooms_due on public.poker_rooms (deadline_at) where status = 'playing';
create index if not exists poker_rooms_by_host on public.poker_rooms (host_id, created_at desc);
create index if not exists poker_rooms_lobby_age on public.poker_rooms (updated_at) where status = 'lobby';

create table if not exists public.poker_room_members (
  room_id uuid not null references public.poker_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined', 'declined', 'left', 'expired')),
  via text not null default 'invite' check (via in ('host', 'invite', 'code')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  left_at timestamptz,
  updated_at timestamptz not null default now(),
  ready boolean not null default false,
  -- Até 2 pôsteres gold do Pôster Poker (poster_items.id) que levam o efeito para a mesa.
  effect_items integer[] not null default '{}' check (cardinality(effect_items) <= 2),
  stake_item_id integer references public.poster_items(id),
  stake_effect text check (stake_effect in ('none', 'holo', 'negative', 'ultra_red')),
  -- held = travado (no lobby e na partida); returned = voltou ao dono; transferred = foi
  -- para quem venceu (stake_to); lost = ficou com o oráculo vencedor (vira devolução).
  stake_status text check (stake_status in ('held', 'returned', 'transferred', 'lost')),
  stake_to uuid references public.profiles(id) on delete set null,
  -- Na partida.
  seat smallint check (seat between 0 and 3),
  player_id text,
  away boolean not null default false,
  timeouts smallint not null default 0,
  place smallint check (place between 1 and 4),
  out_reason text,
  -- Repetição de rede do act (a mesma resposta).
  last_idem uuid,
  last_seq integer,
  last_response jsonb,
  primary key (room_id, user_id)
);

create index if not exists poker_room_members_by_user on public.poker_room_members (user_id, status);
create index if not exists poker_room_members_staked on public.poker_room_members (user_id, stake_item_id)
  where stake_status = 'held';

alter table public.poker_rooms enable row level security;
alter table public.poker_room_members enable row level security;
revoke all on public.poker_rooms from anon, authenticated;
revoke all on public.poker_room_members from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sussurro de convite
-- ---------------------------------------------------------------------------

alter table public.friend_indications
  add column if not exists poker_room_id uuid references public.poker_rooms(id) on delete set null;

-- O tipo 'poker_invite' precisa entrar no CHECK recommendations_type_check, e isso só se faz
-- removendo e recriando a restrição, que esta migração não faz (regra do pôquer: nada de
-- remoção sem aprovação). A troca está à parte (scratchpad poker3/F3-pending-whisper-type.sql);
-- até ela ser aplicada, poker_room_invite cria o convite sem o sussurro (o convite aparece
-- em get_poker_friends_home().invites do mesmo jeito).

-- O convite só nasce no servidor (poker_room_invite liga 'poker.inviting'): um aparelho
-- não consegue mandar convite falso em nome de ninguém.
create or replace function public.poker_invite_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('poker.inviting', true), '') <> '1' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger poker_invite_guard
  before insert or update of type on public.friend_indications
  for each row when (new.type = 'poker_invite')
  execute function public.poker_invite_guard();

-- ---------------------------------------------------------------------------
-- Ajudantes
-- ---------------------------------------------------------------------------

-- Um pôster no formato das telas do pôquer (camelCase). Gold do Pôster Poker ganha
-- prizeId/effectId e o nome do prêmio.
create or replace function public.poker_poster_card(p_item integer, p_effect text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'itemId', pi.id, 'effect', p_effect,
           'title', coalesce(mc.title_pt, mc.title_en), 'titleEn', coalesce(mc.title_en, mc.title_pt),
           'year', extract(year from mc.release_date)::int, 'filePath', pi.file_path,
           'serial', pi.serial, 'rarity', pi.rarity)
         || coalesce((select jsonb_build_object('prizeId', p.id, 'effectId', p.effect_id,
                                                'title', coalesce(p.name_pt, mc.title_pt, mc.title_en),
                                                'titleEn', coalesce(p.name_en, mc.title_en, mc.title_pt))
                        from poker_prizes p
                       where p_effect = 'gold' and p.effect_id is not null and p.kind = 'poster'
                         and (p.payload ->> 'item_id')::int = pi.id
                       limit 1), '{}'::jsonb)
    from poster_items pi
    left join movie_cache mc on mc.tmdb_id = pi.tmdb_id and mc.media_type = pi.media_type
   where pi.id = p_item;
$$;

-- O efeito de mesa de um pôster gold do Pôster Poker (null se não for um deles).
create or replace function public.poker_effect_of_item(p_item integer)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.effect_id from poker_prizes p
   where p.kind = 'poster' and p.effect_id is not null and (p.payload ->> 'item_id')::int = p_item
   limit 1;
$$;

-- Quem pode jogar com amigos: pôquer liberado (hoje, testadores), não é conta-robô e
-- confirmou a idade (como o torneio). null = pode.
create or replace function public.poker_friends_gate(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_uid is null or not poker_enabled(p_uid) then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'closed');
  end if;
  if poker_is_bot(p_uid) then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'bot');
  end if;
  if (select age_confirmed_at from poker_players where user_id = p_uid) is null then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'age_required');
  end if;
  return null;
end;
$$;

-- A sala aberta (lobby ou partida) em que a pessoa está sentada. Uma por vez.
create or replace function public.poker_room_active_of(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.room_id
    from poker_room_members m
    join poker_rooms r on r.id = m.room_id
   where m.user_id = p_uid and m.status = 'joined' and r.status in ('lobby', 'playing')
   order by r.created_at desc
   limit 1;
$$;

create or replace function public.poker_room_new_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from poker_rooms where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Aviso de mudança (sem cartas) para os aparelhos da sala. Falha do Realtime nunca
-- derruba a jogada: vira um aviso no log e o aparelho cai na rede de segurança (sync).
create or replace function public.poker_room_ping(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r poker_rooms;
begin
  update poker_rooms set version = version + 1, updated_at = now() where id = p_room_id returning * into r;
  if not found then
    return;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('roomId', r.id, 'version', r.version, 'seq', r.seq, 'status', r.status,
                         'toAct', r.to_act, 'deadline', r.deadline_at),
      'ping', 'poker-room:' || r.id::text, true);
  exception when others then
    raise warning 'poker room ping: %', sqlerrm;
  end;
end;
$$;

-- Pôster apostado (travado). 03/11/2026 (F3): além do torneio aberto, a aposta de uma
-- sala de amigos (lobby ou partida). p_except_room deixa de fora a própria sala (para
-- trocar a aposta dentro dela).
create or replace function public.poker_poster_staked_elsewhere(p_uid uuid, p_item integer, p_effect text, p_except_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from poker_bounty_matches m
                  where m.user_id = p_uid and m.status = 'active' and m.stake_kind = 'poster' and m.stake_status = 'held'
                    and m.stake_item_id = p_item and m.stake_effect = p_effect)
      or exists (select 1 from poker_room_members mm
                   join poker_rooms r on r.id = mm.room_id
                  where mm.user_id = p_uid and mm.stake_status = 'held'
                    and mm.stake_item_id = p_item and mm.stake_effect = p_effect
                    and r.status in ('lobby', 'playing')
                    and (p_except_room is null or r.id <> p_except_room));
$$;

create or replace function public.poker_poster_staked(p_uid uuid, p_item integer, p_effect text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select poker_poster_staked_elsewhere(p_uid, p_item, p_effect, null);
$$;

-- O problema de uma aposta nesta sala (null = vale). Ordem: a forma, depois a posse,
-- depois os outros da sala ("cópia idêntica" = mesmo pôster E mesmo efeito).
create or replace function public.poker_room_stake_problem(p_room_id uuid, p_uid uuid, p_item integer, p_effect text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r poker_rooms;
  pi poster_items;
begin
  select * into r from poker_rooms where id = p_room_id;
  if not found then
    return 'bad';
  end if;
  if r.stake_rarity is null then
    return case when p_item is null then null else 'no_stake_room' end;
  end if;
  if p_item is null then
    return 'missing';
  end if;
  select * into pi from poster_items where id = p_item;
  if not found or p_effect is null or p_effect not in ('none', 'holo', 'negative', 'ultra_red', 'gold') then
    return 'not_owned';
  end if;
  if pi.exclusive is not null or p_effect = 'gold' then
    return 'exclusive';
  end if;
  if pi.rarity <> r.stake_rarity then
    return 'rarity';
  end if;
  if not jackpot_owns(p_uid, p_item, p_effect) then
    return 'not_owned';
  end if;
  if poker_poster_staked_elsewhere(p_uid, p_item, p_effect, p_room_id) then
    return 'staked';
  end if;
  if exists (select 1 from poker_room_members m
              where m.room_id = p_room_id and m.user_id <> p_uid and m.status = 'joined'
                and (jackpot_owns(m.user_id, p_item, p_effect)
                     or (m.stake_item_id = p_item and m.stake_effect = p_effect))) then
    return 'someone_has';
  end if;
  return null;
end;
$$;

-- Os efeitos que a mesa teria agora (lobby): os pôsteres gold dos que estão sentados,
-- ainda na coleção. Repetido = acumula (o motor do E3 define como).
create or replace function public.poker_room_lobby_effects(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x.effect_id order by x.joined_at, x.ord), '[]'::jsonb)
    from (select poker_effect_of_item(it.item) as effect_id, m.joined_at, it.ord
            from poker_room_members m
            cross join lateral unnest(m.effect_items) with ordinality as it(item, ord)
           where m.room_id = p_room_id and m.status = 'joined'
             and jackpot_owns(m.user_id, it.item, 'gold')) x
   where x.effect_id is not null;
$$;

-- O que impede quem criou de começar (lobby).
create or replace function public.poker_room_blockers(p_room_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r poker_rooms;
  v_out text[] := '{}';
begin
  select * into r from poker_rooms where id = p_room_id;
  if (select count(*) from poker_room_members where room_id = p_room_id and status = 'joined') < 2 then
    v_out := v_out || 'need_players'::text;
  end if;
  if exists (select 1 from poker_room_members where room_id = p_room_id and status = 'joined'
              and user_id <> r.host_id and not ready) then
    v_out := v_out || 'not_ready'::text;
  end if;
  if r.stake_rarity is not null and exists (
       select 1 from poker_room_members m where m.room_id = p_room_id and m.status = 'joined'
          and poker_room_stake_problem(p_room_id, m.user_id, m.stake_item_id, m.stake_effect) is not null) then
    v_out := v_out || 'stake_problem'::text;
  end if;
  return v_out;
end;
$$;

-- A sala vista por p_viewer (FriendsRoom do F3_NOTES). Sem cartas: a partida vem da Edge.
create or replace function public.poker_room_json(p_room_id uuid, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r poker_rooms;
  me poker_room_members;
  v_members jsonb;
  v_blockers text[];
  v_options jsonb := null;
  v_lobby boolean;
begin
  select * into r from poker_rooms where id = p_room_id;
  if not found then
    return null;
  end if;
  select * into me from poker_room_members where room_id = p_room_id and user_id = p_viewer;
  v_lobby := r.status = 'lobby';

  select coalesce(jsonb_agg(jsonb_build_object(
           'userId', m.user_id, 'username', pr.username, 'avatarUrl', pr.avatar_url, 'avatarFrame', pr.avatar_frame,
           'status', m.status, 'isHost', m.user_id = r.host_id, 'ready', m.ready or m.user_id = r.host_id,
           'effectPosters', coalesce((select jsonb_agg(poker_poster_card(it.item, 'gold') order by it.ord)
                                        from unnest(m.effect_items) with ordinality as it(item, ord)), '[]'::jsonb),
           'stake', case when m.stake_item_id is not null then
                      poker_poster_card(m.stake_item_id, m.stake_effect)
                      || jsonb_build_object('status', m.stake_status) end,
           'stakeProblem', case when v_lobby and m.status = 'joined' and r.stake_rarity is not null then
                             poker_room_stake_problem(r.id, m.user_id, m.stake_item_id, m.stake_effect) end,
           'seat', m.seat, 'playerId', m.player_id, 'away', m.away, 'place', m.place)
         order by (m.user_id = r.host_id) desc, m.status = 'joined' desc, coalesce(m.joined_at, m.invited_at)), '[]'::jsonb)
    into v_members
    from poker_room_members m
    join profiles pr on pr.id = m.user_id
   where m.room_id = r.id
     and (m.status in ('joined', 'invited') or (not v_lobby and m.seat is not null));

  if v_lobby then
    v_blockers := poker_room_blockers(r.id);
    if me.status = 'joined' then
      v_options := jsonb_build_object(
        'effects', coalesce((select jsonb_agg(poker_poster_card(up.item_id, 'gold') order by pi.rarity, pi.serial)
                               from user_posters up join poster_items pi on pi.id = up.item_id
                              where up.user_id = p_viewer and up.effect = 'gold' and up.reset_at is null
                                and pi.exclusive = 'poker' and poker_effect_of_item(up.item_id) is not null), '[]'::jsonb),
        'stakes', case when r.stake_rarity is null then '[]'::jsonb else
                    coalesce((select jsonb_agg(poker_poster_card(up.item_id, up.effect) order by pi.serial, up.effect)
                                from user_posters up join poster_items pi on pi.id = up.item_id
                               where up.user_id = p_viewer and up.reset_at is null
                                 and pi.rarity = r.stake_rarity and pi.exclusive is null and up.effect <> 'gold'
                                 and poker_room_stake_problem(r.id, p_viewer, up.item_id, up.effect) is null), '[]'::jsonb) end);
    end if;
  end if;

  return jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'hostId', r.host_id, 'stakeRarity', r.stake_rarity,
    'version', r.version, 'createdAt', r.created_at, 'startedAt', r.started_at, 'finishedAt', r.finished_at,
    'closedReason', r.closed_reason,
    'me', jsonb_build_object('userId', p_viewer, 'status', me.status, 'isHost', p_viewer = r.host_id),
    'members', v_members,
    'effects', case when v_lobby then poker_room_lobby_effects(r.id) else r.effects end,
    'canStart', v_lobby and p_viewer = r.host_id and cardinality(v_blockers) = 0,
    'blockers', case when v_lobby then to_jsonb(v_blockers) else '[]'::jsonb end,
    'options', v_options,
    'result', r.result);
end;
$$;

create or replace function public.poker_room_fail(p_status int, p_code text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('ok', false, 'status', p_status, 'code', p_code) || coalesce(p_extra, '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- O lobby (só a Edge poker-friends, com a service role e o uid do token)
-- ---------------------------------------------------------------------------

create or replace function public.poker_room_create(p_uid uuid, p_stake_rarity text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  v_active uuid;
  r poker_rooms;
begin
  perform poker_assert_service();
  v_gate := poker_friends_gate(p_uid);
  if v_gate is not null then
    return v_gate;
  end if;
  if p_stake_rarity is not null and p_stake_rarity not in ('common', 'rare', 'epic', 'legendary') then
    return poker_room_fail(400, 'bad_request');
  end if;
  perform pg_advisory_xact_lock(hashtext('poker-room-user:' || p_uid::text));
  v_active := poker_room_active_of(p_uid);
  if v_active is not null then
    return poker_room_fail(409, 'in_room', jsonb_build_object('roomId', v_active));
  end if;
  if (select count(*) from poker_rooms where host_id = p_uid and created_at > now() - interval '1 day') >= 40 then
    return poker_room_fail(429, 'too_many');
  end if;
  insert into poker_rooms (code, host_id, stake_rarity)
  values (poker_room_new_code(), p_uid, p_stake_rarity)
  returning * into r;
  insert into poker_room_members (room_id, user_id, status, via, joined_at)
  values (r.id, p_uid, 'joined', 'host', now());
  return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid));
end;
$$;

create or replace function public.poker_room_invite(p_uid uuid, p_room_id uuid, p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  r poker_rooms;
  m poker_room_members;
  v_to uuid;
  v_invited uuid[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  v_open int;
begin
  perform poker_assert_service();
  v_gate := poker_friends_gate(p_uid);
  if v_gate is not null then
    return v_gate;
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 or cardinality(p_user_ids) > 8 then
    return poker_room_fail(400, 'bad_request');
  end if;
  select * into r from poker_rooms where id = p_room_id for update;
  if not found or not exists (select 1 from poker_room_members where room_id = p_room_id and user_id = p_uid) then
    return poker_room_fail(404, 'no_room');
  end if;
  if r.host_id <> p_uid then
    return poker_room_fail(403, 'not_host');
  end if;
  if r.status <> 'lobby' then
    return poker_room_fail(409, case when r.status = 'closed' then 'room_closed' else 'started' end);
  end if;

  for v_to in select distinct u from unnest(p_user_ids) u loop
    if v_to = p_uid then
      v_skipped := v_skipped || jsonb_build_object('userId', v_to, 'reason', 'self');
      continue;
    end if;
    if not are_friends(p_uid, v_to) then
      v_skipped := v_skipped || jsonb_build_object('userId', v_to, 'reason', 'not_friend');
      continue;
    end if;
    if not poker_enabled(v_to) or poker_is_bot(v_to) then
      v_skipped := v_skipped || jsonb_build_object('userId', v_to, 'reason', 'closed');
      continue;
    end if;
    select * into m from poker_room_members where room_id = r.id and user_id = v_to;
    if found and m.status in ('joined', 'invited') then
      v_skipped := v_skipped || jsonb_build_object('userId', v_to, 'reason', 'already');
      continue;
    end if;
    -- Convidar de novo quem recusou: no máximo um por minuto (nada de enxurrada de sussurros).
    if found and m.invited_at > now() - interval '1 minute' then
      v_skipped := v_skipped || jsonb_build_object('userId', v_to, 'reason', 'too_soon');
      continue;
    end if;
    select count(*) into v_open from poker_room_members where room_id = r.id and status in ('joined', 'invited');
    if v_open >= 8 then
      v_skipped := v_skipped || jsonb_build_object('userId', v_to, 'reason', 'full');
      continue;
    end if;
    insert into poker_room_members (room_id, user_id, status, via, invited_by, invited_at)
    values (r.id, v_to, 'invited', 'invite', p_uid, now())
    on conflict (room_id, user_id) do update
       set status = 'invited', via = 'invite', invited_by = p_uid, invited_at = now(), updated_at = now(),
           ready = false, joined_at = null, left_at = null;
    -- O sussurro. Sem o tipo novo no CHECK (troca pendente), fica só o convite.
    perform set_config('poker.inviting', '1', true);
    begin
      insert into friend_indications (from_user_id, to_user_id, type, media_type, poker_room_id, message, read)
      values (p_uid, v_to, 'poker_invite', null, r.id, r.code, false);
    exception when check_violation then
      raise warning 'poker_invite: tipo ainda fora do CHECK de friend_indications';
    end;
    perform set_config('poker.inviting', '', true);
    v_invited := v_invited || v_to;
  end loop;

  if cardinality(v_invited) > 0 then
    perform poker_room_ping(r.id);
  end if;
  return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid),
                            'invited', to_jsonb(v_invited), 'skipped', v_skipped);
end;
$$;

-- Entrar (aceitar convite ou código): as checagens comuns, com a sala já travada.
create or replace function public.poker_room_seat_check(p_uid uuid, r poker_rooms)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active uuid;
begin
  if r.status <> 'lobby' then
    return poker_room_fail(409, case when r.status = 'closed' then 'room_closed' else 'started' end);
  end if;
  if r.host_id <> p_uid and not are_friends(r.host_id, p_uid) then
    return poker_room_fail(403, 'not_friend');
  end if;
  v_active := poker_room_active_of(p_uid);
  if v_active is not null and v_active <> r.id then
    return poker_room_fail(409, 'in_room', jsonb_build_object('roomId', v_active));
  end if;
  if (select count(*) from poker_room_members where room_id = r.id and status = 'joined' and user_id <> p_uid) >= 4 then
    return poker_room_fail(409, 'full');
  end if;
  return null;
end;
$$;

create or replace function public.poker_room_respond(p_uid uuid, p_room_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  r poker_rooms;
  m poker_room_members;
begin
  perform poker_assert_service();
  if p_accept then
    v_gate := poker_friends_gate(p_uid);
    if v_gate is not null then
      return v_gate;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('poker-room-user:' || p_uid::text));
  select * into r from poker_rooms where id = p_room_id for update;
  select * into m from poker_room_members where room_id = p_room_id and user_id = p_uid for update;
  if r.id is null or m.user_id is null then
    return poker_room_fail(404, 'not_invited');
  end if;
  if m.status = 'joined' then
    return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid));
  end if;
  if m.status <> 'invited' then
    return poker_room_fail(404, 'not_invited');
  end if;
  update friend_indications set read = true
   where to_user_id = p_uid and type = 'poker_invite' and poker_room_id = r.id and not read;
  if not p_accept then
    update poker_room_members set status = 'declined', updated_at = now() where room_id = r.id and user_id = p_uid;
    perform poker_room_ping(r.id);
    return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid));
  end if;
  v_gate := poker_room_seat_check(p_uid, r);
  if v_gate is not null then
    if r.status <> 'lobby' then
      update poker_room_members set status = 'expired', updated_at = now() where room_id = r.id and user_id = p_uid;
    end if;
    return v_gate;
  end if;
  update poker_room_members set status = 'joined', joined_at = now(), ready = false, updated_at = now()
   where room_id = r.id and user_id = p_uid;
  perform poker_room_ping(r.id);
  return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid));
end;
$$;

create or replace function public.poker_room_join(p_uid uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  v_code text := upper(btrim(coalesce(p_code, '')));
  r poker_rooms;
  m poker_room_members;
begin
  perform poker_assert_service();
  v_gate := poker_friends_gate(p_uid);
  if v_gate is not null then
    return v_gate;
  end if;
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return poker_room_fail(404, 'no_room');
  end if;
  perform pg_advisory_xact_lock(hashtext('poker-room-user:' || p_uid::text));
  select * into r from poker_rooms where code = v_code for update;
  if not found then
    return poker_room_fail(404, 'no_room');
  end if;
  select * into m from poker_room_members where room_id = r.id and user_id = p_uid;
  if found and m.status = 'joined' and r.status in ('lobby', 'playing') then
    return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid));
  end if;
  v_gate := poker_room_seat_check(p_uid, r);
  if v_gate is not null then
    return v_gate;
  end if;
  insert into poker_room_members (room_id, user_id, status, via, joined_at)
  values (r.id, p_uid, 'joined', 'code', now())
  on conflict (room_id, user_id) do update
     set status = 'joined', via = 'code', joined_at = now(), left_at = null, ready = false, updated_at = now();
  update friend_indications set read = true
   where to_user_id = p_uid and type = 'poker_invite' and poker_room_id = r.id and not read;
  perform poker_room_ping(r.id);
  return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid));
end;
$$;

-- Sair do LOBBY (a saída no meio da partida é a desistência: poker_room_step, pela Edge).
-- Quem criou sair = a sala fecha (as apostas destravam; os convites expiram).
create or replace function public.poker_room_leave_lobby(p_uid uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r poker_rooms;
  m poker_room_members;
begin
  perform poker_assert_service();
  select * into r from poker_rooms where id = p_room_id for update;
  select * into m from poker_room_members where room_id = p_room_id and user_id = p_uid for update;
  if r.id is null or m.user_id is null then
    return poker_room_fail(404, 'no_room');
  end if;
  if r.status = 'playing' then
    return poker_room_fail(409, 'started');
  end if;
  if r.status <> 'lobby' or m.status not in ('joined', 'invited') then
    return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid));
  end if;
  if m.status = 'invited' then
    update poker_room_members set status = 'declined', updated_at = now() where room_id = r.id and user_id = p_uid;
  elsif r.host_id = p_uid then
    update poker_rooms set status = 'closed', closed_reason = 'host_left', finished_at = now() where id = r.id;
    update poker_room_members set stake_item_id = null, stake_effect = null, stake_status = null, ready = false, updated_at = now()
     where room_id = r.id and stake_status = 'held';
    update poker_room_members set status = 'expired', updated_at = now() where room_id = r.id and status = 'invited';
  else
    update poker_room_members
       set status = 'left', left_at = now(), ready = false, stake_item_id = null, stake_effect = null, stake_status = null,
           updated_at = now()
     where room_id = r.id and user_id = p_uid;
  end if;
  perform poker_room_ping(r.id);
  return jsonb_build_object('ok', true, 'room', poker_room_json(r.id, p_uid));
end;
$$;

-- Trava a sala e confere: lobby, a pessoa sentada (joined). null = segue.
create or replace function public.poker_room_lobby_lock(p_uid uuid, p_room_id uuid, p_host_only boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r poker_rooms;
begin
  select * into r from poker_rooms where id = p_room_id for update;
  if not found or not exists (select 1 from poker_room_members where room_id = p_room_id and user_id = p_uid and status = 'joined') then
    return poker_room_fail(404, 'no_room');
  end if;
  if p_host_only and r.host_id <> p_uid then
    return poker_room_fail(403, 'not_host');
  end if;
  if r.status <> 'lobby' then
    return poker_room_fail(409, case when r.status = 'closed' then 'room_closed' else 'started' end);
  end if;
  return null;
end;
$$;

create or replace function public.poker_room_config(p_uid uuid, p_room_id uuid, p_stake_rarity text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_err jsonb;
begin
  perform poker_assert_service();
  if p_stake_rarity is not null and p_stake_rarity not in ('common', 'rare', 'epic', 'legendary') then
    return poker_room_fail(400, 'bad_request');
  end if;
  v_err := poker_room_lobby_lock(p_uid, p_room_id, true);
  if v_err is not null then
    return v_err;
  end if;
  if (select stake_rarity from poker_rooms where id = p_room_id) is distinct from p_stake_rarity then
    update poker_rooms set stake_rarity = p_stake_rarity where id = p_room_id;
    -- Mudou a regra: as apostas e os "pronto" recomeçam.
    update poker_room_members
       set stake_item_id = null, stake_effect = null, stake_status = null, ready = false, updated_at = now()
     where room_id = p_room_id and status in ('joined', 'invited');
    perform poker_room_ping(p_room_id);
  end if;
  return jsonb_build_object('ok', true, 'room', poker_room_json(p_room_id, p_uid));
end;
$$;

create or replace function public.poker_room_set_effects(p_uid uuid, p_room_id uuid, p_items integer[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_err jsonb;
  v_items integer[] := coalesce(p_items, '{}');
  v_item integer;
begin
  perform poker_assert_service();
  if cardinality(v_items) > 2 then
    return poker_room_fail(400, 'effects_invalid', jsonb_build_object('reason', 'too_many'));
  end if;
  if cardinality(v_items) = 2 and v_items[1] = v_items[2] then
    return poker_room_fail(400, 'effects_invalid', jsonb_build_object('reason', 'repeated'));
  end if;
  v_err := poker_room_lobby_lock(p_uid, p_room_id, false);
  if v_err is not null then
    return v_err;
  end if;
  foreach v_item in array v_items loop
    if poker_effect_of_item(v_item) is null or not jackpot_owns(p_uid, v_item, 'gold') then
      return poker_room_fail(400, 'effects_invalid', jsonb_build_object('reason', 'not_owned', 'itemId', v_item));
    end if;
  end loop;
  update poker_room_members set effect_items = v_items, ready = false, updated_at = now()
   where room_id = p_room_id and user_id = p_uid;
  perform poker_room_ping(p_room_id);
  return jsonb_build_object('ok', true, 'room', poker_room_json(p_room_id, p_uid));
end;
$$;

create or replace function public.poker_room_set_stake(p_uid uuid, p_room_id uuid, p_item integer, p_effect text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_err jsonb;
  v_problem text;
begin
  perform poker_assert_service();
  v_err := poker_room_lobby_lock(p_uid, p_room_id, false);
  if v_err is not null then
    return v_err;
  end if;
  if p_item is null then
    update poker_room_members set stake_item_id = null, stake_effect = null, stake_status = null, ready = false, updated_at = now()
     where room_id = p_room_id and user_id = p_uid;
    perform poker_room_ping(p_room_id);
    return jsonb_build_object('ok', true, 'room', poker_room_json(p_room_id, p_uid));
  end if;
  v_problem := poker_room_stake_problem(p_room_id, p_uid, p_item, p_effect);
  if v_problem is not null then
    return poker_room_fail(400, 'stake_invalid', jsonb_build_object('reason', v_problem));
  end if;
  update poker_room_members
     set stake_item_id = p_item, stake_effect = p_effect, stake_status = 'held', ready = false, updated_at = now()
   where room_id = p_room_id and user_id = p_uid;
  perform poker_room_ping(p_room_id);
  return jsonb_build_object('ok', true, 'room', poker_room_json(p_room_id, p_uid));
end;
$$;

create or replace function public.poker_room_set_ready(p_uid uuid, p_room_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_err jsonb;
begin
  perform poker_assert_service();
  v_err := poker_room_lobby_lock(p_uid, p_room_id, false);
  if v_err is not null then
    return v_err;
  end if;
  update poker_room_members set ready = coalesce(p_ready, false), updated_at = now()
   where room_id = p_room_id and user_id = p_uid and ready is distinct from coalesce(p_ready, false);
  if found then
    perform poker_room_ping(p_room_id);
  end if;
  return jsonb_build_object('ok', true, 'room', poker_room_json(p_room_id, p_uid));
end;
$$;

create or replace function public.poker_room_info(p_uid uuid, p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform poker_assert_service();
  if not exists (select 1 from poker_room_members where room_id = p_room_id and user_id = p_uid) then
    return poker_room_fail(404, 'no_room');
  end if;
  return jsonb_build_object('ok', true, 'room', poker_room_json(p_room_id, p_uid));
end;
$$;

-- ---------------------------------------------------------------------------
-- Leituras autenticadas (sem cartas)
-- ---------------------------------------------------------------------------

create or replace function public.get_poker_friends_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room uuid;
  v_friends uuid[];
begin
  if v_uid is null or not poker_enabled(v_uid) or poker_is_bot(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  v_room := poker_room_active_of(v_uid);
  select coalesce(array_agg(case when f.requester_id = v_uid then f.addressee_id else f.requester_id end), '{}')
    into v_friends
    from friendships f
   where f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid);

  return jsonb_build_object(
    'enabled', true,
    'room', (select jsonb_build_object('id', r.id, 'code', r.code, 'status', r.status, 'hostId', r.host_id,
                                       'stakeRarity', r.stake_rarity, 'version', r.version,
                                       'members', (select count(*) from poker_room_members x where x.room_id = r.id and x.status = 'joined'))
               from poker_rooms r where r.id = v_room),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'roomId', r.id, 'code', r.code,
               'host', jsonb_build_object('userId', r.host_id, 'username', hp.username, 'avatarUrl', hp.avatar_url),
               'stakeRarity', r.stake_rarity,
               'members', (select count(*) from poker_room_members x where x.room_id = r.id and x.status = 'joined'),
               'invitedAt', m.invited_at) order by m.invited_at desc)
        from poker_room_members m
        join poker_rooms r on r.id = m.room_id
        join profiles hp on hp.id = r.host_id
       where m.user_id = v_uid and m.status = 'invited' and r.status = 'lobby'), '[]'::jsonb),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('userId', p.id, 'username', p.username, 'avatarUrl', p.avatar_url,
                                          'avatarFrame', p.avatar_frame,
                                          'inRoom', poker_room_active_of(p.id) is not null)
                       order by lower(p.username))
        from profiles p
       where p.id = any (v_friends) and poker_enabled(p.id) and not poker_is_bot(p.id)), '[]'::jsonb),
    'effectPosters', coalesce((
      select jsonb_agg(poker_poster_card(up.item_id, 'gold') order by pi.rarity, pi.serial)
        from user_posters up join poster_items pi on pi.id = up.item_id
       where up.user_id = v_uid and up.effect = 'gold' and up.reset_at is null and pi.exclusive = 'poker'
         and poker_effect_of_item(up.item_id) is not null), '[]'::jsonb),
    'scoreboard', coalesce((
      select jsonb_agg(jsonb_build_object('userId', s.user_id, 'username', p.username, 'avatarUrl', p.avatar_url,
                                          'wins', s.wins, 'matches', s.matches)
                       order by s.wins desc, s.matches desc, lower(p.username))
        from (select m.user_id, count(*) filter (where m.place = 1) as wins, count(*) as matches
                from poker_room_members m
                join poker_rooms r on r.id = m.room_id
               where r.status = 'finished' and m.seat is not null
                 and (m.user_id = v_uid or m.user_id = any (v_friends))
               group by m.user_id) s
        join profiles p on p.id = s.user_id), '[]'::jsonb));
end;
$$;

-- O estado dos convites citados nos Sussurros (em lote). Só as salas em que a pessoa é membro.
create or replace function public.get_poker_invites(p_room_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'roomId', r.id, 'code', r.code, 'stakeRarity', r.stake_rarity,
           'members', (select count(*) from poker_room_members x where x.room_id = r.id and x.status = 'joined'),
           'state', case
             when r.status = 'closed' then 'closed'
             when m.status = 'joined' and r.status in ('lobby', 'playing') then 'joined'
             when r.status in ('playing', 'finished') then 'started'
             when m.status = 'declined' then 'declined'
             when m.status <> 'invited' then 'closed'
             when (select count(*) from poker_room_members x where x.room_id = r.id and x.status = 'joined') >= 4 then 'full'
             else 'open' end)), '[]'::jsonb)
    from poker_rooms r
    join poker_room_members m on m.room_id = r.id and m.user_id = auth.uid()
   where r.id = any (coalesce(p_room_ids, '{}'))
     and cardinality(coalesce(p_room_ids, '{}')) <= 100;
$$;

-- ---------------------------------------------------------------------------
-- Tempo real: só membros (convidados, sentados ou que jogaram) recebem o ping da sala
-- ---------------------------------------------------------------------------

create or replace function public.poker_room_topic_member(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_topic is null or p_topic !~ '^poker-room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := substr(p_topic, 12)::uuid;
  return exists (select 1 from poker_room_members m
                  where m.room_id = v_id and m.user_id = auth.uid()
                    and (m.status in ('invited', 'joined') or m.seat is not null));
end;
$$;

create policy "poker room members receive pings"
  on realtime.messages
  for select
  to authenticated
  using (realtime.messages.extension = 'broadcast' and public.poker_room_topic_member(realtime.topic()));

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on function public.poker_poster_card(integer, text) from public, anon, authenticated;
revoke all on function public.poker_effect_of_item(integer) from public, anon, authenticated;
revoke all on function public.poker_friends_gate(uuid) from public, anon, authenticated;
revoke all on function public.poker_room_active_of(uuid) from public, anon, authenticated;
revoke all on function public.poker_room_new_code() from public, anon, authenticated;
revoke all on function public.poker_room_ping(uuid) from public, anon, authenticated;
revoke all on function public.poker_poster_staked_elsewhere(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.poker_poster_staked(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.poker_room_stake_problem(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.poker_room_lobby_effects(uuid) from public, anon, authenticated;
revoke all on function public.poker_room_blockers(uuid) from public, anon, authenticated;
revoke all on function public.poker_room_json(uuid, uuid) from public, anon, authenticated;
revoke all on function public.poker_room_fail(int, text, jsonb) from public, anon, authenticated;
revoke all on function public.poker_room_seat_check(uuid, poker_rooms) from public, anon, authenticated;
revoke all on function public.poker_room_lobby_lock(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.poker_invite_guard() from public, anon, authenticated;

revoke all on function public.poker_room_create(uuid, text) from public, anon, authenticated;
revoke all on function public.poker_room_invite(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.poker_room_respond(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.poker_room_join(uuid, text) from public, anon, authenticated;
revoke all on function public.poker_room_leave_lobby(uuid, uuid) from public, anon, authenticated;
revoke all on function public.poker_room_config(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.poker_room_set_effects(uuid, uuid, integer[]) from public, anon, authenticated;
revoke all on function public.poker_room_set_stake(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.poker_room_set_ready(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.poker_room_info(uuid, uuid) from public, anon, authenticated;
grant execute on function public.poker_room_create(uuid, text) to service_role;
grant execute on function public.poker_room_invite(uuid, uuid, uuid[]) to service_role;
grant execute on function public.poker_room_respond(uuid, uuid, boolean) to service_role;
grant execute on function public.poker_room_join(uuid, text) to service_role;
grant execute on function public.poker_room_leave_lobby(uuid, uuid) to service_role;
grant execute on function public.poker_room_config(uuid, uuid, text) to service_role;
grant execute on function public.poker_room_set_effects(uuid, uuid, integer[]) to service_role;
grant execute on function public.poker_room_set_stake(uuid, uuid, integer, text) to service_role;
grant execute on function public.poker_room_set_ready(uuid, uuid, boolean) to service_role;
grant execute on function public.poker_room_info(uuid, uuid) to service_role;

-- Usadas por políticas e por get_my_posters/gatilhos (que rodam como dono) — e a do
-- tópico, que a RLS do Realtime chama como authenticated.
grant execute on function public.poker_room_topic_member(text) to authenticated;
revoke all on function public.get_poker_friends_home() from public, anon;
revoke all on function public.get_poker_invites(uuid[]) from public, anon;
grant execute on function public.get_poker_friends_home() to authenticated;
grant execute on function public.get_poker_invites(uuid[]) to authenticated;
