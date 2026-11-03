-- 03/11/2026 (tarde) — Pôster Poker, pacote F: o torneio da semana.
--
-- A semana começa na quinta-feira 00h00 de Brasília; o pôster sai de um ciclo
-- fixo de 9 semanas (poker_prizes.tournament_slot, a partir de
-- poker_settings.tournament_anchor = 29/10/2026) e fica gravado em
-- poker_tournament_weeks na primeira vez (não muda mais).
--
-- Entrada (start da Edge, proto 2): fichas pela raridade do pôster
-- (poker_settings.entry_chips) OU um pôster da coleção da pessoa da mesma
-- raridade (qualquer efeito; nunca exclusivo/gold nem já apostado). Até
-- max_attempts (3) entradas por dia de Brasília. Quem venceu nesta semana ou já
-- tem o pôster da semana não entra. Ordem dos erros: 426 → closed/bot/age →
-- stale_week → prize_changed → active_exists → won_this_week → owned →
-- attempts → stake_invalid/no_chips. O débito (ou a trava do pôster) e a
-- partida nascem na mesma transação; um start repetido com o mesmo idem
-- devolve a partida já aberta, sem cobrar de novo.
--
-- Item da Cobra: na abertura, se houver item do catálogo (poker_items.cobra_pool)
-- que a pessoa não tem, sorteio de cobra_chance (20%). Fica secreto
-- (poker_bounty_matches.cobra_item_id nunca sai antes do fim).
--
-- Fim: 1º lugar → o pôster gold (intrável) + o item da Cobra; o pôster apostado
-- volta. 2º–4º, desistência ou abandono → o pôster apostado vai embora
-- (reset_at, left_via = 'poker', desequipa, anula trocas abertas com ele) e o
-- item da Cobra aparece em "era isto". As recompensas vão em result.rewards.
--
-- O prêmio do dia (fase 1) fica aposentado: poker_bounty_check responde
-- 'closed' (a Edge antiga para de abrir partidas) e o cron do dia é desligado.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.poker_bounty_step(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid,jsonb,integer,integer,jsonb,jsonb)', '5f581503fd9076085034af7969c0ae3d'),
      ('public.poker_bounty_expire()', 'a82d4ed7dafc694d98405e0fc91159d7'),
      ('public.poker_bounty_load(uuid,uuid)', 'df1f0600745536ef457cd6517b0c1524'),
      ('public.poker_result_json(uuid,text[],integer)', '024eee0e9e56d245e2a1cc8f9eaff061'),
      ('public.poker_settings_json()', 'b379272fcdd9aefd7d7aef04da4d30df'),
      ('public.poker_prize_json(text)', '84a31e532f3f1b58237bd382e0d07975'),
      ('public.poker_bounty_check(uuid,date,text)', '37b5052aded546cadaddb49c706094ee')
    ) v(sig, expected)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.expected then
      raise exception 'A função % mudou em produção desde 03/11/2026: releia com pg_get_functiondef antes de aplicar', r.sig;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- A semana e o pôster da semana
-- ---------------------------------------------------------------------------

-- A quinta-feira (dia de Brasília) em que a semana de p_day começa.
create or replace function public.poker_week_start(p_day date default null)
returns date
language sql
stable
set search_path = public
as $$
  select d - ((extract(isodow from d)::int - 4 + 7) % 7)
    from (select coalesce(p_day, poker_today()) as d) x;
$$;

-- O pôster de uma semana: o gravado, ou o do ciclo (gravado agora, uma vez só).
create or replace function public.poker_tournament_for_week(p_week date)
returns public.poker_tournament_weeks
language plpgsql
security definer
set search_path = public
as $$
declare
  t poker_tournament_weeks;
  v_anchor date;
  v_n int;
  v_idx int;
  v_prize text;
  v_slot smallint;
begin
  if p_week is null or extract(isodow from p_week) <> 4 then
    raise exception 'bad_week';
  end if;
  select * into t from poker_tournament_weeks where week = p_week;
  if found then
    return t;
  end if;
  select tournament_anchor into v_anchor from poker_settings;
  select count(*) into v_n from poker_prizes where tournament_slot is not null and is_active;
  if v_n = 0 then
    return null;
  end if;
  v_idx := ((((p_week - v_anchor) / 7) % v_n) + v_n) % v_n;
  select id, tournament_slot into v_prize, v_slot
    from poker_prizes where tournament_slot is not null and is_active
   order by tournament_slot offset v_idx limit 1;
  insert into poker_tournament_weeks (week, prize_id, slot, source) values (p_week, v_prize, v_slot, 'cycle')
  on conflict (week) do nothing;
  select * into t from poker_tournament_weeks where week = p_week;
  return t;
