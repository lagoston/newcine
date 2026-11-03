-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: a partida com prêmio.
--
-- A partida valendo prêmio roda na Edge Function poker-bounty (verify_jwt),
-- que guarda o estado aqui. As funções poker_bounty_* só aceitam a
-- service_role (revoke + checagem no corpo): o aparelho nunca grava nada da
-- partida com prêmio. Débito da ficha e criação da partida na mesma
-- transação; uma partida ativa por pessoa (índice único parcial); concorrência
-- otimista por seq; prêmio concedido no mesmo passo da captura.
--
-- Também: o lobby (get_poker_home), o placar (get_poker_scoreboard), o resumo
-- para o Jackpot (poker_teaser), os marcos → tags e os cron jobs.

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.poker_bounty_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  attempt smallint not null check (attempt between 1 and 10),
  prize_id text not null references public.poker_prizes(id),
  carrier text not null,
  rarity text not null,
  loan boolean not null default false,
  status text not null default 'active' check (status in ('active', 'won', 'lost', 'forfeit', 'abandoned', 'void')),
  place smallint check (place between 1 and 4),
  captured_hand int,
  captured_at timestamptz,
  seed text not null,                                        -- nunca sai antes do fim
  seed_hash text not null,
  engine_hash text not null,
  state_version smallint not null,
  proto smallint not null,
  params_version jsonb not null,
  state jsonb not null,
  public_view jsonb not null,
  events_tail jsonb not null default '[]',
  human_actions jsonb not null default '[]',
  seq int not null default 1,
  last_idem uuid,
  last_response jsonb,
  hands int not null default 0,
  alive_count smallint not null default 4,
  summary jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, day, attempt)
);
create unique index if not exists poker_bounty_one_active on public.poker_bounty_matches (user_id) where status = 'active';
create index if not exists poker_bounty_by_day on public.poker_bounty_matches (day, status);
create index if not exists poker_bounty_by_user on public.poker_bounty_matches (user_id, created_at desc);
create index if not exists poker_bounty_active_age on public.poker_bounty_matches (created_at) where status = 'active';

alter table public.poker_bounty_matches enable row level security;
revoke all on public.poker_bounty_matches from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auxiliares internos
-- ---------------------------------------------------------------------------

-- Só a Edge Function (service_role) passa.
create or replace function public.poker_assert_service()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Os últimos p_n elementos de um array JSON (a cauda de eventos).
create or replace function public.poker_jsonb_tail(p_arr jsonb, p_n int)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb)
    from (select e, o from jsonb_array_elements(case when jsonb_typeof(p_arr) = 'array' then p_arr else '[]'::jsonb end)
                       with ordinality t(e, o)
           order by o desc limit greatest(p_n, 0)) x;
$$;

-- Tentativas do dia (partidas void não contam).
create or replace function public.poker_attempts_used(p_uid uuid, p_day date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from poker_bounty_matches where user_id = p_uid and day = p_day and status <> 'void';
$$;

-- Já capturou o prêmio deste dia?
create or replace function public.poker_won_today(p_uid uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from poker_bounty_matches where user_id = p_uid and day = p_day and captured_hand is not null);
$$;

-- Empréstimo do Sapo: as últimas N partidas com prêmio terminadas (em
-- qualquer dia) acabaram todas sem captura. Uma captura zera a sequência.
create or replace function public.poker_loan_due(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= s.loan_after_losses and coalesce(bool_and(x.captured_hand is null), false)
    from poker_settings s
    left join lateral (
      select m.captured_hand
        from poker_bounty_matches m
       where m.user_id = p_uid and m.status in ('won', 'lost', 'forfeit', 'abandoned')
       order by m.finished_at desc nulls last, m.created_at desc
       limit s.loan_after_losses) x on true
   group by s.loan_after_losses;
$$;

-- Os números da mesa (o mesmo formato para a Edge e para o lobby).
create or replace function public.poker_settings_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('start_stack', s.start_stack, 'hands_per_level', s.hands_per_level, 'levels', s.levels,
                            'loan_amount', s.loan_amount, 'max_attempts', s.max_attempts,
                            'carrier_by_rarity', s.carrier_by_rarity, 'difficulty', s.difficulty)
    from poker_settings s;
$$;

create or replace function public.poker_bot_params_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(b.rival_id, jsonb_build_object('version', b.version, 'params', b.params)), '{}'::jsonb)
    from poker_bot_params b;
$$;

-- As verificações do start (repetidas no open, dentro da transação do débito).
-- Devolve {ok:false, status, code, …} ou {ok:true, attempt, prize_id, …}.
create or replace function public.poker_bounty_check(p_uid uuid, p_day date, p_prize_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg poker_settings;
  v_active poker_bounty_matches;
  v_used int;
  eff jsonb;
begin
  select * into cfg from poker_settings;
  if not poker_enabled(p_uid) then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'closed');
  end if;
  if poker_is_bot(p_uid) then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'bot');
  end if;
  if (select age_confirmed_at from poker_players where user_id = p_uid) is null then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'age_required');
  end if;
  if p_day is distinct from poker_today() then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'stale_day', 'day', poker_today());
  end if;
  select * into v_active from poker_bounty_matches where user_id = p_uid and status = 'active';
  if found then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'active_exists', 'matchId', v_active.id,
                              'expired', v_active.created_at < now() - interval '24 hours');
  end if;
  if poker_won_today(p_uid, p_day) then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'won_today');
  end if;
  v_used := poker_attempts_used(p_uid, p_day);
  if v_used >= cfg.max_attempts then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'limit');
  end if;
  eff := poker_effective_prize(p_uid, p_day);
  if eff is null then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'closed');
  end if;
  if eff ->> 'prize_id' is distinct from p_prize_id then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'prize_changed',
                              'prize', poker_prize_json(eff ->> 'prize_id'),
                              'is_reserve', eff -> 'is_reserve', 'is_fallback', eff -> 'is_fallback');
  end if;
  return jsonb_build_object(
    'ok', true,
    'attempt', coalesce((select max(attempt) from poker_bounty_matches where user_id = p_uid and day = p_day), 0) + 1,
    'attempts_used', v_used,
    'prize_id', eff ->> 'prize_id', 'is_reserve', eff -> 'is_reserve', 'is_fallback', eff -> 'is_fallback',
    'rarity', eff ->> 'rarity', 'carrier', eff ->> 'carrier',
    'stars', coalesce((cfg.difficulty -> (eff ->> 'rarity') ->> 'stars')::int, 0),
    'loan', case when poker_loan_due(p_uid) then cfg.loan_amount else 0 end);
