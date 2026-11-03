-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: o núcleo.
--
-- Tabelas do jogador (história, idade, treino), estatísticas por modo
-- (livre × prêmio), anel das últimas partidas livres, relatos livres
-- (idempotência por clientId e teto diário), parâmetros dos bots, itens do
-- pôquer (baralho, feltro, réplicas) e o que cada pessoa equipou.
--
-- Regras da casa:
--   - Tudo com RLS ligada, sem policy e sem grant para anon/authenticated:
--     o acesso é só pelas funções security definer abaixo (como no Jackpot).
--   - Fechado por flag: poker_settings.is_open = false e testers = só o Bruno.
--   - Relato da partida livre NUNCA concede nada (ficha, tag ou prêmio).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.poker_settings (
  id boolean primary key default true check (id),
  is_open boolean not null default false,
  testers uuid[] not null default '{}',
  launched_at timestamptz,                                   -- regra dos 7 dias da faixa da home
  min_proto int not null default 1,
  start_stack int not null default 2000,
  hands_per_level int not null default 5,
  levels jsonb not null default '[[25,50,0],[35,70,0],[50,100,25],[70,140,35],[100,200,50],[150,300,75],[200,400,100],[300,600,150],[400,800,200],[600,1200,300],[800,1600,400],[1200,2400,600]]',
  loan_amount int not null default 500,
  loan_after_losses int not null default 3,
  max_attempts int not null default 3,
  carrier_by_rarity jsonb not null default '{"common":"bogart","rare":"bogart","epic":"cypher","legendary":"fincher"}',
  difficulty jsonb not null default '{"free":{"stars":0,"epsilonMul":1,"adaptDelay":12},"common":{"stars":1,"epsilonMul":1.3,"adaptDelay":16},"rare":{"stars":2,"epsilonMul":1.15,"adaptDelay":14},"epic":{"stars":3,"epsilonMul":1,"adaptDelay":12},"legendary":{"stars":4,"epsilonMul":0.85,"adaptDelay":9}}',
  no_repeat_days int not null default 30,
  tickets_prize_gap_days int not null default 7,
  fallback_prize_id text,                                    -- 'fichas-2' (FK lógica; criada no seed)
  casino_age_gate boolean not null default false,            -- pronta e desligada (decisão do Bruno)
  mission_from_week date,                                    -- null = missão poker_play desligada
  free_report_daily_cap int not null default 100,
  mission_daily_cap int not null default 10,
  mission_min_hands int not null default 8,
  home_strip_launch_days int not null default 7,
  home_strip_recent_days int not null default 14
);
-- Nasce fechado, só com o Bruno de tester (03/11/2026).
insert into public.poker_settings (id, is_open, testers)
values (true, false, array['17bef49a-2c3f-40c9-a9b5-a741946b1b1b']::uuid[])
on conflict (id) do nothing;

create table if not exists public.poker_bot_params (
  rival_id   text primary key,              -- 'bogart' | 'cypher' | 'fincher' | rivais futuros
  version    int  not null default 1,       -- sobe a cada ajuste
  params     jsonb not null default '{}',   -- Partial<BotProfile> (só o que muda)
  note       text,
  updated_at timestamptz not null default now()
);

create table if not exists public.poker_players (               -- uma linha por pessoa
  user_id uuid primary key references public.profiles(id) on delete cascade,
  story jsonb not null default '{}',                         -- {"arc.debt.1":"2026-11-05", "tip.allin":…}
  age_confirmed_at timestamptz,
  tutorial_done_at timestamptz,
  tutorial_chip_at timestamptz,
  first_played_at timestamptz,
  last_played_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.poker_player_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('free', 'bounty')),
  matches int not null default 0, wins int not null default 0, podiums int not null default 0,
  place_sum int not null default 0, forfeits int not null default 0, loans int not null default 0,
  hands int not null default 0, hands_won int not null default 0, vpip int not null default 0, pfr int not null default 0,
  aggr_bets int not null default 0, aggr_calls int not null default 0, cbet_opp int not null default 0, cbet int not null default 0,
  fold_cbet_opp int not null default 0, fold_cbet int not null default 0,
  showdowns int not null default 0, showdowns_won int not null default 0,
  allin_count int not null default 0, allin_won int not null default 0, allin_expected_milli bigint not null default 0,
  bluffs_worked int not null default 0, bad_beats_suffered int not null default 0, bad_beats_dealt int not null default 0,
  comeback_wins int not null default 0, prizes_won int not null default 0,
  streak int not null default 0, best_streak int not null default 0,
  biggest_pot int not null default 0, best_hand_score int not null default 0, best_hand jsonb,
  play_seconds bigint not null default 0,
  vs jsonb not null default '{}',                            -- {"fincher":{"elim":3,"elim_by":7}} — aceita rivais novos
  model jsonb not null default '{}',                         -- memória do Raposo (só mode='bounty')
  last_match_at timestamptz,
  primary key (user_id, mode)
);

