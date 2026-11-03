-- 03/11/2026 (tarde) — Pôster Poker, pacote F: o Jackpot não vê os pôsteres do pôquer.
--
-- Os 9 pôsteres exclusivos (poster_items.exclusive = 'poker') estão com
-- is_active = false: jackpot_pull (giro, giro da sorte, giros programados e
-- "coleção completa"), get_jackpot_catalog (a fita), get_trade_friends e as
-- contas de remaining/remaining_special já filtram is_active e NÃO são tocados.
-- Aqui, o que ainda deixava passar:
--   - get_jackpot_state: "owned" contava todo pôster da pessoa; não conta mais os exclusivos.
--   - get_my_posters: gold ordena primeiro; + "exclusive" e "staked" (apostado numa partida aberta).
--   - get_trade_board: fora exclusivos, gold e pôsteres apostados.
--   - poker_trade_guard: recusa (untradeable) proposta ou aceite com exclusivo, gold ou apostado.
--   - poker_poster_revive: exclusivo/gold nunca volta a ser trocável (vale também no insert).
-- Cada função parte da versão de produção (lida em 03/11/2026; o bloco abaixo
-- recusa aplicar se alguma mudou desde então).

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.get_jackpot_state()', '1c3178414629132f25a55d9d8681e5a0'),
      ('public.get_my_posters()', '2c61d9b19152195675afe9ce2d9dbb68'),
      ('public.get_trade_board(uuid)', '9d5f4b3fed81dc21092a9e3b30232c70'),
      ('public.poker_trade_guard()', '25ebd88ab5098efcaf6452859d0b61a6'),
      ('public.poker_poster_revive()', '98a1a48d40b2e15e6cb8a2c3cbebc3ff')
    ) v(sig, expected)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.expected then
      raise exception 'A função % mudou em produção desde 03/11/2026: releia com pg_get_functiondef antes de aplicar', r.sig;
    end if;
  end loop;
end;
$$;

-- O pôster está apostado numa partida de torneio em andamento?
create or replace function public.poker_poster_staked(p_uid uuid, p_item integer, p_effect text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from poker_bounty_matches m
                  where m.user_id = p_uid and m.status = 'active' and m.stake_kind = 'poster' and m.stake_status = 'held'
                    and m.stake_item_id = p_item and m.stake_effect = p_effect);
