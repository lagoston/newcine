-- Pôster Poker — fase 3, pacote F3 (03/11/2026): o oráculo devolve o pôster na casual.
--
-- Pôster perdido para um oráculo (aposta perdida no torneio, ou mesa de amigos vencida
-- por oráculo) entra em poker_lost_posters, "com o oráculo X": no torneio, quem eliminou
-- a pessoa (se ela desistiu ou abandonou, quem venceu a mesa — a Edge manda
-- summary.taker; sem ele, o maior cacife entre os oráculos vivos); na mesa de amigos, o
-- oráculo que venceu.
--
-- A cada 3 casuais (contadas aqui, quando a casual começa: poker_casual_begin), se houver
-- pendente, o servidor sorteia um e essa casual é jogada na Edge poker-friends (ops
-- recover.*), com o oráculo carregando o pôster (o portador da fase 1). Eliminar o
-- portador — ou vencer a mesa — devolve o pôster (como era, trocável). Perdeu: continua
-- pendente. Já tem de novo uma cópia idêntica (mesmo pôster e efeito)? O pendente vira
-- 'resolved' calado. Nada é anunciado.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.poker_lost_posters (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id integer not null references public.poster_items(id),
  effect text not null check (effect in ('none', 'holo', 'negative', 'ultra_red')),
  carrier text not null check (carrier in ('bogart', 'fincher', 'cypher')),
  source text not null check (source in ('tournament', 'friends')),
  -- poker_bounty_matches.id (torneio) ou poker_rooms.id (amigos).
  source_ref uuid not null,
  status text not null default 'pending' check (status in ('pending', 'recovered', 'resolved')),
  -- Quantas casuais de devolução já foram jogadas com ele.
  offers integer not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  recovered_match uuid,
  unique (user_id, source, source_ref)
);

create index if not exists poker_lost_posters_pending on public.poker_lost_posters (user_id) where status = 'pending';

alter table public.poker_players
  add column if not exists casual_count integer not null default 0,
  add column if not exists casual_last_at timestamptz;

create table if not exists public.poker_recover_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lost_id bigint not null references public.poker_lost_posters(id),
  carrier text not null check (carrier in ('bogart', 'fincher', 'cypher')),
  -- O bilhete que poker_casual_begin entrega ao aparelho (vale 15 min).
  ticket uuid not null default gen_random_uuid() unique,
  status text not null default 'offered'
    check (status in ('offered', 'active', 'won', 'lost', 'forfeit', 'abandoned', 'void')),
  expires_at timestamptz not null,
  seed text,
  seed_hash text,
  engine_hash text,
  state_version smallint,
  proto smallint,
  params_version jsonb,
  state jsonb,
  public_view jsonb,
  events_tail jsonb not null default '[]'::jsonb,
  human_actions jsonb not null default '[]'::jsonb,
  seq integer not null default 0,
  last_idem uuid,
  last_response jsonb,
  hands integer not null default 0,
  place smallint check (place between 1 and 4),
  captured_hand integer,
  captured_at timestamptz,
  recovered boolean not null default false,
  summary jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists poker_recover_one_active on public.poker_recover_matches (user_id) where status = 'active';
create index if not exists poker_recover_by_user on public.poker_recover_matches (user_id, created_at desc);

alter table public.poker_lost_posters enable row level security;
alter table public.poker_recover_matches enable row level security;
revoke all on public.poker_lost_posters from anon, authenticated;
revoke all on public.poker_recover_matches from anon, authenticated;

-- ---------------------------------------------------------------------------
-- A lista "com o oráculo X"
-- ---------------------------------------------------------------------------