create table if not exists public.poker_recent_matches (       -- anel de 20 por pessoa (livre): sobrescreve, nunca apaga
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot smallint not null check (slot between 0 and 19),
  client_id uuid not null,
  played_at timestamptz not null,
  place smallint not null,
  hands int not null,
  loan boolean not null default false,
  summary jsonb not null,
  primary key (user_id, slot)
);

create table if not exists public.poker_free_reports (         -- idempotência e teto da missão
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  day date not null,
  hands int not null,
  place smallint not null,
  finished boolean not null,                                 -- false = forfeit/abandoned
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index if not exists poker_free_reports_day on public.poker_free_reports (user_id, day);

create table if not exists public.poker_items (                -- cosméticos e conteúdos do pôquer
  id text primary key check (id ~ '^[a-z0-9-]{2,48}$'),
  kind text not null check (kind in ('deck', 'table', 'rival', 'poker_quip')),
  name_pt text not null,
  name_en text not null,
  is_default boolean not null default false,
  sort int not null default 0,
  is_active boolean not null default true
);

create table if not exists public.poker_owned_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.poker_items(id),
  source text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.poker_loadouts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  deck_id text references public.poker_items(id),
  table_id text references public.poker_items(id),
  quip_pack_id text references public.poker_items(id),
  updated_at timestamptz not null default now()
);

alter table public.poker_settings enable row level security;
alter table public.poker_bot_params enable row level security;
alter table public.poker_players enable row level security;
alter table public.poker_player_stats enable row level security;
alter table public.poker_recent_matches enable row level security;
alter table public.poker_free_reports enable row level security;
alter table public.poker_items enable row level security;
alter table public.poker_owned_items enable row level security;
alter table public.poker_loadouts enable row level security;
revoke all on public.poker_settings, public.poker_bot_params, public.poker_players, public.poker_player_stats,
  public.poker_recent_matches, public.poker_free_reports, public.poker_items, public.poker_owned_items,
  public.poker_loadouts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auxiliares internos (sem grant para o cliente)
-- ---------------------------------------------------------------------------

-- O pôquer está liberado para esta pessoa?
create or replace function public.poker_enabled(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and exists (
    select 1 from poker_settings s where s.is_open or p_uid = any(s.testers)
  );
$$;

-- Hoje, no horário de Brasília (o prêmio troca à meia-noite de lá).
create or replace function public.poker_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.poker_is_bot(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from bot_accounts b where b.user_id = p_uid);
$$;

-- Título pela contagem de vitórias (livre + prêmio). §2.9.
create or replace function public.poker_title(p_wins int)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_wins, 0) >= 150 then 'lenda'
    when p_wins >= 60 then 'estrela'
    when p_wins >= 25 then 'protagonista'
    when p_wins >= 10 then 'coadjuvante'
    when p_wins >= 3 then 'duble'
    else 'figurante'
  end;
$$;

-- Número inteiro de um campo JSON (null se não for número). Os relatos vêm do
-- aparelho: um campo torto vira null e a validação recusa, sem erro de cast.
create or replace function public.poker_jint(p_j jsonb, p_key text)
returns bigint
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(p_j -> p_key) = 'number' then trunc((p_j ->> p_key)::numeric)::bigint end;
$$;

-- Linha do jogador (cria se não existir).
create or replace function public.poker_player_row(p_uid uuid)
returns public.poker_players
language plpgsql
security definer
set search_path = public
as $$
declare
  r poker_players;