$$;
revoke all on function public.poker_poster_staked(uuid, integer, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_jackpot_state: "owned" sem os exclusivos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_jackpot_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_week date := jackpot_week_start();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  w jackpot_wallets;
  v_premium boolean;
  v_weekly boolean;
  v_missions jsonb;
  v_items integer;
  v_owned integer;
  v_owned_fx integer;
  v_gift jsonb;
  v_poker jsonb;
  b record;
begin
  if not jackpot_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
  perform jackpot_grant_friday13(v_uid);
  w := jackpot_wallet_row(v_uid);
  v_premium := coalesce(is_premium_active(v_uid), false);
  select * into b from jackpot_week_bounds(v_week);
  v_weekly := v_premium and not exists (
    select 1 from jackpot_pulls p
     where p.user_id = v_uid and p.kind = 'special' and not p.voided and not p.from_bonus
       and p.created_at >= b.starts_at and p.created_at < b.ends_at);

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', m.mission_key, 'kind', m.kind, 'param', m.param, 'target', m.target,
           'progress', least(m.target, jackpot_mission_progress(v_uid, v_week, m.kind, m.param)),
           'claimed', exists (select 1 from jackpot_mission_claims c where c.user_id = v_uid and c.week_start = v_week and c.mission_key = m.mission_key))), '[]'::jsonb)
    into v_missions
    from jackpot_week_missions(v_week) m;

  select count(*) into v_items from poster_items where is_active;
  select count(*), count(*) filter (where up.effect <> 'none') into v_owned, v_owned_fx
    from user_posters up join poster_items pi on pi.id = up.item_id
   where up.user_id = v_uid and pi.is_active and up.reset_at is null;

  select jsonb_build_object('kind', g.kind, 'amount', g.amount, 'day', g.day)
    into v_gift
    from jackpot_gifts g
   where g.user_id = v_uid and g.seen_at is null and g.day > v_today - 7
   order by g.day desc
   limit 1;

  -- 03/11/2026 (pôquer): o resumo do Grande Blefe ({open:false} enquanto
  -- fechado para a conta). Um erro no pôquer nunca derruba o Jackpot.
  begin
    v_poker := poker_teaser(v_uid);
  exception when others then
    v_poker := jsonb_build_object('open', false);
  end;

  return jsonb_build_object(
    'enabled', true,
    'tickets', w.tickets,
    'fragments', 0,
    'premium', v_premium,
    'special_weekly', v_weekly,
    'special_tickets', w.special_tickets,
    'special_available', v_weekly or w.special_tickets > 0,
    'lucky_progress', w.lucky_progress,
    'lucky_spins', w.lucky_spins,
    'lucky_goal', 10,
    'week_start', v_week,
    'week_ends_at', b.ends_at,
    'missions', v_missions,
    'catalog', (select jsonb_build_object(
                  'common', count(*) filter (where rarity = 'common'),
                  'rare', count(*) filter (where rarity = 'rare'),
                  'epic', count(*) filter (where rarity = 'epic'),
                  'legendary', count(*) filter (where rarity = 'legendary'),
                  'total', count(*))
                  from poster_items where is_active),
    -- 03/11/2026 (Pôster Poker): os pôsteres exclusivos do pôquer não contam na coleção do Jackpot.
    'owned', (select count(*) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = v_uid and up.reset_at is null and pi.exclusive is null),
    'remaining', v_items * 4 - v_owned,
    'remaining_special', v_items * 3 - v_owned_fx,
    'gift', v_gift,
    'friday13_perk', exists (
      select 1 from user_special_tags t
       where t.user_id = v_uid and (t.tag_id = 'scary-clown' or t.tag_id ~ '^scary-clown-[0-9]+$')),
    'daily_chip', not exists (select 1 from jackpot_daily_chips d where d.user_id = v_uid and d.day = v_today)
                  and not exists (select 1 from bot_accounts ba where ba.user_id = v_uid),
    'poker', v_poker
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- get_my_posters: gold primeiro, + exclusive e staked
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_posters()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 03/11/2026 (Pôster Poker): gold ordena antes dos outros efeitos; "exclusive"
  -- ('poker' = pôster do Pôster Poker) e "staked" (apostado numa partida aberta).
  select coalesce(jsonb_agg(poster_item_json(pi) || jsonb_build_object(
           'effect', up.effect, 'copies', 1, 'first_pulled_at', up.first_pulled_at,
           'equipped', exists (select 1 from user_poster_equips e where e.user_id = up.user_id and e.item_id = up.item_id and e.effect = up.effect and e.active),
           'in_library', exists (select 1 from user_movies um where um.user_id = up.user_id and um.movie_id = pi.tmdb_id and coalesce(um.media_type, 'movie') = pi.media_type),
           'tradeable', up.tradeable,
           'exclusive', pi.exclusive,
           'staked', poker_poster_staked(up.user_id, up.item_id, up.effect))
         order by array_position(array['legendary', 'epic', 'rare', 'common'], pi.rarity),
                  array_position(array['gold', 'ultra_red', 'negative', 'holo', 'none'], up.effect), up.first_pulled_at desc), '[]'::jsonb)
    from user_posters up
    join poster_items pi on pi.id = up.item_id
   where up.user_id = auth.uid() and up.reset_at is null;
$function$;

-- ---------------------------------------------------------------------------
-- Trocas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trade_board(p_friend uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  order_r constant text[] := array['legendary', 'epic', 'rare', 'common'];
  order_e constant text[] := array['ultra_red', 'negative', 'holo', 'none'];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not are_friends(v_uid, p_friend) then
    raise exception 'not_friends';
  end if;
  -- 03/11/2026 (pôquer): pôster ganho na mesa (tradeable = false) não entra em trocas.
  -- 03/11/2026 (Pôster Poker): nem exclusivo, nem gold, nem apostado numa partida aberta.
  return jsonb_build_object(
    'mine', coalesce((
      select jsonb_agg(poster_item_json(pi) || jsonb_build_object('effect', up.effect, 'other_has', jackpot_owns(p_friend, up.item_id, up.effect))
                       order by array_position(order_r, pi.rarity), array_position(order_e, up.effect), pi.id)
        from user_posters up join poster_items pi on pi.id = up.item_id
       where up.user_id = v_uid and up.reset_at is null and pi.is_active and up.tradeable
         and pi.exclusive is null and up.effect <> 'gold' and not poker_poster_staked(up.user_id, up.item_id, up.effect)), '[]'::jsonb),
    'theirs', coalesce((
      select jsonb_agg(poster_item_json(pi) || jsonb_build_object('effect', up.effect, 'other_has', jackpot_owns(v_uid, up.item_id, up.effect))
                       order by array_position(order_r, pi.rarity), array_position(order_e, up.effect), pi.id)
        from user_posters up join poster_items pi on pi.id = up.item_id
       where up.user_id = p_friend and up.reset_at is null and pi.is_active and up.tradeable
         and pi.exclusive is null and up.effect <> 'gold' and not poker_poster_staked(up.user_id, up.item_id, up.effect)), '[]'::jsonb)
  );
end;
$function$;

-- Na proposta (insert) e no aceite (status → accepted): recusa prêmio da mesa
-- (tradeable = false), pôster exclusivo do pôquer, efeito gold e pôster apostado
-- numa partida de torneio em andamento (Pôster Poker, 03/11/2026).
CREATE OR REPLACE FUNCTION public.poker_trade_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' or new.status = 'accepted' then
    if new.offer_effect = 'gold' or new.ask_effect = 'gold'
       or exists (select 1 from poster_items pi where pi.id in (new.offer_item, new.ask_item) and pi.exclusive is not null)
       or exists (select 1 from user_posters up
                   where up.user_id = new.from_user and up.item_id = new.offer_item and up.effect = new.offer_effect
                     and not up.tradeable)
       or exists (select 1 from user_posters up
                   where up.user_id = new.to_user and up.item_id = new.ask_item and up.effect = new.ask_effect
                     and not up.tradeable)
       or poker_poster_staked(new.from_user, new.offer_item, new.offer_effect)
       or poker_poster_staked(new.to_user, new.ask_item, new.ask_effect) then
      raise exception 'untradeable';
    end if;
  end if;
  return new;
end;
$function$;

-- Uma linha que volta à vida (reset_at sai) por sorteio ou troca é uma cópia
-- nova, vinda do Jackpot: volta a poder ser trocada. Só a concessão do pôquer
-- (poker.granting na transação) mantém false. Pôster exclusivo ou gold nunca é
-- trocável, nem no insert (Pôster Poker, 03/11/2026).
CREATE OR REPLACE FUNCTION public.poker_poster_revive()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.effect = 'gold' or exists (select 1 from poster_items pi where pi.id = new.item_id and pi.exclusive is not null) then
    new.tradeable := false;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.reset_at is not null and new.reset_at is null and not new.tradeable
     and coalesce(current_setting('poker.granting', true), '') <> '1' then
    new.tradeable := true;
  end if;
  return new;
end;
$function$;

create or replace trigger poker_poster_revive
before insert or update on public.user_posters
for each row execute function public.poker_poster_revive();