end;
$$;

-- O pôster do torneio em JSON (o formato de get_poker_home().tournament.prize).
create or replace function public.poker_pp_json(p_prize_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'item_id', pi.id, 'rarity', pi.rarity, 'serial', pi.serial,
    'title', coalesce(p.name_pt, mc.title_pt, mc.title_en), 'title_en', coalesce(p.name_en, mc.title_en, mc.title_pt),
    'year', extract(year from mc.release_date)::int, 'file_path', pi.file_path,
    'effect_id', p.effect_id, 'effect', coalesce(p.payload ->> 'effect', 'gold'),
    'blurb_pt', p.blurb_pt, 'blurb_en', p.blurb_en)
  from poker_prizes p
  join poster_items pi on pi.id = (p.payload ->> 'item_id')::int
  left join movie_cache mc on mc.tmdb_id = pi.tmdb_id and mc.media_type = pi.media_type
  where p.id = p_prize_id;
$$;

-- Entradas no torneio num dia de Brasília (partidas void não contam).
create or replace function public.poker_tournament_attempts(p_uid uuid, p_day date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from poker_bounty_matches
   where user_id = p_uid and day = p_day and week is not null and status <> 'void';
$$;

-- Venceu um torneio nesta semana?
create or replace function public.poker_won_week(p_uid uuid, p_week date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from poker_bounty_matches where user_id = p_uid and week = p_week and status = 'won')
      or exists (select 1 from poker_prize_grants where user_id = p_uid and week = p_week);
$$;

-- Itens da Cobra que a pessoa ainda não tem.
create or replace function public.poker_cobra_eligible(p_uid uuid)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select i.id from poker_items i
   where i.is_active and i.cobra_pool and not i.is_default
     and not exists (select 1 from poker_owned_items o where o.user_id = p_uid and o.item_id = i.id);
$$;

-- O sorteio da Cobra (servidor): null = não trouxe nada.
create or replace function public.poker_cobra_draw(p_uid uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_chance numeric;
  v_id text;
begin
  select cobra_chance into v_chance from poker_settings;
  if not exists (select 1 from poker_cobra_eligible(p_uid)) or random() >= coalesce(v_chance, 0) then
    return null;
  end if;
  select e into v_id from poker_cobra_eligible(p_uid) e order by random() limit 1;
  return v_id;
end;
$$;

revoke all on function public.poker_week_start(date) from public, anon, authenticated;
revoke all on function public.poker_tournament_for_week(date) from public, anon, authenticated;
revoke all on function public.poker_pp_json(text) from public, anon, authenticated;
revoke all on function public.poker_tournament_attempts(uuid, date) from public, anon, authenticated;
revoke all on function public.poker_won_week(uuid, date) from public, anon, authenticated;
revoke all on function public.poker_cobra_eligible(uuid) from public, anon, authenticated;
revoke all on function public.poker_cobra_draw(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- JSON compartilhado (Edge e lobby)
-- ---------------------------------------------------------------------------

-- + effects (vazio = padrões do motor) e entry_chips.
create or replace function public.poker_settings_json()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('start_stack', s.start_stack, 'hands_per_level', s.hands_per_level, 'levels', s.levels,
                            'loan_amount', s.loan_amount, 'max_attempts', s.max_attempts,
                            'carrier_by_rarity', s.carrier_by_rarity, 'difficulty', s.difficulty,
                            'effects', s.effects, 'entry_chips', s.entry_chips)
    from poker_settings s;
$function$;

-- + effect_id (Pôster Poker; null nos prêmios antigos).
create or replace function public.poker_prize_json(p_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'rarity', p.rarity,
    'name_pt', p.name_pt, 'name_en', p.name_en, 'article_pt', p.article_pt,
    'blurb_pt', p.blurb_pt, 'blurb_en', p.blurb_en,
    'image', coalesce(p.image_path, case when p.kind = 'poster' then
               (select pi.file_path from poster_items pi where pi.id = (p.payload ->> 'item_id')::int) end),
    'payload', case when p.kind = 'poster'
                    then p.payload || jsonb_build_object('poster',
                           poster_version_json((p.payload ->> 'item_id')::int, coalesce(p.payload ->> 'effect', 'none')))
                    else p.payload end,
    'repeatable', p.repeatable,
    'carrier', p.carrier,
    'effect_id', p.effect_id)
  from poker_prizes p
  where p.id = p_id;
$function$;

-- A aposta de uma partida, no formato da API.
create or replace function public.poker_stake_json(p_kind text, p_chips int, p_item int, p_effect text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case p_kind
    when 'chips' then jsonb_build_object('kind', 'chips', 'amount', p_chips)
    when 'poster' then jsonb_build_object('kind', 'poster', 'item_id', p_item, 'effect', p_effect)
  end;
$$;

-- As recompensas de uma partida de torneio terminada (result.rewards).
create or replace function public.poker_tournament_rewards_json(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'poster', case when m.status = 'won' then (
      select jsonb_build_object('prizeId', j ->> 'id', 'itemId', (j ->> 'item_id')::int, 'title', j ->> 'title',
                                'titleEn', j ->> 'title_en', 'filePath', j ->> 'file_path', 'serial', (j ->> 'serial')::int,
                                'rarity', j ->> 'rarity', 'effect', 'gold', 'effectId', j ->> 'effect_id')
        from poker_pp_json(m.prize_id) j) end,
    'cobraItem', case when m.status = 'won' and m.cobra_item_id is not null then (
      select jsonb_build_object('id', i.id, 'name', i.name_pt, 'nameEn', i.name_en, 'kind', i.kind)
        from poker_items i where i.id = m.cobra_item_id) end,
    'cobraRevealed', case when m.status <> 'won' and m.cobra_item_id is not null then (
      select jsonb_build_object('id', i.id, 'name', i.name_pt, 'nameEn', i.name_en, 'kind', i.kind)
        from poker_items i where i.id = m.cobra_item_id) end,
    'stake', case m.stake_kind
      when 'chips' then jsonb_build_object('kind', 'chips', 'amount', m.stake_chips)
      when 'poster' then (
        select jsonb_build_object('kind', 'poster', 'itemId', m.stake_item_id, 'effect', m.stake_effect,
                                  'title', v ->> 'title_pt', 'titleEn', v ->> 'title_en', 'filePath', v ->> 'file_path',
                                  'serial', (v ->> 'serial')::int, 'rarity', v ->> 'rarity', 'lost', m.stake_status = 'lost')
          from poster_version_json(m.stake_item_id, m.stake_effect) v)
    end)
  from poker_bounty_matches m
  where m.id = p_match_id and m.week is not null and m.status in ('won', 'lost', 'forfeit', 'abandoned');
$$;

revoke all on function public.poker_stake_json(text, int, int, text) from public, anon, authenticated;
revoke all on function public.poker_tournament_rewards_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- As verificações da entrada
-- ---------------------------------------------------------------------------

-- p_stake: {kind:'chips'} | {kind:'poster', item_id, effect}. Devolve
-- {ok:false, status, code, …} ou {ok:true, week, day, attempt, stake, …}.
create or replace function public.poker_tournament_check(p_uid uuid, p_week date, p_prize_id text, p_stake jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg poker_settings;
  v_week date := poker_week_start();
  v_day date := poker_today();
  t poker_tournament_weeks;
  p poker_prizes;
  v_prize_item int;
  v_active poker_bounty_matches;
  v_used int;
  v_kind text := case when jsonb_typeof(p_stake) = 'object' then p_stake ->> 'kind' end;
  v_need int;
  v_have int;
  v_item int;
  v_effect text;
  pi poster_items;
  v_stake jsonb;
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
  t := poker_tournament_for_week(v_week);
  if t.week is null then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'closed');
  end if;
  if p_week is distinct from v_week then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'stale_week',
                              'tournament', jsonb_build_object('week', v_week, 'prize', poker_pp_json(t.prize_id)));
  end if;
  if p_prize_id is distinct from t.prize_id then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'prize_changed', 'prize', poker_pp_json(t.prize_id));
  end if;
  select * into p from poker_prizes where id = t.prize_id;
  v_prize_item := (p.payload ->> 'item_id')::int;

  select * into v_active from poker_bounty_matches where user_id = p_uid and status = 'active';
  if found then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'active_exists', 'matchId', v_active.id,
                              'expired', v_active.created_at < now() - interval '24 hours');
  end if;
  if poker_won_week(p_uid, v_week) then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'won_this_week');
  end if;
  if jackpot_owns(p_uid, v_prize_item, 'gold') then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'owned');
  end if;
  v_used := poker_tournament_attempts(p_uid, v_day);
  if v_used >= cfg.max_attempts then
    return jsonb_build_object('ok', false, 'status', 403, 'code', 'attempts', 'attempts_used', v_used, 'max_attempts', cfg.max_attempts);
  end if;

  if v_kind = 'chips' then
    v_need := greatest(0, coalesce((cfg.entry_chips ->> p.rarity)::int, 1));
    select tickets into v_have from jackpot_wallets where user_id = p_uid;
    v_have := coalesce(v_have, 0);
    if v_have < v_need then
      return jsonb_build_object('ok', false, 'status', 402, 'code', 'no_chips', 'need', v_need, 'have', v_have);
    end if;
    v_stake := jsonb_build_object('kind', 'chips', 'amount', v_need);
  elsif v_kind = 'poster' then
    v_item := poker_jint(p_stake, 'item_id');
    v_effect := p_stake ->> 'effect';
    if v_item is null or v_effect is null or v_effect not in ('none', 'holo', 'negative', 'ultra_red', 'gold') then
      return jsonb_build_object('ok', false, 'status', 400, 'code', 'stake_invalid', 'reason', 'bad');
    end if;
    select * into pi from poster_items where id = v_item;
    if not found or not jackpot_owns(p_uid, v_item, v_effect) then
      return jsonb_build_object('ok', false, 'status', 400, 'code', 'stake_invalid', 'reason', 'not_owned');
    end if;
    if pi.exclusive is not null or v_effect = 'gold' then
      return jsonb_build_object('ok', false, 'status', 400, 'code', 'stake_invalid', 'reason', 'exclusive');
    end if;
    if pi.rarity <> p.rarity then
      return jsonb_build_object('ok', false, 'status', 400, 'code', 'stake_invalid', 'reason', 'rarity');
    end if;
    if poker_poster_staked(p_uid, v_item, v_effect) then
      return jsonb_build_object('ok', false, 'status', 400, 'code', 'stake_invalid', 'reason', 'staked');
    end if;
    v_stake := jsonb_build_object('kind', 'poster', 'item_id', v_item, 'effect', v_effect);
  else
    return jsonb_build_object('ok', false, 'status', 400, 'code', 'stake_invalid', 'reason', 'bad');
  end if;

  return jsonb_build_object(
    'ok', true,
    'week', v_week,
    'day', v_day,
    'attempt', coalesce((select max(attempt) from poker_bounty_matches where user_id = p_uid and day = v_day), 0) + 1,
    'attempts_used', v_used,
    'max_attempts', cfg.max_attempts,
    'prize_id', p.id,
    'item_id', v_prize_item,
    'rarity', p.rarity,
    'effect_id', p.effect_id,
    'stars', coalesce((cfg.difficulty -> p.rarity ->> 'stars')::int, 0),
    'loan', case when poker_loan_due(p_uid) then cfg.loan_amount else 0 end,
    'entry_chips', coalesce((cfg.entry_chips ->> p.rarity)::int, 1),
    'stake', v_stake);