begin
  insert into poker_players (user_id) values (p_uid) on conflict do nothing;
  select * into r from poker_players where user_id = p_uid;
  return r;
end;
$$;

-- Estatísticas de um modo em JSON (zeros se a pessoa nunca jogou). Sem a
-- memória do Raposo (model), que nunca sai para o aparelho.
create or replace function public.poker_stats_json(p_uid uuid, p_mode text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select to_jsonb(s) - 'user_id' - 'model' from poker_player_stats s where s.user_id = p_uid and s.mode = p_mode),
    jsonb_build_object('mode', p_mode, 'matches', 0, 'wins', 0, 'podiums', 0, 'place_sum', 0, 'forfeits', 0, 'loans', 0,
      'hands', 0, 'hands_won', 0, 'vpip', 0, 'pfr', 0, 'aggr_bets', 0, 'aggr_calls', 0, 'cbet_opp', 0, 'cbet', 0,
      'fold_cbet_opp', 0, 'fold_cbet', 0, 'showdowns', 0, 'showdowns_won', 0, 'allin_count', 0, 'allin_won', 0,
      'allin_expected_milli', 0, 'bluffs_worked', 0, 'bad_beats_suffered', 0, 'bad_beats_dealt', 0,
      'comeback_wins', 0, 'prizes_won', 0, 'streak', 0, 'best_streak', 0, 'biggest_pot', 0, 'best_hand_score', 0,
      'best_hand', null, 'play_seconds', 0, 'vs', '{}'::jsonb, 'last_match_at', null));
$$;

-- Vitórias somadas (livre + prêmio): é o que conta para o título.
create or replace function public.poker_wins_total(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(wins), 0)::int from poker_player_stats where user_id = p_uid;
$$;

-- Soma um resumo de partida (MatchSummary) nas estatísticas de um modo.
-- Pódio = 1º ou 2º lugar (numa mesa de 4, o "top 2" do §3.8). Os campos que
-- faltam contam 0 (o resumo mínimo da expiração não tem a contagem da mão).
create or replace function public.poker_stats_apply(p_uid uuid, p_mode text, p_s jsonb, p_place int,
                                                    p_forfeit boolean, p_loan boolean, p_prize boolean)
returns public.poker_player_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  h jsonb := coalesce(p_s -> 'human', '{}'::jsonb);
  st poker_player_stats;
  v_vs jsonb;
  e jsonb;
  v_victim text;
  v_by text;
  v_best int := coalesce(poker_jint(h -> 'bestHand', 'score'), 0)::int;
  v_win boolean := p_place = 1;
