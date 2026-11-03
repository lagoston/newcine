-- Pôster Poker — fase 3, pacote F3 (03/11/2026): ajustes da mesa com amigos para a Edge.
-- poker_room_step devolve o prazo gravado (o relógio do banco) e quem está na vez;
-- poker_room_load devolve também a sala vista pela pessoa (um só RPC por sync).

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
  return jsonb_build_object('ok', true, 'seq', r.seq, 'result', v_result,
                            'toAct', r.to_act, 'deadline', r.deadline_at, 'serverNow', now());
end;
$$;

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
    'room', case when p_uid is null then null else poker_room_json(r.id, p_uid) end,
    'me', case when p_uid is null then null else jsonb_build_object(
      'user_id', me.user_id, 'status', me.status, 'player_id', me.player_id, 'seat', me.seat,
      'last_idem', me.last_idem, 'last_seq', me.last_seq) end);
end;
$$;
