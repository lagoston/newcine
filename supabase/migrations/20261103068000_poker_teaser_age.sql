-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: o resumo do Jackpot (campo
-- "poker" de get_jackpot_state) ganha age_confirmed. A linha "Hoje na mesa"
-- leva direto à mesa do prêmio (2 toques da home); sabendo se falta a
-- confirmação 18+, a interface abre a folha antes. O resto é igual ao de
-- 20261103062000_poker_bounty.

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
  v_age boolean;
  v_strip boolean;
  v_rarity text;
begin
  if not poker_enabled(p_uid) or poker_is_bot(p_uid) then
    return jsonb_build_object('open', false);
  end if;
  select * into cfg from poker_settings;
  d := poker_bounty_for_day(v_day);
  if d.day is null then
    return jsonb_build_object('open', true, 'enabled', true, 'day', v_day, 'prize', null, 'home_strip', false);
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
  select last_played_at, age_confirmed_at is not null into v_last, v_age from poker_players where user_id = p_uid;
  -- Faixa da home: liberado, ainda não tentou nem capturou hoje e (lançamento
  -- recente ou jogou nos últimos 14 dias). Sem launched_at (só testers): mostra.
  v_strip := v_used = 0 and not v_won
             and (cfg.launched_at is null
                  or now() < cfg.launched_at + make_interval(days => cfg.home_strip_launch_days)
                  or v_last > now() - make_interval(days => cfg.home_strip_recent_days));
  return jsonb_build_object(
    'open', true,
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
    'age_confirmed', coalesce(v_age, false),
    'wins', poker_wins_total(p_uid),
    'matches', coalesce((select sum(matches) from poker_player_stats where user_id = p_uid), 0));
end;
$$;