create or replace function public.poker_lost_record(p_uid uuid, p_item integer, p_effect text, p_carrier text,
                                                    p_source text, p_ref uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into poker_lost_posters (user_id, item_id, effect, carrier, source, source_ref)
  select p_uid, p_item, p_effect,
         case when p_carrier in ('bogart', 'fincher', 'cypher') then p_carrier else 'bogart' end,
         p_source, p_ref
   where p_effect in ('none', 'holo', 'negative', 'ultra_red')
  on conflict (user_id, source, source_ref) do nothing;
$$;

-- Já tem de novo uma cópia idêntica: o pendente some, calado.
create or replace function public.poker_lost_resolve_silent(p_uid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update poker_lost_posters l set status = 'resolved', resolved_at = now()
   where l.user_id = p_uid and l.status = 'pending' and jackpot_owns(p_uid, l.item_id, l.effect);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Quem tomou o pôster do torneio: summary.taker (a Edge, quando a pessoa desistiu ou
-- abandonou: quem venceu o resto da mesa) → quem eliminou a pessoa → o vencedor da mesa →
-- o maior cacife entre os oráculos vivos → o portador padrão da raridade.
create or replace function public.poker_taker_of(p_summary jsonb, p_state jsonb, p_rarity text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  v := p_summary ->> 'taker';
  if v in ('bogart', 'fincher', 'cypher') then
    return v;
  end if;
  select e ->> 'byId' into v
    from jsonb_array_elements(case when jsonb_typeof(p_summary -> 'eliminations') = 'array'
                                   then p_summary -> 'eliminations' else '[]'::jsonb end) e
   where e ->> 'victimId' = 'human'
   limit 1;
  if v in ('bogart', 'fincher', 'cypher') then
    return v;
  end if;
  v := p_summary ->> 'winnerId';
  if v in ('bogart', 'fincher', 'cypher') then
    return v;
  end if;
  select p ->> 'id' into v
    from jsonb_array_elements(case when jsonb_typeof(p_state #> '{game,players}') = 'array'
                                   then p_state #> '{game,players}' else '[]'::jsonb end) p
   where p ->> 'id' in ('bogart', 'fincher', 'cypher') and coalesce(p ->> 'status', '') <> 'eliminated'
     and jsonb_typeof(p -> 'stack') = 'number'
   order by (p ->> 'stack')::numeric desc
   limit 1;
  if v in ('bogart', 'fincher', 'cypher') then
    return v;
  end if;
  select s.carrier_by_rarity ->> p_rarity into v from poker_settings s;
  return case when v in ('bogart', 'fincher', 'cypher') then v else 'bogart' end;
end;
$$;

-- Fim do torneio. 03/11/2026 (F3): o pôster apostado e perdido entra na lista "com o
-- oráculo X" (poker_lost_record). O resto é a versão de produção sem mudança.
create or replace function public.poker_tournament_settle(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_bounty_matches;
  v_stake text;
  v_rewards jsonb;
begin
  select * into m from poker_bounty_matches where id = p_match_id for update;
  if not found or m.week is null or m.status not in ('won', 'lost', 'forfeit', 'abandoned') then
    return null;
  end if;
  v_stake := m.stake_status;
  if m.status = 'won' then
    perform poker_tournament_grant(m.id);
    if m.stake_status = 'held' then
      v_stake := case when m.stake_kind = 'poster' then 'returned' else 'spent' end;
    end if;
    update poker_bounty_matches
       set captured_hand = coalesce(captured_hand, hands), captured_at = coalesce(captured_at, now()), stake_status = v_stake
     where id = m.id;
  else
    if m.stake_kind = 'poster' and m.stake_status = 'held' then
      -- Fica com a Cobra: sai da coleção, do equipado e das trocas abertas.
      update user_posters set reset_at = now(), left_via = 'poker'
       where user_id = m.user_id and item_id = m.stake_item_id and effect = m.stake_effect and reset_at is null;
      update user_poster_equips set active = false
       where user_id = m.user_id and item_id = m.stake_item_id and effect = m.stake_effect and active;
      update poster_trades set status = 'void', responded_at = now()
       where status = 'pending'
         and ((from_user = m.user_id and offer_item = m.stake_item_id and offer_effect = m.stake_effect)
           or (to_user = m.user_id and ask_item = m.stake_item_id and ask_effect = m.stake_effect));
      -- Fase 3: com o oráculo que tomou (volta numa casual, sem anúncio).
      perform poker_lost_record(m.user_id, m.stake_item_id, m.stake_effect,
                                poker_taker_of(m.summary, m.state, m.rarity), 'tournament', m.id);
      v_stake := 'lost';
    elsif m.stake_status = 'held' then
      v_stake := 'spent';
    end if;
    update poker_bounty_matches set stake_status = v_stake where id = m.id;
  end if;
  v_rewards := poker_tournament_rewards_json(m.id);
  update poker_bounty_matches set rewards = v_rewards where id = m.id;
  return v_rewards;
end;
$$;

-- ---------------------------------------------------------------------------
-- O contador de casuais (o aparelho chama ao começar cada casual)
-- ---------------------------------------------------------------------------

create or replace function public.poker_casual_begin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p poker_players;
  v_active uuid;
  v_n int;
  l poker_lost_posters;
  v_ticket uuid;
begin
  if v_uid is null or not poker_enabled(v_uid) or poker_is_bot(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  perform poker_player_row(v_uid);
  select * into p from poker_players where user_id = v_uid for update;

  -- Uma de devolução aberta (o app fechou no meio): retome.
  select id into v_active from poker_recover_matches
   where user_id = v_uid and status = 'active' and started_at > now() - interval '24 hours';
  if v_active is not null then
    return jsonb_build_object('enabled', true, 'mode', 'server', 'matchId', v_active, 'resume', true);
  end if;

  perform poker_lost_resolve_silent(v_uid);

  -- Duas casuais começadas em menos de 20 s contam como uma (o contador não dispara à toa).
  if p.casual_last_at is not null and p.casual_last_at > now() - interval '20 seconds' then
    return jsonb_build_object('enabled', true, 'mode', 'device');
  end if;
  update poker_players set casual_count = casual_count + 1, casual_last_at = now()
   where user_id = v_uid
  returning casual_count into v_n;

  if v_n % 3 <> 0 then
    return jsonb_build_object('enabled', true, 'mode', 'device');
  end if;
  select * into l from poker_lost_posters where user_id = v_uid and status = 'pending' order by random() limit 1;
  if not found then
    return jsonb_build_object('enabled', true, 'mode', 'device');
  end if;
  update poker_recover_matches set status = 'void', updated_at = now() where user_id = v_uid and status = 'offered';
  insert into poker_recover_matches (user_id, lost_id, carrier, expires_at)
  values (v_uid, l.id, l.carrier, now() + interval '15 minutes')
  returning ticket into v_ticket;
  return jsonb_build_object('enabled', true, 'mode', 'server', 'ticket', v_ticket);
end;
$$;

-- ---------------------------------------------------------------------------
-- A casual de devolução (só a Edge poker-friends, service role)
-- ---------------------------------------------------------------------------

create or replace function public.poker_recover_prepare(p_uid uuid, p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_recover_matches;
  l poker_lost_posters;
  cfg poker_settings;
begin
  perform poker_assert_service();
  if p_uid is null or not poker_enabled(p_uid) then
    return poker_room_fail(403, 'closed');
  end if;
  if poker_is_bot(p_uid) then
    return poker_room_fail(403, 'bot');
  end if;
  select * into m from poker_recover_matches where user_id = p_uid and ticket = p_ticket for update;
  if not found then
    return poker_room_fail(404, 'not_found');
  end if;
  if m.status = 'active' then
    return jsonb_build_object('ok', false, 'status', 200, 'code', 'duplicate', 'matchId', m.id);
  end if;
  if m.status <> 'offered' or m.expires_at < now() then
    return poker_room_fail(410, 'gone');
  end if;
  select * into l from poker_lost_posters where id = m.lost_id for update;
  if l.status = 'pending' and jackpot_owns(l.user_id, l.item_id, l.effect) then
    update poker_lost_posters set status = 'resolved', resolved_at = now() where id = l.id;
    l.status := 'resolved';
  end if;
  if l.status <> 'pending' then
    update poker_recover_matches set status = 'void', updated_at = now() where id = m.id;
    return poker_room_fail(410, 'gone');
  end if;
  select * into cfg from poker_settings;
  return jsonb_build_object(
    'ok', true, 'match_id', m.id, 'carrier', m.carrier, 'prize_id', 'lost-' || l.id,
    'rarity', (select pi.rarity from poster_items pi where pi.id = l.item_id),
    'poster', poker_poster_card(l.item_id, l.effect),
    'settings', poker_settings_json(), 'bot_params', poker_bot_params_json(),
    'difficulty', cfg.difficulty -> 'free');
end;
$$;

create or replace function public.poker_recover_open(
  p_uid uuid, p_match_id uuid, p_seed text, p_seed_hash text, p_engine_hash text, p_state_version integer,
  p_proto integer, p_params_version jsonb, p_state jsonb, p_public_view jsonb, p_events_tail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_recover_matches;
begin
  perform poker_assert_service();
  if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text) > 262144
     or jsonb_typeof(p_public_view) is distinct from 'object' or octet_length(p_public_view::text) > 65536
     or coalesce(jsonb_typeof(p_events_tail), 'array') <> 'array' or p_seed is null or p_seed_hash is null then
    return poker_room_fail(400, 'bad_request');
  end if;
  update poker_recover_matches set
    status = 'active', started_at = now(), updated_at = now(), seq = 1,
    seed = p_seed, seed_hash = p_seed_hash, engine_hash = p_engine_hash, state_version = p_state_version,
    proto = p_proto, params_version = p_params_version, state = p_state, public_view = p_public_view,
    events_tail = poker_jsonb_tail(coalesce(p_events_tail, '[]'::jsonb), 60)
  where id = p_match_id and user_id = p_uid and status = 'offered' and expires_at >= now()
  returning * into m;
  if not found then
    select * into m from poker_recover_matches where id = p_match_id and user_id = p_uid;
    if found and m.status = 'active' then
      return jsonb_build_object('ok', false, 'status', 200, 'code', 'duplicate', 'matchId', m.id);
    end if;
    return poker_room_fail(410, 'gone');
  end if;
  return jsonb_build_object('ok', true, 'match_id', m.id);
end;
$$;

create or replace function public.poker_recover_load(p_uid uuid, p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m poker_recover_matches;
  l poker_lost_posters;
begin
  perform poker_assert_service();
  if p_match_id is null then
    select * into m from poker_recover_matches where user_id = p_uid and status = 'active';
  else
    select * into m from poker_recover_matches where user_id = p_uid and id = p_match_id and status <> 'offered' and status <> 'void';
  end if;
  if not found then
    return null;
  end if;
  select * into l from poker_lost_posters where id = m.lost_id;
  return jsonb_build_object(
    'id', m.id, 'status', m.status, 'seq', m.seq, 'last_idem', m.last_idem, 'last_response', m.last_response,
    'state', m.state, 'public_view', m.public_view, 'events_tail', m.events_tail,
    'seed', m.seed, 'seed_hash', m.seed_hash, 'created_at', coalesce(m.started_at, m.created_at),
    'result', m.result, 'carrier', m.carrier, 'poster', poker_poster_card(l.item_id, l.effect),
    'recovered', m.recovered, 'captured_hand', m.captured_hand, 'hands', m.hands,
    'expired', m.status = 'active' and m.started_at < now() - interval '24 hours');
end;
$$;

-- Devolve o pôster (como era: a mesma linha volta à vida, trocável). false = não havia o
-- que devolver (já devolvido, ou a pessoa já tem de novo uma cópia idêntica — calado).
create or replace function public.poker_recover_grant(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_recover_matches;
  l poker_lost_posters;
begin
  select * into m from poker_recover_matches where id = p_match_id for update;
  if not found or m.recovered then
    return false;
  end if;
  select * into l from poker_lost_posters where id = m.lost_id for update;
  if l.status <> 'pending' then
    return false;
  end if;
  if jackpot_owns(l.user_id, l.item_id, l.effect) then
    update poker_lost_posters set status = 'resolved', resolved_at = now() where id = l.id;
    return false;
  end if;
  update user_posters set reset_at = null, left_via = null
   where user_id = l.user_id and item_id = l.item_id and effect = l.effect and reset_at is not null;
  if not found then
    insert into user_posters (user_id, item_id, effect) values (l.user_id, l.item_id, l.effect)
    on conflict (user_id, item_id, effect) do nothing;
  end if;
  update poker_lost_posters set status = 'recovered', resolved_at = now(), recovered_match = m.id where id = l.id;
  update poker_recover_matches set recovered = true where id = m.id;
  return true;
end;
$$;

create or replace function public.poker_recover_step(
  p_uid uuid, p_match_id uuid, p_expected_seq integer, p_state jsonb, p_public_view jsonb, p_events_append jsonb,
  p_human_action jsonb, p_idem uuid, p_response jsonb, p_hands integer, p_captured jsonb, p_finished jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_recover_matches;
  l poker_lost_posters;
  v_status text;
  v_place int;
  v_result jsonb;
  v_response jsonb := p_response;
  st poker_player_stats;
begin
  perform poker_assert_service();
  if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text) > 262144
     or jsonb_typeof(p_public_view) is distinct from 'object' or octet_length(p_public_view::text) > 65536
     or octet_length(coalesce(p_response, '{}'::jsonb)::text) > 131072
     or coalesce(jsonb_typeof(p_events_append), 'array') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;

  update poker_recover_matches x set
    seq = x.seq + 1,
    state = p_state,
    public_view = p_public_view,
    events_tail = poker_jsonb_tail(x.events_tail || coalesce(p_events_append, '[]'::jsonb), 60),
    human_actions = case when p_human_action is null then x.human_actions else x.human_actions || jsonb_build_array(p_human_action) end,
    last_idem = p_idem,
    last_response = p_response,
    hands = coalesce(p_hands, x.hands),
    updated_at = now()
  where x.id = p_match_id and x.user_id = p_uid and x.seq = p_expected_seq and x.status = 'active'
  returning * into m;

  if not found then
    select * into m from poker_recover_matches where id = p_match_id and user_id = p_uid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    return jsonb_build_object('ok', false, 'code', case when m.status = 'active' then 'stale' else 'finished' end,
                              'seq', m.seq, 'view', m.public_view, 'recent', poker_jsonb_tail(m.events_tail, 20),
                              'result', m.result);
  end if;

  -- Eliminou o portador: o pôster volta agora e fica com a pessoa aconteça o que acontecer.
  if p_captured is not null and not m.recovered then
    perform poker_recover_grant(m.id);
    update poker_recover_matches set captured_hand = coalesce(poker_jint(p_captured, 'hand')::int, m.hands), captured_at = now()
     where id = m.id returning * into m;
  end if;

  if p_finished is not null then
    v_status := p_finished ->> 'status';
    v_place := poker_jint(p_finished, 'place');
    if v_status is null or v_status not in ('won', 'lost', 'forfeit', 'abandoned')
       or v_place is null or v_place not between 1 and 4 or (v_status = 'won') <> (v_place = 1) then
      raise exception 'bad_finish';
    end if;
    -- Vencer a mesa também devolve.
    if v_status = 'won' and not m.recovered then
      perform poker_recover_grant(m.id);
      update poker_recover_matches set captured_hand = coalesce(captured_hand, m.hands), captured_at = coalesce(captured_at, now())
       where id = m.id;
    end if;
    update poker_recover_matches
       set status = v_status, place = v_place, summary = p_finished -> 'summary', finished_at = now()
     where id = m.id returning * into m;
    update poker_lost_posters set offers = offers + 1 where id = m.lost_id;
    select * into l from poker_lost_posters where id = m.lost_id;

    -- Conta como uma casual (estatística do modo livre), com o resumo do servidor.
    if jsonb_typeof(p_finished -> 'summary') = 'object' then
      st := poker_stats_apply(p_uid, 'free', p_finished -> 'summary', v_place, v_status in ('forfeit', 'abandoned'), false, false);
      insert into poker_recent_matches (user_id, slot, client_id, played_at, place, hands, loan, summary)
      values (p_uid, ((st.matches - 1) % 20)::smallint, m.id, now(), v_place, m.hands, false, p_finished -> 'summary')
      on conflict (user_id, slot) do update
         set client_id = excluded.client_id, played_at = excluded.played_at, place = excluded.place,
             hands = excluded.hands, loan = excluded.loan, summary = excluded.summary;
    end if;
    perform poker_player_row(p_uid);
    update poker_players set first_played_at = coalesce(first_played_at, now()), last_played_at = now() where user_id = p_uid;

    v_result := coalesce(p_response -> 'result', '{}'::jsonb) || jsonb_build_object(
      'recovered', m.recovered, 'prizeCaptured', m.recovered,
      'poster', case when m.recovered then poker_poster_card(l.item_id, l.effect) end);
    v_response := jsonb_set(coalesce(p_response, '{}'::jsonb), '{result}', v_result);
    update poker_recover_matches set result = v_result, last_response = v_response where id = m.id returning * into m;
  end if;

  return jsonb_build_object('ok', true, 'seq', m.seq, 'response', v_response, 'result', v_result,
                            'captured', m.recovered);
end;
$$;

-- Bilhete não usado em 15 min vira 'void'; partida parada há 24 h vira 'abandoned'
-- (o pôster continua pendente: volta daqui a mais 3 casuais).
create or replace function public.poker_recover_expire()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  k int;
begin
  if coalesce(auth.role(), 'service_role') not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update poker_recover_matches set status = 'void', updated_at = now()
   where status = 'offered' and expires_at < now();
  get diagnostics n = row_count;
  update poker_recover_matches
     set status = 'abandoned', finished_at = now(), updated_at = now(),
         place = 4, result = jsonb_build_object('status', 'abandoned', 'recovered', false, 'prizeCaptured', false)
   where status = 'active' and started_at < now() - interval '24 hours';
  get diagnostics k = row_count;
  return n + k;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões e rotina
-- ---------------------------------------------------------------------------

revoke all on function public.poker_lost_record(uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.poker_lost_resolve_silent(uuid) from public, anon, authenticated;
revoke all on function public.poker_taker_of(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.poker_tournament_settle(uuid) from public, anon, authenticated;
revoke all on function public.poker_recover_prepare(uuid, uuid) from public, anon, authenticated;
revoke all on function public.poker_recover_open(uuid, uuid, text, text, text, integer, integer, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.poker_recover_load(uuid, uuid) from public, anon, authenticated;
revoke all on function public.poker_recover_grant(uuid) from public, anon, authenticated;
revoke all on function public.poker_recover_step(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.poker_recover_expire() from public, anon, authenticated;
grant execute on function public.poker_recover_prepare(uuid, uuid) to service_role;
grant execute on function public.poker_recover_open(uuid, uuid, text, text, text, integer, integer, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.poker_recover_load(uuid, uuid) to service_role;
grant execute on function public.poker_recover_step(uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, integer, jsonb, jsonb) to service_role;

revoke all on function public.poker_casual_begin() from public, anon;
grant execute on function public.poker_casual_begin() to authenticated;

select cron.schedule('poker-recover-expire', '*/10 * * * *', 'select public.poker_recover_expire();');