end;
$$;

revoke all on function public.poker_assert_service() from public, anon, authenticated;
revoke all on function public.poker_jsonb_tail(jsonb, int) from public, anon, authenticated;
revoke all on function public.poker_attempts_used(uuid, date) from public, anon, authenticated;
revoke all on function public.poker_won_today(uuid, date) from public, anon, authenticated;
revoke all on function public.poker_loan_due(uuid) from public, anon, authenticated;
revoke all on function public.poker_settings_json() from public, anon, authenticated;
revoke all on function public.poker_bot_params_json() from public, anon, authenticated;
revoke all on function public.poker_bounty_check(uuid, date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Marcos → tags (§2.9). Só partidas com prêmio; marco nunca dá ficha.
-- ---------------------------------------------------------------------------

create or replace function public.poker_award_marks(p_uid uuid, p_match_id uuid, p_summary jsonb)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_bounty_matches;
  s jsonb := coalesce(p_summary, '{}'::jsonb);
  v_elims jsonb := case when jsonb_typeof(p_summary -> 'eliminations') = 'array' then p_summary -> 'eliminations' else '[]'::jsonb end;
  v_tags text[] := '{}';
  v_new text[];
begin
  select * into m from poker_bounty_matches where id = p_match_id and user_id = p_uid;
  if not found then
    return '{}';
  end if;

  -- Primeira Vitória: 1º lugar numa partida com prêmio.
  if m.status = 'won' and m.place = 1 then
    v_tags := v_tags || 'poker-first-win';
  end if;
  -- Derrubou o Raposo: eliminatorOf(fincher) = human.
  if (s -> 'marks' -> 'foxHunter') = 'true'::jsonb
     or exists (select 1 from jsonb_array_elements(v_elims) e where e ->> 'victimId' = 'fincher' and e ->> 'byId' = 'human') then
    v_tags := v_tags || 'poker-fox-hunter';
  end if;
  -- Limpa-Mesa: a pessoa eliminou os três oráculos na mesma partida.
  if (s -> 'marks' -> 'cleanSweep') = 'true'::jsonb
     or (select count(distinct e ->> 'victimId') from jsonb_array_elements(v_elims) e
          where e ->> 'byId' = 'human' and e ->> 'victimId' in ('bogart', 'cypher', 'fincher')) = 3 then
    v_tags := v_tags || 'poker-clean-sweep';
  end if;
  -- Blefe de Oscar: apurado pelo motor no servidor (informação privada).
  if (s -> 'marks' -> 'oscarBluff') = 'true'::jsonb then
    v_tags := v_tags || 'poker-oscar-bluff';
  end if;
  -- Uma Semana na Mesa: 7 dias seguidos de Brasília com partida com prêmio terminada.
  if (select count(distinct x.day) from poker_bounty_matches x
       where x.user_id = p_uid and x.status in ('won', 'lost', 'forfeit', 'abandoned')
         and x.day between m.day - 6 and m.day) = 7 then
    v_tags := v_tags || 'poker-seven-nights';
  end if;

  with ins as (
    insert into user_special_tags (user_id, tag_id, is_permanent)
    select p_uid, t, true from unnest(v_tags) t
     where exists (select 1 from special_tags st where st.id = t)
    on conflict do nothing
    returning tag_id
  )
  select coalesce(array_agg(tag_id), '{}') into v_new from ins;
  return v_new;
end;
$$;

-- Fim de uma partida com prêmio: estatísticas verificadas, memória do
-- Raposo, data da última partida e marcos. Devolve as tags novas.
create or replace function public.poker_apply_bounty_result(p_uid uuid, p_match_id uuid, p_summary jsonb, p_model jsonb)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_bounty_matches;
begin
  select * into m from poker_bounty_matches where id = p_match_id and user_id = p_uid;
  if not found or m.status not in ('won', 'lost', 'forfeit', 'abandoned') then
    return '{}';
  end if;
  perform poker_stats_apply(p_uid, 'bounty', coalesce(p_summary, '{}'::jsonb), m.place,
                            m.status in ('forfeit', 'abandoned'), m.loan, m.captured_hand is not null);
  if jsonb_typeof(p_model) = 'object' and octet_length(p_model::text) <= 32768 then
    update poker_player_stats set model = p_model where user_id = p_uid and mode = 'bounty';
  end if;
  perform poker_player_row(p_uid);
  update poker_players set first_played_at = coalesce(first_played_at, now()), last_played_at = now() where user_id = p_uid;
  return poker_award_marks(p_uid, p_match_id, p_summary);
end;
$$;

-- O resultado público de uma partida terminada (seed revelada aqui).
create or replace function public.poker_result_json(p_match_id uuid, p_marks text[], p_wins_before int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'status', m.status, 'place', m.place,
    'prizeCaptured', m.captured_hand is not null,
    'prize', case when m.captured_hand is not null then poker_prize_json(m.prize_id) end,
    'seed', m.seed, 'seedHash', m.seed_hash,
    'marks', to_jsonb(coalesce(p_marks, '{}')),
    'title', jsonb_build_object('wins', w.n, 'id', poker_title(w.n), 'rankUp', poker_title(w.n) <> poker_title(p_wins_before)))
  from poker_bounty_matches m, lateral (select poker_wins_total(m.user_id) as n) w
  where m.id = p_match_id;
$$;

revoke all on function public.poker_award_marks(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.poker_apply_bounty_result(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.poker_result_json(uuid, text[], int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Só a Edge Function (service_role)
-- ---------------------------------------------------------------------------

-- start, parte 1 (só lê): as verificações e o que a Edge precisa para montar
-- o MatchConfig. p_proto abaixo do mínimo → 426 antes de qualquer cobrança.
create or replace function public.poker_bounty_prepare(p_uid uuid, p_day date, p_prize_id text, p_proto int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg poker_settings;
  c jsonb;
  v_tickets int;
begin
  perform poker_assert_service();
  select * into cfg from poker_settings;
  if coalesce(p_proto, 0) < cfg.min_proto then
    return jsonb_build_object('ok', false, 'status', 426, 'code', 'update_required', 'min_proto', cfg.min_proto);
  end if;
  c := poker_bounty_check(p_uid, p_day, p_prize_id);
  if not (c ->> 'ok')::boolean then
    return c;
  end if;
  select tickets into v_tickets from jackpot_wallets where user_id = p_uid;
  if coalesce(v_tickets, 0) < 1 then
    return jsonb_build_object('ok', false, 'status', 402, 'code', 'no_chips');
  end if;
  return c || jsonb_build_object(
    'prize', poker_prize_json(c ->> 'prize_id'),
    'settings', poker_settings_json(),
    'bot_params', poker_bot_params_json(),
    'memory', (select nullif(s.model, '{}'::jsonb) from poker_player_stats s where s.user_id = p_uid and s.mode = 'bounty'),
    'difficulty', cfg.difficulty -> (c ->> 'rarity'),
    'min_proto', cfg.min_proto,
    'tickets', v_tickets);
end;
$$;

-- start, parte 2 (numa transação): repete as verificações, debita 1 ficha e
-- cria a partida. Se algo mudou desde o prepare (tentativa, empréstimo,
-- portador ou raridade), responde state_changed e a Edge refaz o start.
create or replace function public.poker_bounty_open(
  p_uid uuid, p_day date, p_attempt int, p_prize_id text, p_carrier text, p_rarity text, p_loan int,
  p_seed text, p_seed_hash text, p_engine_hash text, p_state_version int, p_proto int, p_params_version jsonb,
  p_state jsonb, p_public_view jsonb, p_events_tail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg poker_settings;
  c jsonb;
  v_tickets int;
  v_id uuid;
begin
  perform poker_assert_service();
  -- Uma abertura por pessoa de cada vez (dois aparelhos ao mesmo tempo).
  perform pg_advisory_xact_lock(hashtext('poker_bounty_open:' || p_uid::text));
  select * into cfg from poker_settings;
  if coalesce(p_proto, 0) < cfg.min_proto then
    return jsonb_build_object('ok', false, 'status', 426, 'code', 'update_required', 'min_proto', cfg.min_proto);
  end if;
  c := poker_bounty_check(p_uid, p_day, p_prize_id);
  if not (c ->> 'ok')::boolean then
    return c;
  end if;
  if (c ->> 'attempt')::int is distinct from p_attempt or (c ->> 'loan')::int is distinct from coalesce(p_loan, 0)
     or c ->> 'carrier' is distinct from p_carrier or c ->> 'rarity' is distinct from p_rarity then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'state_changed');
  end if;
  if coalesce(p_seed, '') !~ '^[0-9a-f]{32,64}$'
     or p_seed_hash is distinct from encode(sha256(convert_to(p_seed, 'UTF8')), 'hex')
     or coalesce(p_engine_hash, '') = '' or p_state_version is null
     or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text) > 262144
     or jsonb_typeof(p_public_view) is distinct from 'object' or octet_length(p_public_view::text) > 65536
     or jsonb_typeof(p_params_version) is distinct from 'object'
     or coalesce(jsonb_typeof(p_events_tail), 'array') <> 'array' then
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'bad_request');
  end if;

  perform jackpot_wallet_row(p_uid);
  begin
    update jackpot_wallets set tickets = tickets - 1, updated_at = now()
     where user_id = p_uid and tickets >= 1
    returning tickets into v_tickets;
    if v_tickets is null then
      return jsonb_build_object('ok', false, 'status', 402, 'code', 'no_chips');
    end if;
    insert into poker_bounty_matches (user_id, day, attempt, prize_id, carrier, rarity, loan, seed, seed_hash,
                                      engine_hash, state_version, proto, params_version, state, public_view, events_tail)
    values (p_uid, p_day, p_attempt, p_prize_id, p_carrier, p_rarity, coalesce(p_loan, 0) > 0, p_seed, p_seed_hash,
            p_engine_hash, p_state_version, p_proto, p_params_version, p_state, p_public_view,
            poker_jsonb_tail(coalesce(p_events_tail, '[]'::jsonb), 60))
    returning id into v_id;
  exception when unique_violation then
    -- A ficha volta (o bloco inteiro é desfeito).
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'active_exists',
      'matchId', (select id from poker_bounty_matches where user_id = p_uid and status = 'active'));
  end;

  perform poker_player_row(p_uid);
  update poker_players set first_played_at = coalesce(first_played_at, now()), last_played_at = now() where user_id = p_uid;
  return jsonb_build_object('ok', true, 'match_id', v_id, 'seq', 1, 'attempt', p_attempt, 'tickets', v_tickets);
end;
$$;

-- A partida (sem id: a ativa da pessoa). null = não existe.
create or replace function public.poker_bounty_load(p_uid uuid, p_match_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_bounty_matches;
begin
  perform poker_assert_service();
  if p_match_id is null then
    select * into m from poker_bounty_matches where user_id = p_uid and status = 'active';
  else
    select * into m from poker_bounty_matches where user_id = p_uid and id = p_match_id;
  end if;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', m.id, 'status', m.status, 'seq', m.seq, 'last_idem', m.last_idem, 'last_response', m.last_response,
    'state', m.state, 'public_view', m.public_view, 'events_tail', m.events_tail,
    'seed', m.seed, 'seed_hash', m.seed_hash, 'day', m.day, 'attempt', m.attempt,
    'prize_id', m.prize_id, 'prize', poker_prize_json(m.prize_id), 'carrier', m.carrier, 'rarity', m.rarity,
    'stars', coalesce((select (s.difficulty -> m.rarity ->> 'stars')::int from poker_settings s), 0),
    'loan', m.loan, 'hands', m.hands, 'alive_count', m.alive_count, 'captured_hand', m.captured_hand,
    'result', m.result, 'created_at', m.created_at, 'engine_hash', m.engine_hash, 'state_version', m.state_version,
    'expired', m.status = 'active' and m.created_at < now() - interval '24 hours');
end;
$$;

-- Um passo da partida (act/forfeit/abandono), numa transação:
--   UPDATE … WHERE seq = esperado AND status = 'active' (concorrência otimista);
--   captura → poker_grant_prize no mesmo passo; fim → status, resultado,
--   estatísticas e marcos. O resultado volta completo (com marcos e título)
--   em response.result, e é isso que fica em last_response para a repetição.
create or replace function public.poker_bounty_step(
  p_uid uuid, p_match_id uuid, p_expected_seq int, p_state jsonb, p_public_view jsonb, p_events_append jsonb,
  p_human_action jsonb, p_idem uuid, p_response jsonb, p_hands int, p_alive_count int,
  p_captured jsonb, p_finished jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_bounty_matches;
  v_status text;
  v_place int;
  v_marks text[];
  v_wins_before int;
  v_result jsonb;
  v_response jsonb := p_response;
begin
  perform poker_assert_service();
  if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text) > 262144
     or jsonb_typeof(p_public_view) is distinct from 'object' or octet_length(p_public_view::text) > 65536
     or octet_length(coalesce(p_response, '{}'::jsonb)::text) > 131072
     or coalesce(jsonb_typeof(p_events_append), 'array') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;

  update poker_bounty_matches x set
    seq = x.seq + 1,
    state = p_state,
    public_view = p_public_view,
    events_tail = poker_jsonb_tail(x.events_tail || coalesce(p_events_append, '[]'::jsonb), 60),
    human_actions = case when p_human_action is null then x.human_actions else x.human_actions || jsonb_build_array(p_human_action) end,
    last_idem = p_idem,
    last_response = p_response,
    hands = coalesce(p_hands, x.hands),
    alive_count = greatest(1, least(4, coalesce(p_alive_count, x.alive_count))),
    updated_at = now()
  where x.id = p_match_id and x.user_id = p_uid and x.seq = p_expected_seq and x.status = 'active'
  returning * into m;

  if not found then
    select * into m from poker_bounty_matches where id = p_match_id and user_id = p_uid;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    return jsonb_build_object('ok', false, 'code', case when m.status = 'active' then 'stale' else 'finished' end,
                              'seq', m.seq, 'view', m.public_view, 'recent', poker_jsonb_tail(m.events_tail, 20),
                              'result', m.result);
  end if;

  -- Captura: o prêmio é concedido agora e fica com a pessoa aconteça o que acontecer.
  if p_captured is not null and m.captured_hand is null then
    perform poker_grant_prize(p_uid, m.prize_id, 'bounty', m.id::text, m.day);
    update poker_bounty_matches set captured_hand = coalesce(poker_jint(p_captured, 'hand')::int, m.hands), captured_at = now()
     where id = m.id returning * into m;
  end if;

  if p_finished is not null then
    v_status := p_finished ->> 'status';
    v_place := poker_jint(p_finished, 'place');
    if v_status is null or v_status not in ('won', 'lost', 'forfeit', 'abandoned')
       or v_place is null or v_place not between 1 and 4 or (v_status = 'won') <> (v_place = 1) then
      raise exception 'bad_finish';
    end if;
    -- Quem vence a mesa sempre leva o prêmio (rede de segurança).
    if v_status = 'won' and m.captured_hand is null then
      perform poker_grant_prize(p_uid, m.prize_id, 'bounty', m.id::text, m.day);
      update poker_bounty_matches set captured_hand = m.hands, captured_at = now() where id = m.id returning * into m;
    end if;
    v_wins_before := poker_wins_total(p_uid);
    update poker_bounty_matches
       set status = v_status, place = v_place, summary = p_finished -> 'summary', finished_at = now()
     where id = m.id returning * into m;
    v_marks := poker_apply_bounty_result(p_uid, m.id, p_finished -> 'summary', p_finished -> 'model');
    v_result := coalesce(p_response -> 'result', '{}'::jsonb) || poker_result_json(m.id, v_marks, v_wins_before);
    v_response := jsonb_set(coalesce(p_response, '{}'::jsonb), '{result}', v_result);
    update poker_bounty_matches set result = v_result, last_response = v_response where id = m.id;
  end if;

  return jsonb_build_object('ok', true, 'seq', m.seq, 'response', v_response, 'result', v_result,
                            'captured', m.captured_hand is not null);
end;
$$;

-- Cron (de hora em hora): partida ativa há mais de 24 h vira 'abandoned' na
-- colocação do momento (vivos), com um resumo mínimo.
create or replace function public.poker_bounty_expire()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_bounty_matches;
  n int := 0;
  v_place int;
  v_summary jsonb;
  v_marks text[];
  v_wins_before int;
begin
  if coalesce(auth.role(), 'service_role') not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for m in
    select * from poker_bounty_matches
     where status = 'active' and created_at < now() - interval '24 hours'
     order by created_at
     for update skip locked
  loop
    v_place := greatest(2, least(4, m.alive_count));
    v_summary := jsonb_build_object('v', 1, 'mode', 'bounty', 'minimal', true, 'hands', m.hands, 'place', v_place,
                                    'reason', 'abandoned', 'loan', m.loan,
                                    'prize', jsonb_build_object('prizeId', m.prize_id, 'capturedHand', m.captured_hand));
    v_wins_before := poker_wins_total(m.user_id);
    update poker_bounty_matches set status = 'abandoned', place = v_place, summary = v_summary, finished_at = now(), updated_at = now()
     where id = m.id;
    v_marks := poker_apply_bounty_result(m.user_id, m.id, v_summary, null);
    update poker_bounty_matches set result = poker_result_json(m.id, v_marks, v_wins_before) where id = m.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.poker_bounty_prepare(uuid, date, text, int) from public, anon, authenticated;
revoke all on function public.poker_bounty_open(uuid, date, int, text, text, text, int, text, text, text, int, int, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.poker_bounty_load(uuid, uuid) from public, anon, authenticated;
revoke all on function public.poker_bounty_step(uuid, uuid, int, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, int, int, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.poker_bounty_expire() from public, anon, authenticated;
grant execute on function public.poker_bounty_prepare(uuid, date, text, int) to service_role;
grant execute on function public.poker_bounty_open(uuid, date, int, text, text, text, int, text, text, text, int, int, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.poker_bounty_load(uuid, uuid) to service_role;
grant execute on function public.poker_bounty_step(uuid, uuid, int, jsonb, jsonb, jsonb, jsonb, uuid, jsonb, int, int, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Cliente: lobby, placar e o resumo para o Jackpot
-- ---------------------------------------------------------------------------

-- O campo "poker" de get_jackpot_state (§5.5). Leve: o dia já está gravado
-- (cron das 00:01), então são só leituras.
create or replace function public.poker_teaser(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg poker_settings;
  v_day date := poker_today();
  d poker_bounty_days;
  eff jsonb;
  v_prize_id text;
  v_used int;
  v_won boolean;
  v_active boolean;
  v_last timestamptz;
  v_strip boolean;
  v_rarity text;
begin
  if not poker_enabled(p_uid) or poker_is_bot(p_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  select * into cfg from poker_settings;
  d := poker_bounty_for_day(v_day);
  if d.day is null then
    return jsonb_build_object('enabled', true, 'day', v_day, 'prize', null, 'home_strip', false);
  end if;
  eff := poker_effective_prize(p_uid, v_day);
  v_rarity := eff ->> 'rarity';
  -- Capturou hoje? Mostra o que levou (não o reserva).
  select prize_id into v_prize_id from poker_bounty_matches
   where user_id = p_uid and day = v_day and captured_hand is not null limit 1;
  v_won := v_prize_id is not null;
  v_prize_id := coalesce(v_prize_id, eff ->> 'prize_id');
  v_used := poker_attempts_used(p_uid, v_day);
  v_active := exists (select 1 from poker_bounty_matches where user_id = p_uid and status = 'active');
  select last_played_at into v_last from poker_players where user_id = p_uid;
  -- Faixa da home: liberado, ainda não tentou nem capturou hoje e (lançamento
  -- recente ou jogou nos últimos 14 dias). Sem launched_at (só testers): mostra.
  v_strip := v_used = 0 and not v_won
             and (cfg.launched_at is null
                  or now() < cfg.launched_at + make_interval(days => cfg.home_strip_launch_days)
                  or v_last > now() - make_interval(days => cfg.home_strip_recent_days));
  return jsonb_build_object(
    'enabled', true,
    'day', v_day,
    'prize', (select jsonb_build_object('id', j ->> 'id', 'kind', j ->> 'kind', 'rarity', j ->> 'rarity',
                                        'name_pt', j ->> 'name_pt', 'name_en', j ->> 'name_en', 'article_pt', j ->> 'article_pt',
                                        'image', j ->> 'image', 'payload', j -> 'payload')
                from poker_prize_json(v_prize_id) j),
    'carrier', eff ->> 'carrier',
    'stars', coalesce((cfg.difficulty -> v_rarity ->> 'stars')::int, 0),
    'attempts_used', v_used,
    'max_attempts', cfg.max_attempts,
    'won_today', v_won,
    'active', v_active,
    'home_strip', v_strip,
    'wins', poker_wins_total(p_uid),
    'matches', coalesce((select sum(matches) from poker_player_stats where user_id = p_uid), 0));
end;
$$;

revoke all on function public.poker_teaser(uuid) from public, anon, authenticated;

-- O lobby inteiro numa chamada (§5.3). Volátil: pode gravar o dia sorteado.
create or replace function public.get_poker_home()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  cfg poker_settings;
  pl poker_players;
  v_day date := poker_today();
  d poker_bounty_days;
  t poker_bounty_days;
  eff jsonb;
  a poker_bounty_matches;
  v_won_prize text;
  v_prize_id text;
  v_rarity text;
  v_carrier text;
  v_bounty jsonb;
  v_wins int;
  v_tickets int;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  select * into cfg from poker_settings;
  pl := poker_player_row(v_uid);
  select tickets into v_tickets from jackpot_wallets where user_id = v_uid;

  d := poker_bounty_for_day(v_day);
  if d.day is not null then
    eff := poker_effective_prize(v_uid, v_day);
    select * into a from poker_bounty_matches where user_id = v_uid and status = 'active';
    select prize_id into v_won_prize from poker_bounty_matches
     where user_id = v_uid and day = v_day and captured_hand is not null limit 1;
    -- O cartão mostra: a partida de hoje em andamento, o que levou hoje ou o efetivo.
    v_prize_id := coalesce(case when a.day = v_day then a.prize_id end, v_won_prize, eff ->> 'prize_id');
    v_rarity := eff ->> 'rarity';
    v_carrier := eff ->> 'carrier';
    t := poker_bounty_for_day(v_day + 1);
    v_bounty := jsonb_build_object(
      'day', v_day,
      'ends_at', ((v_day + 1)::timestamp at time zone 'America/Sao_Paulo'),
      'prize', poker_prize_json(v_prize_id),
      'is_reserve', v_prize_id = eff ->> 'prize_id' and (eff -> 'is_reserve') = 'true'::jsonb,
      'is_fallback', v_prize_id = eff ->> 'prize_id' and (eff -> 'is_fallback') = 'true'::jsonb,
      'rarity', v_rarity,
      'carrier', v_carrier,
      'stars', coalesce((cfg.difficulty -> v_rarity ->> 'stars')::int, 0),
      'attempts_used', poker_attempts_used(v_uid, v_day),
      'max_attempts', cfg.max_attempts,
      'won_today', v_won_prize is not null,
      'loan_next', poker_loan_due(v_uid),
      'friends_won', (select count(distinct g.user_id) from poker_prize_grants g
                       where g.source = 'bounty' and g.day = v_day and g.user_id <> v_uid
                         and exists (select 1 from friendships f
                                      where f.status = 'accepted'
                                        and ((f.requester_id = v_uid and f.addressee_id = g.user_id)
                                          or (f.addressee_id = v_uid and f.requester_id = g.user_id)))),
      'tomorrow', case when t.day is not null then jsonb_build_object(
                    'rarity', (select p.rarity from poker_prizes p where p.id = t.prize_id),
                    'carrier', poker_day_carrier(t.carrier, t.prize_id)) end,
      'active', case when a.id is not null then jsonb_build_object(
                  'match_id', a.id, 'hand', a.hands, 'seq', a.seq, 'day', a.day, 'prize_id', a.prize_id) end,
      'tickets', coalesce(v_tickets, 0));
  end if;

  v_wins := poker_wins_total(v_uid);
  return jsonb_build_object(
    'enabled', true,
    'proto_min', cfg.min_proto,
    'settings', poker_settings_json(),
    'bot_params', poker_bot_params_json(),
    'bounty', v_bounty,
    'player', jsonb_build_object(
      'age_confirmed', pl.age_confirmed_at is not null,
      'age_gate_all', cfg.casino_age_gate,
      'tutorial_done', pl.tutorial_done_at is not null,
      'tutorial_chip', pl.tutorial_chip_at is not null,
      'story', pl.story,
      'lifetime_matches', coalesce((select sum(matches) from poker_player_stats where user_id = v_uid), 0),
      'last_played_at', pl.last_played_at),
    'stats', jsonb_build_object('free', poker_stats_json(v_uid, 'free'), 'bounty', poker_stats_json(v_uid, 'bounty')),
    'title', jsonb_build_object('wins', v_wins, 'id', poker_title(v_wins)),
    'loadout', poker_loadout_json(v_uid),
    'owned_items', coalesce((select jsonb_agg(o.item_id order by o.acquired_at) from poker_owned_items o where o.user_id = v_uid), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'name_pt', i.name_pt, 'name_en', i.name_en,
                                                            'is_default', i.is_default,
                                                            'owned', i.is_default or exists (select 1 from poker_owned_items o where o.user_id = v_uid and o.item_id = i.id))
                                         order by i.kind, i.sort, i.id)
                         from poker_items i where i.is_active), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('tag_id', u.tag_id, 'unlocked_at', u.unlocked_at) order by u.unlocked_at)
                         from user_special_tags u
                        where u.user_id = v_uid and u.tag_id in ('poker-first-win', 'poker-fox-hunter', 'poker-clean-sweep',
                                                                 'poker-oscar-bluff', 'poker-seven-nights')), '[]'::jsonb));
end;
$$;

-- O placar (§5.3, §7.7): livre e prêmio, as 20 últimas de cada, prêmios,
-- marcos (com a regra para a silhueta) e amigos que levaram o prêmio hoje.
create or replace function public.get_poker_scoreboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := poker_today();
  v_wins int;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  v_wins := poker_wins_total(v_uid);
  return jsonb_build_object(
    'enabled', true,
    'stats', jsonb_build_object('free', poker_stats_json(v_uid, 'free'), 'bounty', poker_stats_json(v_uid, 'bounty')),
    'title', jsonb_build_object('wins', v_wins, 'id', poker_title(v_wins)),
    'recent_free', coalesce((
      select jsonb_agg(jsonb_build_object('client_id', r.client_id, 'played_at', r.played_at, 'place', r.place,
                                          'hands', r.hands, 'loan', r.loan, 'summary', r.summary) order by r.played_at desc)
        from poker_recent_matches r where r.user_id = v_uid), '[]'::jsonb),
    'recent_bounty', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'day', m.day, 'attempt', m.attempt, 'status', m.status, 'place', m.place,
               'prize', (select jsonb_build_object('id', j ->> 'id', 'kind', j ->> 'kind', 'rarity', j ->> 'rarity',
                                                   'name_pt', j ->> 'name_pt', 'name_en', j ->> 'name_en', 'image', j ->> 'image')
                           from poker_prize_json(m.prize_id) j),
               'carrier', m.carrier, 'rarity', m.rarity, 'loan', m.loan, 'captured_hand', m.captured_hand,
               'hands', m.hands, 'created_at', m.created_at, 'finished_at', m.finished_at, 'seed_hash', m.seed_hash,
               'seed', case when m.status <> 'active' then m.seed end,
               'summary', case when m.status <> 'active' then m.summary end) order by m.created_at desc)
        from (select * from poker_bounty_matches where user_id = v_uid order by created_at desc limit 20) m), '[]'::jsonb),
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object('prize_id', g.prize_id, 'kind', g.kind, 'day', g.day, 'granted_at', g.granted_at,
                                          'prize', poker_prize_json(g.prize_id)) order by g.granted_at desc)
        from poker_prize_grants g where g.user_id = v_uid), '[]'::jsonb),
    'marks', coalesce((
      select jsonb_agg(jsonb_build_object('tag_id', st.id, 'name', st.name, 'emoji', st.emoji,
                                          'description', st.description, 'description_pt', st.description_pt,
                                          'requirement', st.requirement_description, 'requirement_pt', st.requirement_description_pt,
                                          'unlocked_at', u.unlocked_at)
                       order by array_position(array['poker-first-win', 'poker-fox-hunter', 'poker-clean-sweep',
                                                     'poker-oscar-bluff', 'poker-seven-nights'], st.id))
        from special_tags st
        left join user_special_tags u on u.user_id = v_uid and u.tag_id = st.id
       where st.id in ('poker-first-win', 'poker-fox-hunter', 'poker-clean-sweep', 'poker-oscar-bluff', 'poker-seven-nights')), '[]'::jsonb),
    'friends_won_today', (select count(distinct g.user_id) from poker_prize_grants g
                           where g.source = 'bounty' and g.day = v_day and g.user_id <> v_uid
                             and exists (select 1 from friendships f
                                          where f.status = 'accepted'
                                            and ((f.requester_id = v_uid and f.addressee_id = g.user_id)
                                              or (f.addressee_id = v_uid and f.requester_id = g.user_id)))));
end;
$$;

revoke all on function public.get_poker_home() from public, anon;
revoke all on function public.get_poker_scoreboard() from public, anon;
grant execute on function public.get_poker_home() to authenticated;
grant execute on function public.get_poker_scoreboard() to authenticated;

-- ---------------------------------------------------------------------------
-- Cron
-- ---------------------------------------------------------------------------

select cron.schedule('poker-bounty-expire', '7 * * * *', 'select public.poker_bounty_expire();');
-- 00:01 de Brasília: grava o prêmio de hoje e o de amanhã (a silhueta do lobby).
select cron.schedule('poker-bounty-day', '1 3 * * *',
  'select public.poker_bounty_for_day(public.poker_today()), public.poker_bounty_for_day(public.poker_today() + 1);');
-- 90 dias depois do fim, o estado pesado sai (a semente e as ações bastam para o replay).
select cron.schedule('poker-bounty-compact', '20 4 * * *',
  $cron$update public.poker_bounty_matches set state = '{}'::jsonb, last_response = null where finished_at < now() - interval '90 days' and state <> '{}'::jsonb$cron$);
