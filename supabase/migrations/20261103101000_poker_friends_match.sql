-- Pôster Poker — fase 3, pacote F3 (03/11/2026): a PARTIDA da mesa com amigos.
--
-- A Edge poker-friends roda o motor (cartas, oráculos, relógio) e grava aqui o estado
-- inteiro (privado) e a cauda de eventos PRIVADOS; cada aparelho pede a sua visão à Edge,
-- que filtra pelo lugar de quem pede (só as próprias cartas fechadas). O banco é quem
-- manda no relógio: o prazo de 30 s fica em poker_rooms.deadline_at e um "estourou" só é
-- aceito com now() >= deadline_at. Fim: poker_room_settle entrega as apostas.
--
-- Sem fichas, sem tags do torneio. O placar de amigos sai de poker_room_members.place.

-- ---------------------------------------------------------------------------
-- Começar (quem criou): prepare → a Edge cria a partida → open
-- ---------------------------------------------------------------------------

-- As pessoas na ordem do motor do E3: p1 = quem criou, depois pela ordem de entrada.
create or replace function public.poker_room_people(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', x.user_id, 'playerId', 'p' || x.n) order by x.n), '[]'::jsonb)
    from (select m.user_id,
                 row_number() over (order by (m.user_id = r.host_id) desc, m.joined_at, m.user_id) as n
            from poker_room_members m
            join poker_rooms r on r.id = m.room_id
           where m.room_id = p_room_id and m.status = 'joined') x;
$$;

create or replace function public.poker_room_prepare(p_uid uuid, p_room_id uuid, p_idem uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  r poker_rooms;
  v_blockers text[];
  v_people jsonb;
  v_effects jsonb;
begin
  perform poker_assert_service();
  v_gate := poker_friends_gate(p_uid);
  if v_gate is not null then
    return v_gate;
  end if;
  select * into r from poker_rooms where id = p_room_id for update;
  if not found or not exists (select 1 from poker_room_members where room_id = p_room_id and user_id = p_uid and status = 'joined') then
    return poker_room_fail(404, 'no_room');
  end if;
  if r.host_id <> p_uid then
    return poker_room_fail(403, 'not_host');
  end if;
  if r.status = 'playing' and p_idem is not null and r.start_idem = p_idem then
    return jsonb_build_object('ok', false, 'status', 200, 'code', 'duplicate');
  end if;
  if r.status <> 'lobby' then
    return poker_room_fail(409, case when r.status = 'closed' then 'room_closed' else 'started' end);
  end if;
  v_blockers := poker_room_blockers(r.id);
  -- Quem está sentado ainda pode jogar (o pôquer não fechou para ninguém no meio do lobby).
  if exists (select 1 from poker_room_members m where m.room_id = r.id and m.status = 'joined'
              and poker_friends_gate(m.user_id) is not null) then
    v_blockers := v_blockers || 'member_closed'::text;
  end if;
  if cardinality(v_blockers) > 0 then
    return poker_room_fail(409, 'start_blocked', jsonb_build_object('blockers', to_jsonb(v_blockers)));
  end if;
  v_people := poker_room_people(r.id);
  if jsonb_array_length(v_people) not between 2 and 4 then
    return poker_room_fail(409, 'start_blocked', jsonb_build_object('blockers', jsonb_build_array('need_players')));
  end if;
  v_effects := poker_room_lobby_effects(r.id);
  return jsonb_build_object(
    'ok', true, 'version', r.version, 'people', v_people, 'effects', v_effects,
    'settings', poker_settings_json(), 'bot_params', poker_bot_params_json());
end;
$$;

-- p_seats: [{seat, playerId, kind: 'person'|'oracle', userId?, oracle?}] (lugares do motor).
create or replace function public.poker_room_open(
  p_uid uuid, p_room_id uuid, p_version integer, p_idem uuid,
  p_seed text, p_seed_hash text, p_engine_hash text, p_state_version integer, p_proto integer, p_params_version jsonb,
  p_seats jsonb, p_effects jsonb, p_state jsonb, p_events jsonb, p_to_act text, p_deadline_secs integer, p_hands integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r poker_rooms;
  v_people jsonb;
  s jsonb;
  v_persons int := 0;
begin
  perform poker_assert_service();
  if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text) > 393216
     or jsonb_typeof(p_seats) is distinct from 'array' or jsonb_array_length(p_seats) not between 2 and 4
     or jsonb_typeof(p_effects) is distinct from 'array' or jsonb_array_length(p_effects) > 8
     or coalesce(jsonb_typeof(p_events), 'array') <> 'array'
     or p_seed is null or p_seed_hash is null then
    return poker_room_fail(400, 'bad_request');
  end if;
  select * into r from poker_rooms where id = p_room_id for update;
  if not found or r.host_id <> p_uid then
    return poker_room_fail(404, 'no_room');
  end if;
  if r.status = 'playing' and p_idem is not null and r.start_idem = p_idem then
    return jsonb_build_object('ok', false, 'status', 200, 'code', 'duplicate');
  end if;
  if r.status <> 'lobby' then
    return poker_room_fail(409, 'started');
  end if;
  -- Algo mudou entre o prepare e o open (alguém entrou, saiu, trocou a aposta): refaz.
  if r.version <> p_version then
    return poker_room_fail(409, 'state_changed');
  end if;
  -- Os lugares das pessoas têm de ser exatamente os do banco (userId → playerId).
  v_people := poker_room_people(r.id);
  for s in select x from jsonb_array_elements(p_seats) x loop
    if s ->> 'kind' = 'person' then
      v_persons := v_persons + 1;
      if not exists (select 1 from jsonb_array_elements(v_people) p
                      where p ->> 'userId' = s ->> 'userId' and p ->> 'playerId' = s ->> 'playerId') then
        return poker_room_fail(400, 'bad_request');
      end if;
    elsif s ->> 'kind' <> 'oracle' or coalesce(s ->> 'oracle', '') not in ('bogart', 'fincher', 'cypher') then
      return poker_room_fail(400, 'bad_request');
    end if;
  end loop;
  if v_persons <> jsonb_array_length(v_people) then
    return poker_room_fail(400, 'bad_request');
  end if;

  update poker_rooms set
    status = 'playing', started_at = now(), start_idem = p_idem,
    seed = p_seed, seed_hash = p_seed_hash, engine_hash = p_engine_hash, state_version = p_state_version,
    proto = p_proto, params_version = p_params_version, seats = p_seats, effects = p_effects,
    state = p_state, events_tail = poker_jsonb_tail(coalesce(p_events, '[]'::jsonb), 200), seq = 1,
    to_act = p_to_act,
    deadline_at = case when p_to_act is null or p_deadline_secs is null then null
                       else now() + make_interval(secs => least(greatest(p_deadline_secs, 1), 120)) end,
    hands = coalesce(p_hands, 0), last_action_at = now()
  where id = r.id;
  update poker_room_members m
     set seat = (s2.x ->> 'seat')::smallint, player_id = s2.x ->> 'playerId', ready = false, away = false, timeouts = 0,
         updated_at = now()
    from (select x from jsonb_array_elements(p_seats) x where x ->> 'kind' = 'person') s2
   where m.room_id = r.id and m.user_id = (s2.x ->> 'userId')::uuid and m.status = 'joined';
  update poker_room_members set status = 'expired', updated_at = now() where room_id = r.id and status = 'invited';
  perform poker_room_ping(r.id);
  return jsonb_build_object('ok', true, 'seq', 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Carregar (a Edge) — p_uid null = a rotina agendada
-- ---------------------------------------------------------------------------

create or replace function public.poker_room_load(p_uid uuid, p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r poker_rooms;
  me poker_room_members;
begin
  perform poker_assert_service();
  select * into r from poker_rooms where id = p_room_id;
  if not found then
    return null;
  end if;
  if p_uid is not null then
    select * into me from poker_room_members where room_id = p_room_id and user_id = p_uid;
    if not found then
      return null;
    end if;
  end if;
  return jsonb_build_object(
    'id', r.id, 'status', r.status, 'host_id', r.host_id, 'seq', r.seq, 'version', r.version,
    'state', r.state, 'events_tail', r.events_tail, 'seats', r.seats, 'effects', r.effects,
    'seed_hash', r.seed_hash, 'seed', case when r.status = 'finished' then r.seed end,
    'to_act', r.to_act, 'deadline_at', r.deadline_at, 'deadline_passed', r.deadline_at is not null and now() >= r.deadline_at,
    'server_now', now(), 'created_at', r.created_at, 'started_at', r.started_at, 'result', r.result,
    'me', case when p_uid is null then null else jsonb_build_object(
      'user_id', me.user_id, 'status', me.status, 'player_id', me.player_id, 'seat', me.seat,
      'last_idem', me.last_idem, 'last_seq', me.last_seq) end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Um passo (jogada, estouro, voltar, sair)
-- ---------------------------------------------------------------------------

-- p_kind: 'act' | 'timeout' | 'back' | 'leave'. p_deadline_secs: null = ninguém a esperar;
-- -1 = mantém o prazo atual (voltar/sair não dão tempo a mais a quem está na vez).
-- p_people: {"p2": {"away": bool, "place": int|null, "status": "playing"|"out"|"left"}, …} (TableView.people).
-- p_finished: {winnerId, places: {playerId: place}} quando a partida acabou.
create or replace function public.poker_room_step(
  p_room_id uuid, p_expected_seq integer, p_kind text, p_actor uuid, p_idem uuid,
  p_state jsonb, p_events_append jsonb, p_to_act text, p_deadline_secs integer, p_hands integer,
  p_people jsonb, p_finished jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r poker_rooms;
  v_key text;
  v_val jsonb;
  v_result jsonb;
begin
  perform poker_assert_service();
  if p_kind is null or p_kind not in ('act', 'timeout', 'back', 'leave')
     or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text) > 393216
     or coalesce(jsonb_typeof(p_events_append), 'array') <> 'array'
     or octet_length(coalesce(p_events_append, '[]'::jsonb)::text) > 262144
     or (p_people is not null and jsonb_typeof(p_people) <> 'object') then
    return poker_room_fail(400, 'bad_request');
  end if;

  update poker_rooms x set
    seq = x.seq + 1,
    state = p_state,
    events_tail = poker_jsonb_tail(x.events_tail || coalesce(p_events_append, '[]'::jsonb), 200),
    to_act = p_to_act,
    deadline_at = case
      when p_to_act is null or p_deadline_secs is null then null
      when p_deadline_secs < 0 and x.to_act is not distinct from p_to_act then x.deadline_at
      when p_deadline_secs < 0 then now() + interval '30 seconds'
      else now() + make_interval(secs => least(greatest(p_deadline_secs, 1), 120)) end,
    hands = coalesce(p_hands, x.hands),
    last_action_at = case when p_kind = 'timeout' then x.last_action_at else now() end,
    updated_at = now()
  where x.id = p_room_id and x.seq = p_expected_seq and x.status = 'playing'
    -- O relógio é do servidor: estouro antes do prazo não passa.
    and (p_kind <> 'timeout' or (x.deadline_at is not null and now() >= x.deadline_at))
  returning * into r;

  if not found then
    select * into r from poker_rooms where id = p_room_id;
    if not found then
      return poker_room_fail(404, 'no_room');
    end if;
    if r.status <> 'playing' then
      return poker_room_fail(410, 'finished', jsonb_build_object('seq', r.seq));
    end if;
    if r.seq = p_expected_seq and p_kind = 'timeout' then
      return poker_room_fail(409, 'not_yet', jsonb_build_object('deadline', r.deadline_at, 'serverNow', now()));
    end if;
    return poker_room_fail(409, 'stale', jsonb_build_object('seq', r.seq));
  end if;

  -- Ausente / colocação / saída de cada pessoa (o motor é quem sabe).
  if p_people is not null then
    for v_key, v_val in select key, value from jsonb_each(p_people) loop
      update poker_room_members m set
        away = coalesce((v_val ->> 'away')::boolean, m.away),
        timeouts = coalesce(poker_jint(v_val, 'streak')::smallint, m.timeouts),
        place = coalesce(poker_jint(v_val, 'place')::smallint, m.place),
        out_reason = case when v_val ->> 'status' in ('out', 'left') then coalesce(m.out_reason, v_val ->> 'status') else m.out_reason end,
        updated_at = now()
      where m.room_id = r.id and m.player_id = v_key;
    end loop;
  end if;
  if p_actor is not null then
    update poker_room_members set last_idem = coalesce(p_idem, last_idem), last_seq = p_expected_seq, updated_at = now()
     where room_id = r.id and user_id = p_actor;
    if p_kind = 'leave' then
      update poker_room_members set status = 'left', left_at = now(), out_reason = 'left', updated_at = now()
       where room_id = r.id and user_id = p_actor and status = 'joined';
    end if;
  end if;

  if p_finished is not null then
    v_result := poker_room_settle(r.id, p_finished);
  end if;
  perform poker_room_ping(r.id);
  return jsonb_build_object('ok', true, 'seq', r.seq, 'result', v_result);
end;
$$;

-- Sair de uma partida em que a pessoa já caiu (só assistia): solta a sala sem mexer no jogo.
create or replace function public.poker_room_detach(p_uid uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform poker_assert_service();
  update poker_room_members set status = 'left', left_at = now(), updated_at = now()
   where room_id = p_room_id and user_id = p_uid and status = 'joined';
  if found then
    perform poker_room_ping(p_room_id);
  end if;
  return jsonb_build_object('ok', true, 'room', poker_room_json(p_room_id, p_uid));
end;
$$;

-- ---------------------------------------------------------------------------
-- O fim: quem venceu leva os pôsteres apostados
-- ---------------------------------------------------------------------------

-- Tira um pôster da coleção (perdido ou entregue): sai do equipado e das trocas abertas.
create or replace function public.poker_poster_take(p_uid uuid, p_item integer, p_effect text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update user_posters set reset_at = now(), left_via = 'poker'
   where user_id = p_uid and item_id = p_item and effect = p_effect and reset_at is null;
  if not found then
    return false;
  end if;
  update user_poster_equips set active = false
   where user_id = p_uid and item_id = p_item and effect = p_effect and active;
  update poster_trades set status = 'void', responded_at = now()
   where status = 'pending'
     and ((from_user = p_uid and offer_item = p_item and offer_effect = p_effect)
       or (to_user = p_uid and ask_item = p_item and ask_effect = p_effect));
  return true;
end;
$$;

-- Dá um pôster comum da coleção (trocável), como a troca faz.
create or replace function public.poker_poster_give(p_uid uuid, p_item integer, p_effect text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_posters (user_id, item_id, effect) values (p_uid, p_item, p_effect)
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, left_via = null, copies = 1, first_pulled_at = now(), last_pulled_at = now()
   where user_posters.reset_at is not null;
end;
$$;

-- p_finished = {winnerId, places: {playerId: place}}. O mapa lugar → pessoa/oráculo é o do
-- banco (poker_rooms.seats, gravado no open), nunca o que vier de fora.
create or replace function public.poker_room_settle(p_room_id uuid, p_finished jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r poker_rooms;
  v_winner text := p_finished ->> 'winnerId';
  v_seat jsonb;
  v_wuser uuid;
  v_woracle text;
  m poker_room_members;
  v_outcome text;
  v_stakes jsonb := '[]'::jsonb;
  v_users uuid[] := '{}';
  v_places jsonb;
  v_result jsonb;
begin
  select * into r from poker_rooms where id = p_room_id for update;
  if not found or r.status <> 'playing' then
    return r.result;
  end if;
  select x into v_seat from jsonb_array_elements(r.seats) x where x ->> 'playerId' = v_winner limit 1;
  if v_seat is null then
    raise exception 'bad_finish';
  end if;
  if v_seat ->> 'kind' = 'person' then
    v_wuser := (v_seat ->> 'userId')::uuid;
  else
    v_woracle := v_seat ->> 'oracle';
  end if;

  -- Colocações (as do motor), uma por pessoa.
  update poker_room_members mm
     set place = coalesce(poker_jint(p_finished -> 'places', mm.player_id)::smallint, mm.place), updated_at = now()
   where mm.room_id = r.id and mm.player_id is not null;

  for m in select * from poker_room_members where room_id = r.id and player_id is not null and stake_status = 'held'
           order by seat for update loop
    v_users := v_users || m.user_id;
    if v_wuser is not null and m.user_id = v_wuser then
      v_outcome := 'returned';
    elsif not jackpot_owns(m.user_id, m.stake_item_id, m.stake_effect) then
      -- Já não estava na coleção (não deveria acontecer: a aposta fica travada).
      v_outcome := 'returned';
    elsif v_wuser is not null then
      if jackpot_owns(v_wuser, m.stake_item_id, m.stake_effect) then
        -- O vencedor já ganhou uma cópia por outro caminho: esta volta ao dono.
        v_outcome := 'returned';
      else
        perform poker_poster_take(m.user_id, m.stake_item_id, m.stake_effect);
        perform poker_poster_give(v_wuser, m.stake_item_id, m.stake_effect);
        v_outcome := 'transferred';
      end if;
    else
      -- Venceu um oráculo: o pôster fica com ele e entra na devolução da casual.
      perform poker_poster_take(m.user_id, m.stake_item_id, m.stake_effect);
      perform poker_lost_record(m.user_id, m.stake_item_id, m.stake_effect, v_woracle, 'friends', r.id);
      v_outcome := 'lost';
    end if;
    update poker_room_members
       set stake_status = v_outcome, stake_to = case when v_outcome = 'transferred' then v_wuser end, updated_at = now()
     where room_id = r.id and user_id = m.user_id;
    v_stakes := v_stakes || (poker_poster_card(m.stake_item_id, m.stake_effect) || jsonb_build_object(
      'ownerId', m.user_id, 'outcome', v_outcome,
      'toUserId', case when v_outcome = 'transferred' then v_wuser end,
      'oracle', case when v_outcome = 'lost' then v_woracle end));
  end loop;
  if v_wuser is not null then
    v_users := v_users || v_wuser;
  end if;
  if cardinality(v_users) > 0 then
    perform jackpot_void_stale_trades(v_users);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('playerId', x ->> 'playerId',
                                               'place', poker_jint(p_finished -> 'places', x ->> 'playerId'),
                                               'userId', x ->> 'userId', 'oracle', x ->> 'oracle')
                            order by poker_jint(p_finished -> 'places', x ->> 'playerId') nulls last), '[]'::jsonb)
    into v_places
    from jsonb_array_elements(r.seats) x;

  v_result := jsonb_build_object(
    'winner', case when v_wuser is not null
                   then jsonb_build_object('kind', 'person', 'playerId', v_winner, 'userId', v_wuser)
                   else jsonb_build_object('kind', 'oracle', 'playerId', v_winner, 'oracle', v_woracle) end,
    'places', v_places,
    'stakes', v_stakes,
    'seed', r.seed);
  update poker_rooms
     set status = 'finished', finished_at = now(), to_act = null, deadline_at = null,
         winner_user = v_wuser, winner_oracle = v_woracle, result = v_result
   where id = r.id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- O relógio sem ninguém na sala: a rotina agendada chama a Edge (op 'sweep')
-- ---------------------------------------------------------------------------

-- As salas com prazo vencido (com 3 s de folga: os aparelhos da sala chegam antes).
create or replace function public.poker_room_due(p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform poker_assert_service();
  return coalesce((select jsonb_agg(x.id) from (
    select id from poker_rooms
     where status = 'playing' and deadline_at is not null and deadline_at <= now() - interval '3 seconds'
     order by deadline_at
     limit least(greatest(coalesce(p_limit, 10), 1), 50)) x), '[]'::jsonb);
end;
$$;

-- Chamada pelo pg_cron a cada 30 s: só acorda a Edge quando há prazo vencido. A chave
-- interna vem do cofre (curation.internal_api_key()); o Bearer é a chave pública (anon),
-- a mesma das outras rotinas (title-cache) — nenhum segredo neste arquivo.
create or replace function public.poker_friends_sweep_call()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from poker_rooms
                  where status = 'playing' and deadline_at is not null and deadline_at <= now() - interval '3 seconds') then
    return null;
  end if;
  select net.http_post(
    url := 'https://hewixvcatnuqftalzmtg.supabase.co/functions/v1/poker-friends',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhld2l4dmNhdG51cWZ0YWx6bXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MTY3NDMsImV4cCI6MjA2MDM5Mjc0M30.wK9jnuFFje_AtzqokWiuVYq2otYKW3rLPrIczw6ggFs',
      'x-internal-key', curation.internal_api_key()),
    body := jsonb_build_object('proto', 1, 'op', 'sweep'),
    timeout_milliseconds := 25000
  ) into v_id;
  return v_id;
end;
$$;

-- Faxina (a cada 10 min): lobby parado há 2 h fecha (apostas destravam); partida parada
-- há 24 h (a Edge caiu?) fecha sem vencedor e devolve as apostas — nada fica travado.
create or replace function public.poker_rooms_housekeeping()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  r poker_rooms;
begin
  if coalesce(auth.role(), 'service_role') not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in select * from poker_rooms
            where (status = 'lobby' and updated_at < now() - interval '2 hours')
               or (status = 'playing' and coalesce(last_action_at, started_at) < now() - interval '24 hours')
            for update skip locked loop
    update poker_rooms
       set status = 'closed', closed_reason = case when r.status = 'lobby' then 'idle' else 'stuck' end,
           finished_at = now(), to_act = null, deadline_at = null
     where id = r.id;
    update poker_room_members set stake_status = case when r.status = 'lobby' then null else 'returned' end,
                                  stake_item_id = case when r.status = 'lobby' then null else stake_item_id end,
                                  stake_effect = case when r.status = 'lobby' then null else stake_effect end,
                                  updated_at = now()
     where room_id = r.id and stake_status = 'held';
    update poker_room_members set status = 'expired', updated_at = now() where room_id = r.id and status = 'invited';
    perform poker_room_ping(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões e rotinas
-- ---------------------------------------------------------------------------

revoke all on function public.poker_room_people(uuid) from public, anon, authenticated;
revoke all on function public.poker_room_prepare(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.poker_room_open(uuid, uuid, integer, uuid, text, text, text, integer, integer, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer, integer) from public, anon, authenticated;
revoke all on function public.poker_room_load(uuid, uuid) from public, anon, authenticated;
revoke all on function public.poker_room_step(uuid, integer, text, uuid, uuid, jsonb, jsonb, text, integer, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.poker_room_detach(uuid, uuid) from public, anon, authenticated;
revoke all on function public.poker_poster_take(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.poker_poster_give(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.poker_room_settle(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.poker_room_due(integer) from public, anon, authenticated;
revoke all on function public.poker_friends_sweep_call() from public, anon, authenticated;
revoke all on function public.poker_rooms_housekeeping() from public, anon, authenticated;
grant execute on function public.poker_room_prepare(uuid, uuid, uuid) to service_role;
grant execute on function public.poker_room_open(uuid, uuid, integer, uuid, text, text, text, integer, integer, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer, integer) to service_role;
grant execute on function public.poker_room_load(uuid, uuid) to service_role;
grant execute on function public.poker_room_step(uuid, integer, text, uuid, uuid, jsonb, jsonb, text, integer, integer, jsonb, jsonb) to service_role;
grant execute on function public.poker_room_detach(uuid, uuid) to service_role;
grant execute on function public.poker_room_due(integer) to service_role;

select cron.schedule('poker-friends-sweep', '30 seconds', 'select public.poker_friends_sweep_call();');
select cron.schedule('poker-friends-housekeeping', '*/10 * * * *', 'select public.poker_rooms_housekeeping();');