end;
$$;

revoke all on function public.poker_tournament_check(uuid, date, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Só a Edge Function (service_role): abrir a partida
-- ---------------------------------------------------------------------------

-- start, parte 1 (só lê, mais o sorteio da Cobra): as verificações e o que a
-- Edge precisa para montar o MatchConfig. 426 antes de qualquer cobrança.
-- cobra_item_id é interno: a Edge repassa para o open e nunca para o aparelho.
create or replace function public.poker_tournament_prepare(p_uid uuid, p_week date, p_prize_id text, p_stake jsonb,
                                                           p_proto int, p_idem uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg poker_settings;
  c jsonb;
  v_dup uuid;
begin
  perform poker_assert_service();
  select * into cfg from poker_settings;
  if coalesce(p_proto, 0) < cfg.min_proto then
    return jsonb_build_object('ok', false, 'status', 426, 'code', 'update_required', 'min_proto', cfg.min_proto);
  end if;
  if p_idem is not null then
    select id into v_dup from poker_bounty_matches where user_id = p_uid and start_idem = p_idem;
    if v_dup is not null then
      return jsonb_build_object('ok', false, 'status', 200, 'code', 'duplicate', 'matchId', v_dup);
    end if;
  end if;
  c := poker_tournament_check(p_uid, p_week, p_prize_id, p_stake);
  if not (c ->> 'ok')::boolean then
    return c;
  end if;
  return c || jsonb_build_object(
    'prize', poker_prize_json(c ->> 'prize_id'),
    'tournament_prize', poker_pp_json(c ->> 'prize_id'),
    'settings', poker_settings_json(),
    'bot_params', poker_bot_params_json(),
    'memory', (select nullif(s.model, '{}'::jsonb) from poker_player_stats s where s.user_id = p_uid and s.mode = 'bounty'),
    'difficulty', cfg.difficulty -> (c ->> 'rarity'),
    'min_proto', cfg.min_proto,
    'tickets', coalesce((select tickets from jackpot_wallets where user_id = p_uid), 0),
    'cobra_item_id', poker_cobra_draw(p_uid));
end;
$$;

-- start, parte 2 (numa transação): repete as verificações, cobra a entrada (ou
-- trava o pôster apostado) e cria a partida. Mudou algo desde o prepare
-- (tentativa, empréstimo, preço, raridade, efeito, aposta, item da Cobra) →
-- state_changed e a Edge refaz o start.
create or replace function public.poker_tournament_open(
  p_uid uuid, p_week date, p_day date, p_attempt int, p_prize_id text, p_rarity text, p_effect_id text, p_loan int,
  p_stake jsonb, p_cobra_item_id text, p_idem uuid,
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
  s jsonb;
  v_tickets int;
  v_id uuid;
  v_dup uuid;
begin
  perform poker_assert_service();
  -- Uma abertura por pessoa de cada vez (dois aparelhos ao mesmo tempo).
  perform pg_advisory_xact_lock(hashtext('poker_bounty_open:' || p_uid::text));
  select * into cfg from poker_settings;
  if coalesce(p_proto, 0) < cfg.min_proto then
    return jsonb_build_object('ok', false, 'status', 426, 'code', 'update_required', 'min_proto', cfg.min_proto);
  end if;
  if p_idem is not null then
    select id into v_dup from poker_bounty_matches where user_id = p_uid and start_idem = p_idem;
    if v_dup is not null then
      return jsonb_build_object('ok', false, 'status', 200, 'code', 'duplicate', 'matchId', v_dup);
    end if;
  end if;
  c := poker_tournament_check(p_uid, p_week, p_prize_id, p_stake);
  if not (c ->> 'ok')::boolean then
    return c;
  end if;
  s := c -> 'stake';
  if (c ->> 'attempt')::int is distinct from p_attempt or (c ->> 'loan')::int is distinct from coalesce(p_loan, 0)
     or c ->> 'rarity' is distinct from p_rarity or c ->> 'effect_id' is distinct from p_effect_id
     or (c ->> 'day')::date is distinct from p_day or s is distinct from p_stake
     or (p_cobra_item_id is not null and not exists (select 1 from poker_cobra_eligible(p_uid) e where e = p_cobra_item_id)) then
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
    if s ->> 'kind' = 'chips' then
      update jackpot_wallets set tickets = tickets - (s ->> 'amount')::int, updated_at = now()
       where user_id = p_uid and tickets >= (s ->> 'amount')::int
      returning tickets into v_tickets;
      if v_tickets is null then
        return jsonb_build_object('ok', false, 'status', 402, 'code', 'no_chips', 'need', (s ->> 'amount')::int,
                                  'have', coalesce((select tickets from jackpot_wallets where user_id = p_uid), 0));
      end if;
    else
      -- O pôster fica travado pela própria partida ativa (poker_poster_staked).
      perform 1 from user_posters
       where user_id = p_uid and item_id = (s ->> 'item_id')::int and effect = s ->> 'effect' and reset_at is null
         for update;
      if not found then
        return jsonb_build_object('ok', false, 'status', 400, 'code', 'stake_invalid', 'reason', 'not_owned');
      end if;
      select tickets into v_tickets from jackpot_wallets where user_id = p_uid;
    end if;
    insert into poker_bounty_matches (user_id, day, attempt, prize_id, carrier, rarity, loan, seed, seed_hash,
                                      engine_hash, state_version, proto, params_version, state, public_view, events_tail,
                                      week, effect_id, stake_kind, stake_chips, stake_item_id, stake_effect, stake_status,
                                      cobra_item_id, start_idem)
    values (p_uid, p_day, p_attempt, p_prize_id, 'none', p_rarity, coalesce(p_loan, 0) > 0, p_seed, p_seed_hash,
            p_engine_hash, p_state_version, p_proto, p_params_version, p_state, p_public_view,
            poker_jsonb_tail(coalesce(p_events_tail, '[]'::jsonb), 60),
            p_week, p_effect_id, s ->> 'kind',
            case when s ->> 'kind' = 'chips' then (s ->> 'amount')::int end,
            case when s ->> 'kind' = 'poster' then (s ->> 'item_id')::int end,
            case when s ->> 'kind' = 'poster' then s ->> 'effect' end,
            'held', p_cobra_item_id, p_idem)
    returning id into v_id;
  exception when unique_violation then
    -- A ficha volta (o bloco inteiro é desfeito).
    select id into v_dup from poker_bounty_matches where user_id = p_uid and start_idem = p_idem;
    if v_dup is not null then
      return jsonb_build_object('ok', false, 'status', 200, 'code', 'duplicate', 'matchId', v_dup);
    end if;
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'active_exists',
      'matchId', (select id from poker_bounty_matches where user_id = p_uid and status = 'active'));
  end;

  perform poker_player_row(p_uid);
  update poker_players set first_played_at = coalesce(first_played_at, now()), last_played_at = now() where user_id = p_uid;
  return jsonb_build_object('ok', true, 'match_id', v_id, 'seq', 1, 'attempt', p_attempt, 'tickets', v_tickets,
                            'stake', s, 'attempts_used', (c ->> 'attempts_used')::int + 1, 'max_attempts', cfg.max_attempts);
end;
$$;

revoke all on function public.poker_tournament_prepare(uuid, date, text, jsonb, int, uuid) from public, anon, authenticated;
revoke all on function public.poker_tournament_open(uuid, date, date, int, text, text, text, int, jsonb, text, uuid, text, text, text, int, int, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.poker_tournament_prepare(uuid, date, text, jsonb, int, uuid) to service_role;
grant execute on function public.poker_tournament_open(uuid, date, date, int, text, text, text, int, jsonb, text, uuid, text, text, text, int, int, jsonb, jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- O fim: concessão, aposta e recompensas
-- ---------------------------------------------------------------------------

-- O pôster gold da semana (intrável) e o item da Cobra. A linha em
-- poker_prize_grants (source 'bounty', ref = id da partida; um por semana) é a
-- trava: só entrega se a linha nasceu agora.
create or replace function public.poker_tournament_grant(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  m poker_bounty_matches;
  p poker_prizes;
  v_id bigint;
begin
  select * into m from poker_bounty_matches where id = p_match_id;
  if not found or m.week is null then
    return false;
  end if;
  select * into p from poker_prizes where id = m.prize_id;
  if not found or p.kind <> 'poster' then
    raise exception 'unknown_prize';
  end if;
  -- day = null: o índice de "um prêmio do dia" (fase 1) não vale para o torneio; o da semana vale.
  insert into poker_prize_grants (user_id, prize_id, kind, payload, source, ref, day, week)
  values (m.user_id, p.id, p.kind, p.payload, 'bounty', m.id::text, null, m.week)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  perform set_config('poker.granting', '1', true);
  insert into user_posters (user_id, item_id, effect, tradeable)
  values (m.user_id, (p.payload ->> 'item_id')::int, coalesce(p.payload ->> 'effect', 'gold'), false)
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, left_via = null, tradeable = false, copies = 1,
         first_pulled_at = now(), last_pulled_at = now()
   where user_posters.reset_at is not null;
  perform set_config('poker.granting', '', true);
  if m.cobra_item_id is not null then
    insert into poker_owned_items (user_id, item_id, source) values (m.user_id, m.cobra_item_id, 'cobra')
    on conflict do nothing;
  end if;
  return true;
end;
$$;

-- Fecha uma partida de torneio já com status final: vitória → concede e o
-- pôster apostado volta; derrota → o pôster apostado vai embora. Idempotente.
-- Devolve as recompensas (também gravadas em poker_bounty_matches.rewards).
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

revoke all on function public.poker_tournament_grant(uuid) from public, anon, authenticated;
revoke all on function public.poker_tournament_settle(uuid) from public, anon, authenticated;

-- O resultado público de uma partida terminada (seed revelada aqui).
-- + rewards e tournament (Pôster Poker).
create or replace function public.poker_result_json(p_match_id uuid, p_marks text[], p_wins_before integer)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'status', m.status, 'place', m.place,
    'prizeCaptured', m.captured_hand is not null,
    'prize', case when m.captured_hand is not null then poker_prize_json(m.prize_id) end,
    'seed', m.seed, 'seedHash', m.seed_hash,
    'marks', to_jsonb(coalesce(p_marks, '{}')),
    'title', jsonb_build_object('wins', w.n, 'id', poker_title(w.n), 'rankUp', poker_title(w.n) <> poker_title(p_wins_before)),
    'tournament', m.week is not null,
    'rewards', m.rewards)
  from poker_bounty_matches m, lateral (select poker_wins_total(m.user_id) as n) w
  where m.id = p_match_id;
$function$;

-- ---------------------------------------------------------------------------
-- Passos, carga e expiração (a Edge e o cron)
-- ---------------------------------------------------------------------------

create or replace function public.poker_bounty_load(p_uid uuid, p_match_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- 03/11/2026 (Pôster Poker): + o torneio (semana, pôster, efeito, aposta e se a
  -- Cobra trouxe item — o item em si nunca sai antes do fim) e as recompensas.
  return jsonb_build_object(
    'id', m.id, 'status', m.status, 'seq', m.seq, 'last_idem', m.last_idem, 'last_response', m.last_response,
    'state', m.state, 'public_view', m.public_view, 'events_tail', m.events_tail,
    'seed', m.seed, 'seed_hash', m.seed_hash, 'day', m.day, 'attempt', m.attempt,
    'prize_id', m.prize_id, 'prize', poker_prize_json(m.prize_id), 'carrier', m.carrier, 'rarity', m.rarity,
    'stars', coalesce((select (s.difficulty -> m.rarity ->> 'stars')::int from poker_settings s), 0),
    'loan', m.loan, 'hands', m.hands, 'alive_count', m.alive_count, 'captured_hand', m.captured_hand,
    'result', m.result, 'created_at', m.created_at, 'engine_hash', m.engine_hash, 'state_version', m.state_version,
    'expired', m.status = 'active' and m.created_at < now() - interval '24 hours',
    'week', m.week,
    'effect_id', m.effect_id,
    'tournament_prize', case when m.week is not null then poker_pp_json(m.prize_id) end,
    'stake', poker_stake_json(m.stake_kind, m.stake_chips, m.stake_item_id, m.stake_effect),
    'stake_status', m.stake_status,
    'cobra_item', m.cobra_item_id is not null,
    'rewards', m.rewards,
    'attempts_used', case when m.week is not null then poker_tournament_attempts(m.user_id, m.day) end,
    'max_attempts', (select s.max_attempts from poker_settings s));
end;
$function$;

-- Um passo da partida (act/forfeit/abandono), numa transação. Fase 1 (week
-- null): igual. Torneio: sem captura no meio; no fim, poker_tournament_settle
-- (concessão + aposta) antes das estatísticas, e rewards na resposta.
create or replace function public.poker_bounty_step(p_uid uuid, p_match_id uuid, p_expected_seq integer, p_state jsonb,
  p_public_view jsonb, p_events_append jsonb, p_human_action jsonb, p_idem uuid, p_response jsonb, p_hands integer,
  p_alive_count integer, p_captured jsonb, p_finished jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m poker_bounty_matches;
  v_status text;
  v_place int;
  v_marks text[];
  v_wins_before int;
  v_result jsonb;
  v_rewards jsonb;
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

  -- Captura (só fase 1): o prêmio é concedido agora e fica com a pessoa aconteça o que acontecer.
  if m.week is null and p_captured is not null and m.captured_hand is null then
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
    -- Fase 1: quem vence a mesa sempre leva o prêmio (rede de segurança).
    if m.week is null and v_status = 'won' and m.captured_hand is null then
      perform poker_grant_prize(p_uid, m.prize_id, 'bounty', m.id::text, m.day);
      update poker_bounty_matches set captured_hand = m.hands, captured_at = now() where id = m.id returning * into m;
    end if;
    v_wins_before := poker_wins_total(p_uid);
    update poker_bounty_matches
       set status = v_status, place = v_place, summary = p_finished -> 'summary', finished_at = now()
     where id = m.id returning * into m;
    -- Torneio: concessão (1º lugar) ou perda do pôster apostado, antes das estatísticas.
    if m.week is not null then
      v_rewards := poker_tournament_settle(m.id);
    end if;
    v_marks := poker_apply_bounty_result(p_uid, m.id, p_finished -> 'summary', p_finished -> 'model');
    v_result := coalesce(p_response -> 'result', '{}'::jsonb) || poker_result_json(m.id, v_marks, v_wins_before);
    v_response := jsonb_set(coalesce(p_response, '{}'::jsonb), '{result}', v_result);
    if m.week is not null then
      v_response := v_response || jsonb_build_object('rewards', v_rewards);
    end if;
    update poker_bounty_matches set result = v_result, last_response = v_response where id = m.id returning * into m;
  end if;

  return jsonb_build_object('ok', true, 'seq', m.seq, 'response', v_response, 'result', v_result,
                            'captured', m.captured_hand is not null);
end;
$function$;

-- Cron (de hora em hora): partida ativa há mais de 24 h vira 'abandoned' na
-- colocação do momento (vivos), com um resumo mínimo. No torneio, o pôster
-- apostado vai embora (poker_tournament_settle).
create or replace function public.poker_bounty_expire()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
                                    'prize', case when m.week is null then jsonb_build_object('prizeId', m.prize_id, 'capturedHand', m.captured_hand) end,
                                    'tournament', case when m.week is not null then
                                      jsonb_build_object('prizeId', m.prize_id, 'effect', m.effect_id, 'won', false) end);
    v_wins_before := poker_wins_total(m.user_id);
    update poker_bounty_matches set status = 'abandoned', place = v_place, summary = v_summary, finished_at = now(), updated_at = now()
     where id = m.id;
    if m.week is not null then
      perform poker_tournament_settle(m.id);
    end if;
    v_marks := poker_apply_bounty_result(m.user_id, m.id, v_summary, null);
    update poker_bounty_matches set result = poker_result_json(m.id, v_marks, v_wins_before) where id = m.id;
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- O prêmio do dia (fase 1) se aposenta
-- ---------------------------------------------------------------------------

-- A Edge antiga (proto 1) chamava esta checagem no start: agora o salão do
-- prêmio do dia está fechado (o Pôster Poker usa poker_tournament_check).
create or replace function public.poker_bounty_check(p_uid uuid, p_day date, p_prize_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return jsonb_build_object('ok', false, 'status', 403, 'code', 'closed', 'retired', true);
end;
$function$;

-- ---------------------------------------------------------------------------
-- As semanas gravadas e o cron
-- ---------------------------------------------------------------------------

-- As 10 primeiras semanas (29/10 a 31/12/2026). Idempotente: a semana gravada não muda.
select public.poker_tournament_for_week(date '2026-10-29' + 7 * g) from generate_series(0, 9) g;

-- O cron do prêmio do dia fica desligado (não é apagado); o da semana grava a
-- atual e a próxima todo dia às 00:01 de Brasília.
select cron.alter_job(job_id := j.jobid, active := false) from cron.job j where j.jobname = 'poker-bounty-day' and j.active;
select cron.schedule('poker-tournament-week', '1 3 * * *',
  'select public.poker_tournament_for_week(public.poker_week_start()), public.poker_tournament_for_week(public.poker_week_start() + 7);');