begin
  insert into poker_player_stats (user_id, mode) values (p_uid, p_mode) on conflict do nothing;
  select * into st from poker_player_stats where user_id = p_uid and mode = p_mode for update;

  -- Você × cada oráculo: quem a pessoa eliminou e quem a eliminou.
  v_vs := coalesce(st.vs, '{}'::jsonb);
  for e in select x from jsonb_array_elements(case when jsonb_typeof(p_s -> 'eliminations') = 'array'
                                                    then p_s -> 'eliminations' else '[]'::jsonb end) x loop
    v_victim := e ->> 'victimId';
    v_by := e ->> 'byId';
    if v_by = 'human' and v_victim ~ '^[a-z0-9_-]{1,24}$' and v_victim <> 'human' then
      v_vs := jsonb_set(v_vs, array[v_victim],
        coalesce(v_vs -> v_victim, '{}'::jsonb) || jsonb_build_object('elim', coalesce((v_vs -> v_victim ->> 'elim')::int, 0) + 1));
    elsif v_victim = 'human' and v_by ~ '^[a-z0-9_-]{1,24}$' and v_by <> 'human' then
      v_vs := jsonb_set(v_vs, array[v_by],
        coalesce(v_vs -> v_by, '{}'::jsonb) || jsonb_build_object('elim_by', coalesce((v_vs -> v_by ->> 'elim_by')::int, 0) + 1));
    end if;
  end loop;

  update poker_player_stats set
    matches = matches + 1,
    wins = wins + v_win::int,
    podiums = podiums + (p_place <= 2)::int,
    place_sum = place_sum + p_place,
    forfeits = forfeits + coalesce(p_forfeit, false)::int,
    loans = loans + coalesce(p_loan, false)::int,
    hands = hands + coalesce(poker_jint(h, 'hands'), 0)::int,
    hands_won = hands_won + coalesce(poker_jint(h, 'handsWon'), 0)::int,
    vpip = vpip + coalesce(poker_jint(h, 'vpip'), 0)::int,
    pfr = pfr + coalesce(poker_jint(h, 'pfr'), 0)::int,
    aggr_bets = aggr_bets + coalesce(poker_jint(h, 'aggrBets'), 0)::int,
    aggr_calls = aggr_calls + coalesce(poker_jint(h, 'aggrCalls'), 0)::int,
    cbet_opp = cbet_opp + coalesce(poker_jint(h, 'cbetOpp'), 0)::int,
    cbet = cbet + coalesce(poker_jint(h, 'cbet'), 0)::int,
    fold_cbet_opp = fold_cbet_opp + coalesce(poker_jint(h, 'foldToCbetOpp'), 0)::int,
    fold_cbet = fold_cbet + coalesce(poker_jint(h, 'foldToCbet'), 0)::int,
    showdowns = showdowns + coalesce(poker_jint(h, 'showdowns'), 0)::int,
    showdowns_won = showdowns_won + coalesce(poker_jint(h, 'showdownsWon'), 0)::int,
    allin_count = allin_count + coalesce(poker_jint(h, 'allinCount'), 0)::int,
    allin_won = allin_won + coalesce(poker_jint(h, 'allinWon'), 0)::int,
    allin_expected_milli = allin_expected_milli + coalesce(poker_jint(h, 'allinExpectedMilli'), 0),
    bluffs_worked = bluffs_worked + coalesce(poker_jint(h, 'bluffsWorked'), 0)::int,
    bad_beats_suffered = bad_beats_suffered + coalesce(poker_jint(h, 'badBeatsSuffered'), 0)::int,
    bad_beats_dealt = bad_beats_dealt + coalesce(poker_jint(h, 'badBeatsDealt'), 0)::int,
    comeback_wins = comeback_wins + (v_win and (p_s -> 'comeback') = 'true'::jsonb)::int,
    prizes_won = prizes_won + coalesce(p_prize, false)::int,
    streak = case when v_win then streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when v_win then streak + 1 else 0 end),
    biggest_pot = greatest(biggest_pot, coalesce(poker_jint(h, 'biggestPot'), 0)::int),
    best_hand = case when v_best > best_hand_score then h -> 'bestHand' else best_hand end,
    best_hand_score = greatest(best_hand_score, v_best),
    -- Partida largada aberta por um dia não vira 24 h de mesa: teto de 4 h.
    play_seconds = play_seconds + least(greatest(coalesce(poker_jint(p_s, 'durationS'), 0), 0), 14400),
    vs = v_vs,
    last_match_at = now()
  where user_id = p_uid and mode = p_mode
  returning * into st;
  return st;
end;
$$;

-- O que a pessoa equipou (com os itens padrão quando não escolheu nada).
create or replace function public.poker_loadout_json(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'deck', coalesce(l.deck_id, (select i.id from poker_items i where i.kind = 'deck' and i.is_default order by i.sort limit 1)),
    'table', coalesce(l.table_id, (select i.id from poker_items i where i.kind = 'table' and i.is_default order by i.sort limit 1)),
    'quips', coalesce(l.quip_pack_id, (select i.id from poker_items i where i.kind = 'poker_quip' and i.is_default order by i.sort limit 1)))
  from (select 1) one
  left join poker_loadouts l on l.user_id = p_uid;
$$;

