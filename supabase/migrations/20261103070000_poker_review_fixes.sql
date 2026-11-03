-- 03/11/2026 — O Grande Blefe: correções da revisão independente de segurança.
--
-- 1. poker_stats_apply: numa vitória sem o campo `comeback` no resumo, a soma
--    virava NULL e a linha caía no NOT NULL (a jogada vencedora daria 500 para
--    sempre). Hoje o motor sempre manda o campo; o coalesce é a rede.
-- 2. Missão poker_play só existe com o salão aberto (poker_settings.is_open).
--    Antes, ligar mission_from_week com o salão fechado mostrava a missão para
--    todo mundo, e quem não é testador não conseguia cumprir.
-- 3. poker_mission_from_week volta a ser executável pelo site: jackpot_week_missions
--    (que não é security definer) a chama, e chamada direto pelo cliente dava
--    "permission denied". A função só devolve uma data.
-- 4. poker_grant_prize: se a pessoa já tem o item (ganhou o mesmo pôster no
--    Jackpot durante a partida, por exemplo), a concessão dizia "concedido" sem
--    entregar nada. Agora cai no prêmio de consolação (fallback_prize_id, padrão
--    2 fichas), registrado na mesma linha de concessão.

-- 1 ---------------------------------------------------------------------------
create or replace function public.poker_stats_apply(p_uid uuid, p_mode text, p_s jsonb, p_place integer, p_forfeit boolean, p_loan boolean, p_prize boolean)
 returns poker_player_stats
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    comeback_wins = comeback_wins + coalesce(v_win and (p_s -> 'comeback') = 'true'::jsonb, false)::int,
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
$function$;

-- 2 e 3 -----------------------------------------------------------------------
create or replace function public.poker_mission_from_week()
 returns date
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  -- Com o salão fechado, a missão de pôquer não existe para ninguém.
  select case when is_open then mission_from_week end from poker_settings;
$function$;

grant execute on function public.poker_mission_from_week() to anon, authenticated;

create or replace function public.poker_mission_progress(p_uid uuid, p_week date)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  cfg poker_settings;
  b record;
  v_free int;
  v_bounty int;
begin
  select * into cfg from poker_settings;
  if not cfg.is_open or cfg.mission_from_week is null or p_week < cfg.mission_from_week then
    return 0;
  end if;
  select * into b from jackpot_week_bounds(p_week);
  select coalesce(sum(least(x.n, cfg.mission_daily_cap)), 0) into v_free
    from (select r.day, count(*) as n
            from poker_free_reports r
           where r.user_id = p_uid and r.finished and r.hands >= cfg.mission_min_hands
             and r.day >= p_week and r.day < p_week + 7
           group by r.day) x;
  select count(*) into v_bounty
    from poker_bounty_matches m
   where m.user_id = p_uid and m.status in ('won', 'lost') and m.hands >= cfg.mission_min_hands
     and m.finished_at >= b.starts_at and m.finished_at < b.ends_at;
  return coalesce(v_free, 0) + coalesce(v_bounty, 0);
end;
$function$;

-- 4 ---------------------------------------------------------------------------
create or replace function public.poker_grant_prize(p_uid uuid, p_prize_id text, p_source text, p_ref text, p_day date)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  p poker_prizes;
  v_id bigint;
  v_amount int;
  v_fallback text;
begin
  select * into p from poker_prizes where id = p_prize_id;
  if not found then
    raise exception 'unknown_prize';
  end if;
  -- Já tem o item (ex.: tirou o mesmo pôster no Jackpot durante a partida):
  -- entrega o prêmio de consolação em vez de uma concessão vazia.
  if poker_owns_prize(p_uid, p.id) then
    select fallback_prize_id into v_fallback from poker_settings;
    if v_fallback is not null and v_fallback <> p.id then
      select * into p from poker_prizes where id = v_fallback;
      if not found then
        raise exception 'unknown_prize';
      end if;
    end if;
  end if;
  insert into poker_prize_grants (user_id, prize_id, kind, payload, source, ref, day)
  values (p_uid, p.id, p.kind, p.payload, p_source, p_ref, p_day)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;

  case p.kind
    when 'tickets' then
      v_amount := least(greatest(coalesce((p.payload ->> 'amount')::int, 1), 1), 3);
      perform jackpot_wallet_row(p_uid);
      update jackpot_wallets set tickets = tickets + v_amount, updated_at = now() where user_id = p_uid;
    when 'special_tickets' then
      v_amount := least(greatest(coalesce((p.payload ->> 'amount')::int, 1), 1), 3);
      perform jackpot_wallet_row(p_uid);
      update jackpot_wallets set special_tickets = special_tickets + v_amount, updated_at = now() where user_id = p_uid;
    when 'poster' then
      -- Entra sem troca. Uma linha antiga (reset_at) volta à vida como prêmio.
      perform set_config('poker.granting', '1', true);
      insert into user_posters (user_id, item_id, effect, tradeable)
      values (p_uid, (p.payload ->> 'item_id')::int, coalesce(p.payload ->> 'effect', 'none'), false)
      on conflict (user_id, item_id, effect) do update
         set reset_at = null, left_via = null, tradeable = false, copies = 1,
             first_pulled_at = now(), last_pulled_at = now()
       where user_posters.reset_at is not null;
      perform set_config('poker.granting', '', true);
    when 'avatar_frame' then
      insert into user_cosmetic_unlocks (user_id, category, cosmetic_id, source)
      values (p_uid, 'frame', p.payload ->> 'cosmetic_id', 'poker') on conflict do nothing;
    when 'banner' then
      insert into user_cosmetic_unlocks (user_id, category, cosmetic_id, source)
      values (p_uid, 'banner', p.payload ->> 'cosmetic_id', 'poker') on conflict do nothing;
    when 'tag' then
      insert into user_special_tags (user_id, tag_id, is_permanent)
      values (p_uid, p.payload ->> 'tag_id', true)
      on conflict (user_id, tag_id) do update set is_permanent = true;
    when 'deck', 'table', 'poker_quip', 'rival' then
      insert into poker_owned_items (user_id, item_id, source)
      values (p_uid, p.payload ->> 'item_id', p_source) on conflict do nothing;
    else
      raise exception 'unknown_prize_kind';
  end case;
  return true;
end;
$function$;