revoke all on function public.poker_enabled(uuid) from public, anon, authenticated;
revoke all on function public.poker_today() from public, anon, authenticated;
revoke all on function public.poker_is_bot(uuid) from public, anon, authenticated;
revoke all on function public.poker_title(int) from public, anon, authenticated;
revoke all on function public.poker_jint(jsonb, text) from public, anon, authenticated;
revoke all on function public.poker_player_row(uuid) from public, anon, authenticated;
revoke all on function public.poker_stats_json(uuid, text) from public, anon, authenticated;
revoke all on function public.poker_wins_total(uuid) from public, anon, authenticated;
revoke all on function public.poker_stats_apply(uuid, text, jsonb, int, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.poker_loadout_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções do cliente (§5.3 A). Com o pôquer fechado: {"enabled": false}.
-- ---------------------------------------------------------------------------

-- Confirmação 18+ (autodeclarada; a primeira data fica).
create or replace function public.poker_confirm_age()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  insert into poker_players (user_id, age_confirmed_at) values (v_uid, now())
  on conflict (user_id) do update set age_confirmed_at = coalesce(poker_players.age_confirmed_at, excluded.age_confirmed_at)
  returning age_confirmed_at into v_at;
  return jsonb_build_object('ok', true, 'age_confirmed_at', v_at);
end;
$$;

-- +1 ficha ao concluir o treino, uma vez por pessoa. O UPDATE com
-- "tutorial_chip_at is null" é a trava: duas chamadas juntas dão uma ficha só.
create or replace function public.poker_claim_tutorial_chip()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new boolean;
  w jackpot_wallets;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  if poker_is_bot(v_uid) then
    return jsonb_build_object('granted', false, 'reason', 'bot');
  end if;
  perform poker_player_row(v_uid);
  update poker_players
     set tutorial_chip_at = now(), tutorial_done_at = coalesce(tutorial_done_at, now())
   where user_id = v_uid and tutorial_chip_at is null
  returning true into v_new;

  w := jackpot_wallet_row(v_uid);
  if v_new is null then
    return jsonb_build_object('granted', false, 'tickets', w.tickets);
  end if;
  update jackpot_wallets set tickets = tickets + 1, updated_at = now()
   where user_id = v_uid
  returning * into w;
  return jsonb_build_object('granted', true, 'tickets', w.tickets);
end;
$$;

-- Marca chaves de história ({chave: data}). A primeira data fica (as falas
-- "uma vez na vida" dependem disso). Chave torta é ignorada; até 200 no total.
create or replace function public.poker_mark_story(p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r poker_players;
  v_new jsonb;
  v_room int;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  perform poker_player_row(v_uid);
  select * into r from poker_players where user_id = v_uid for update;
  v_room := greatest(0, 200 - (select count(*) from jsonb_object_keys(r.story)));

  select coalesce(jsonb_object_agg(k, to_jsonb(poker_today()::text)), '{}'::jsonb) into v_new
    from (select distinct k
            from unnest(coalesce(p_keys, '{}')[1:60]) k
           where k ~ '^[a-z0-9_.:-]{1,40}$' and not (r.story ? k)
           order by k
           limit v_room) x;

  if v_new <> '{}'::jsonb then
    update poker_players set story = v_new || story where user_id = v_uid returning * into r;
  end if;
  return jsonb_build_object('ok', true, 'added', (select count(*) from jsonb_object_keys(v_new)), 'story', r.story);
end;
$$;

-- Equipa baralho, feltro ou réplicas (o item padrão ou um que a pessoa tem).
create or replace function public.poker_equip(p_slot text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := case p_slot when 'deck' then 'deck' when 'table' then 'table' when 'quips' then 'poker_quip' end;
  it poker_items;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  if v_kind is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_slot');
  end if;
  select * into it from poker_items where id = p_item_id and is_active;
  if not found or it.kind <> v_kind then
    return jsonb_build_object('ok', false, 'reason', 'bad_item');
  end if;
  if not it.is_default and not exists (select 1 from poker_owned_items o where o.user_id = v_uid and o.item_id = it.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_owned');
  end if;

  insert into poker_loadouts (user_id) values (v_uid) on conflict do nothing;
  if p_slot = 'deck' then
    update poker_loadouts set deck_id = it.id, updated_at = now() where user_id = v_uid;
  elsif p_slot = 'table' then
    update poker_loadouts set table_id = it.id, updated_at = now() where user_id = v_uid;
  else
    update poker_loadouts set quip_pack_id = it.id, updated_at = now() where user_id = v_uid;
  end if;
  return jsonb_build_object('ok', true, 'loadout', poker_loadout_json(v_uid));
end;
$$;

-- Relato de uma partida livre (rodou no aparelho, então NÃO é verificado).
-- Só soma estatísticas e o anel das últimas 20; nunca concede nada. O
-- clientId torna o envio idempotente (a fila offline reenvia sem somar 2×).
create or replace function public.poker_report_free_match(p_summary jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s jsonb := p_summary;
  h jsonb;
  cfg poker_settings;
  v_client uuid;
  v_hands int;
  v_place int;
  v_dur bigint;
  v_reason text;
  hh bigint; vp bigint; pf bigint; sd bigint; sdw bigint; hw bigint; ac bigint; aw bigint;
  v_new boolean;
  st poker_player_stats;
  v_wins int;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false, 'ok', false, 'reason', 'closed');
  end if;
  if poker_is_bot(v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'bot');
  end if;
  select * into cfg from poker_settings;

  -- Validação (qualquer falha: nada é gravado).
  if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text) > 16384 then
    return jsonb_build_object('ok', false, 'reason', 'bad_summary');
  end if;
  h := s -> 'human';
  if poker_jint(s, 'v') is distinct from 1 or s ->> 'mode' is distinct from 'free' or jsonb_typeof(h) is distinct from 'object'
     or coalesce(s ->> 'clientId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_summary');
  end if;
  v_client := (s ->> 'clientId')::uuid;
  v_hands := poker_jint(s, 'hands');
  v_place := poker_jint(s, 'place');
  v_dur := poker_jint(s, 'durationS');
  v_reason := s ->> 'reason';
  hh := poker_jint(h, 'hands'); vp := poker_jint(h, 'vpip'); pf := poker_jint(h, 'pfr');
  sd := poker_jint(h, 'showdowns'); sdw := poker_jint(h, 'showdownsWon'); hw := poker_jint(h, 'handsWon');
  ac := poker_jint(h, 'allinCount'); aw := poker_jint(h, 'allinWon');
  if v_hands is null or v_hands not between 1 and 300
     or v_place is null or v_place not between 1 and 4
     or v_reason is null or v_reason not in ('won', 'eliminated', 'forfeit', 'abandoned')
     or (v_reason = 'won') <> (v_place = 1)
     or v_dur is null or v_dur < 2 * v_hands
     or hh is null or hh not between 0 and v_hands
     or pf is null or vp is null or pf < 0 or pf > vp or vp > hh
     or sdw is null or sd is null or sdw < 0 or sdw > sd or sd > hh
     or hw is null or hw not between 0 and hh
     or aw is null or ac is null or aw < 0 or aw > ac or ac > hh
     or coalesce(poker_jint(h, 'biggestPot'), -1) not between 0 and 8500
     or coalesce(poker_jint(h, 'aggrBets'), -1) not between 0 and 10000
     or coalesce(poker_jint(h, 'aggrCalls'), -1) not between 0 and 10000
     or coalesce(poker_jint(h, 'cbetOpp'), -1) not between 0 and hh
     or coalesce(poker_jint(h, 'cbet'), -1) not between 0 and coalesce(poker_jint(h, 'cbetOpp'), 0)
     or coalesce(poker_jint(h, 'foldToCbetOpp'), -1) not between 0 and hh
     or coalesce(poker_jint(h, 'foldToCbet'), -1) not between 0 and coalesce(poker_jint(h, 'foldToCbetOpp'), 0)
     or coalesce(poker_jint(h, 'bluffsWorked'), -1) not between 0 and hw
     or coalesce(poker_jint(h, 'badBeatsSuffered'), -1) not between 0 and hh
     or coalesce(poker_jint(h, 'badBeatsDealt'), -1) not between 0 and hh
     or coalesce(poker_jint(h, 'allinExpectedMilli'), -1) not between 0 and ac * 1000
     or (h -> 'bestHand' is not null and jsonb_typeof(h -> 'bestHand') not in ('object', 'null'))
     or (case when jsonb_typeof(s -> 'eliminations') = 'array' then jsonb_array_length(s -> 'eliminations') > 3
              else coalesce(jsonb_typeof(s -> 'eliminations'), 'null') <> 'null' end) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Já relatado? Devolve o estado atual, sem somar de novo.
  if exists (select 1 from poker_free_reports r where r.user_id = v_uid and r.client_id = v_client) then
    v_wins := poker_wins_total(v_uid);
    return jsonb_build_object('ok', true, 'duplicate', true, 'wins', v_wins, 'wins_total', v_wins, 'title', poker_title(v_wins));
  end if;
  if (select count(*) from poker_free_reports r where r.user_id = v_uid and r.day = poker_today()) >= cfg.free_report_daily_cap then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap');
  end if;

  insert into poker_free_reports (user_id, client_id, day, hands, place, finished)
  values (v_uid, v_client, poker_today(), v_hands, v_place, v_reason in ('won', 'eliminated'))
  on conflict do nothing
  returning true into v_new;
  if v_new is null then
    v_wins := poker_wins_total(v_uid);
    return jsonb_build_object('ok', true, 'duplicate', true, 'wins', v_wins, 'wins_total', v_wins, 'title', poker_title(v_wins));
  end if;

  st := poker_stats_apply(v_uid, 'free', s, v_place, v_reason in ('forfeit', 'abandoned'), false, false);

  -- Anel das últimas 20 livres: sobrescreve a mais antiga.
  insert into poker_recent_matches (user_id, slot, client_id, played_at, place, hands, loan, summary)
  values (v_uid, ((st.matches - 1) % 20)::smallint, v_client, now(), v_place, v_hands, false, s)
  on conflict (user_id, slot) do update
     set client_id = excluded.client_id, played_at = excluded.played_at, place = excluded.place,
         hands = excluded.hands, loan = excluded.loan, summary = excluded.summary;

  perform poker_player_row(v_uid);
  update poker_players set first_played_at = coalesce(first_played_at, now()), last_played_at = now() where user_id = v_uid;

  v_wins := poker_wins_total(v_uid);
  return jsonb_build_object('ok', true, 'wins', v_wins, 'wins_total', v_wins, 'title', poker_title(v_wins));
end;
$$;

-- Intervalo: um título aleatório da Watchlist, apresentado pelo oráculo dele.
create or replace function public.poker_interval_pick()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m record;
  v_oracle text;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  select um.movie_id, coalesce(um.media_type, 'movie') as media_type, mc.title_pt, mc.title_en, mc.poster_path,
         mc.poster_path_pt, mc.release_date
    into m
    from user_movies um
    left join movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = coalesce(um.media_type, 'movie')
   where um.user_id = v_uid and um.rating is null
   order by random()
   limit 1;
  if not found then
    return null;
  end if;

  select rp.card_type into v_oracle
    from recommendation_pools rp
   where rp.card_type in ('bogart', 'fincher', 'cypher') and rp.mood_key <> 'random-surprise'
     and (case when m.media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(m.movie_id)
   order by random()
   limit 1;
  v_oracle := coalesce(v_oracle, case when m.release_date < date '2000-01-01' then 'fincher' else 'bogart' end);

  return jsonb_build_object(
    'media_type', m.media_type, 'tmdb_id', m.movie_id,
    'title_pt', coalesce(m.title_pt, m.title_en), 'title_en', coalesce(m.title_en, m.title_pt),
    'poster_path', m.poster_path, 'poster_path_pt', m.poster_path_pt,
    'year', extract(year from m.release_date)::int, 'oracle', v_oracle);
end;
$$;

revoke all on function public.poker_confirm_age() from public, anon;
revoke all on function public.poker_claim_tutorial_chip() from public, anon;
revoke all on function public.poker_mark_story(text[]) from public, anon;
revoke all on function public.poker_equip(text, text) from public, anon;
revoke all on function public.poker_report_free_match(jsonb) from public, anon;
revoke all on function public.poker_interval_pick() from public, anon;
grant execute on function public.poker_confirm_age() to authenticated;
grant execute on function public.poker_claim_tutorial_chip() to authenticated;
grant execute on function public.poker_mark_story(text[]) to authenticated;
grant execute on function public.poker_equip(text, text) to authenticated;
grant execute on function public.poker_report_free_match(jsonb) to authenticated;
grant execute on function public.poker_interval_pick() to authenticated;
