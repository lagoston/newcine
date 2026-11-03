-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: ganchos no que já existe.
--
-- Cada função abaixo parte da versão de PRODUÇÃO (lida com pg_get_functiondef
-- em 03/11/2026; o bloco de checagem logo abaixo recusa aplicar se alguma
-- mudou desde então) e muda só o necessário:
--   - get_jackpot_state: + campo "poker" (poker_teaser; um erro no pôquer
--     nunca derruba o Jackpot). O APK antigo ignora o campo.
--   - jackpot_week_missions: immutable → stable; a partir de
--     poker_settings.mission_from_week o grupo misc ganha 'poker_play' (7º
--     item, rotação (idx*5+2) % 7, alvo 2). Antes disso, nada muda.
--   - jackpot_mission_progress: + ramo 'poker_play'.
--   - is_cosmetic_unlocked: + moldura/banner ganho em user_cosmetic_unlocks.
--     (set_user_cosmetic e reconcile_user_cosmetics só chamam esta função,
--     então ficam como estão.)
--   - get_trade_board: prêmio da mesa (tradeable = false) fora das listas.
--   - get_my_posters: + campo "tradeable".
-- jackpot_pull e jackpot_scheduled_pulls não são tocados.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.get_jackpot_state()', '8b74a122e052404bbc1f0e5a78ff19b2'),
      ('public.jackpot_week_missions(date)', '9d1a584ae1fc0d88bc9eb50e385944b6'),
      ('public.jackpot_mission_progress(uuid,date,text,text)', '6b338d411b96a253fe403c354a0846ef'),
      ('public.is_cosmetic_unlocked(uuid,text,text)', '698ff6d73595812d84a72a06944776da'),
      ('public.get_trade_board(uuid)', 'e5467502ea51e68e6159bfd1be4882bb'),
      ('public.get_my_posters()', 'ae4e3b7075cd2b439973419cda0509cf')
    ) v(sig, expected)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.expected then
      raise exception 'A função % mudou em produção desde 03/11/2026: releia com pg_get_functiondef antes de aplicar', r.sig;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auxiliares da missão poker_play
-- ---------------------------------------------------------------------------

-- Semana a partir da qual a missão entra na rotação (null = desligada).
create or replace function public.poker_mission_from_week()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select mission_from_week from poker_settings;
$$;

-- Partidas de pôquer terminadas na semana (sem desistência), com pelo menos
-- mission_min_hands mãos: relatos livres somados por dia com teto
-- mission_daily_cap, mais as partidas com prêmio terminadas.
create or replace function public.poker_mission_progress(p_uid uuid, p_week date)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg poker_settings;
  b record;
  v_free int;
  v_bounty int;
begin
  select * into cfg from poker_settings;
  if cfg.mission_from_week is null or p_week < cfg.mission_from_week then
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
$$;

revoke all on function public.poker_mission_from_week() from public, anon, authenticated;
revoke all on function public.poker_mission_progress(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_jackpot_state (+ "poker")
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
    'owned', (select count(*) from user_posters where user_id = v_uid and reset_at is null),
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
-- Missões: poker_play
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jackpot_week_missions(p_week date)
 RETURNS TABLE(mission_key text, kind text, param text, target integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  idx integer := ((p_week - date '2026-01-05') / 7);
  oracles text[] := array['bogart', 'fincher', 'cypher'];
  moods text[] := array['mind-blowing', 'catharsis', 'adventures', 'adrenaline', 'dark-and-scary', 'drug-trip', 'romantic', 'family-time', 'laugh-out-loud'];
  misc text[] := array['whisper', 'rate_series', 'review', 'watchlist', 'rate_any', 'rate_classic'];
  v_poker_from date := public.poker_mission_from_week();
  v_oracle text := oracles[1 + ((idx % 3) + 3) % 3];
  v_mood text := moods[1 + (((idx * 4 + 1) % 9) + 9) % 9];
  v_misc text := misc[1 + (((idx * 5 + 2) % 6) + 6) % 6];
begin
  -- 03/11/2026 (pôquer): a partir de poker_settings.mission_from_week, o
  -- grupo misc ganha 'poker_play' como 7º item. Antes disso, igual.
  if v_poker_from is not null and p_week >= v_poker_from then
    misc := misc || 'poker_play'::text;
    v_misc := misc[1 + (((idx * 5 + 2) % 7) + 7) % 7];
  end if;
  mission_key := 'oracle:' || v_oracle; kind := 'rate_oracle'; param := v_oracle; target := 1; return next;
  mission_key := 'mood:' || v_mood; kind := 'rate_mood'; param := v_mood; target := 1; return next;
  mission_key := 'misc:' || v_misc; kind := v_misc; param := null;
  target := case v_misc when 'watchlist' then 3 when 'rate_any' then 5 when 'poker_play' then 2 else 1 end;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jackpot_mission_progress(p_uid uuid, p_week date, p_kind text, p_param text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  v integer := 0;
begin
  -- 03/11/2026 (pôquer): partidas de pôquer terminadas na semana.
  if p_kind = 'poker_play' then
    return poker_mission_progress(p_uid, p_week);
  end if;
  select * into b from jackpot_week_bounds(p_week);
  with acts as (
    select distinct a.kind, a.media_type, a.tmdb_id
      from jackpot_actions a
     where a.user_id = p_uid and a.created_at >= b.starts_at and a.created_at < b.ends_at
  )
  select count(*) into v
    from acts a
   where case p_kind
           when 'rate_oracle' then a.kind = 'rate' and exists (
             select 1 from recommendation_pools rp
              where rp.card_type = p_param and rp.mood_key <> 'random-surprise'
                and (case when a.media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(a.tmdb_id))
           when 'rate_mood' then a.kind = 'rate' and exists (
             select 1 from recommendation_pools rp
              where rp.mood_key = p_param and rp.card_type in ('bogart', 'fincher', 'cypher')
                and (case when a.media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(a.tmdb_id))
           when 'whisper' then a.kind = 'whisper'
           when 'review' then a.kind = 'review'
           when 'watchlist' then a.kind = 'watchlist'
           when 'rate_any' then a.kind = 'rate'
           when 'rate_series' then a.kind = 'rate' and a.media_type = 'tv'
           when 'rate_classic' then a.kind = 'rate' and a.media_type = 'movie' and exists (
             select 1 from movie_cache mc
              where mc.tmdb_id = a.tmdb_id and mc.media_type = 'movie' and mc.release_date < date '1980-01-01')
           else false
         end;
  return coalesce(v, 0);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Molduras e banners ganhos na mesa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_cosmetic_unlocked(p_user_id uuid, p_category text, p_cosmetic_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req RECORD;
  v_is_premium boolean;
BEGIN
  -- 03/11/2026 (pôquer): moldura ou banner ganho fora de tag/Premium (prêmio
  -- da mesa) vale para sempre, com ou sem Premium.
  IF EXISTS (SELECT 1 FROM user_cosmetic_unlocks u
              WHERE u.user_id = p_user_id AND u.category = p_category AND u.cosmetic_id = p_cosmetic_id) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_req FROM cosmetic_requirements
  WHERE category = p_category AND cosmetic_id = p_cosmetic_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_req.is_premium THEN
    SELECT (plan_type = 'premium' OR COALESCE(lifetime_premium, false)) INTO v_is_premium
    FROM profiles WHERE id = p_user_id;
    IF NOT COALESCE(v_is_premium, false) THEN RETURN false; END IF;
  END IF;

  RETURN is_required_tag_met(p_user_id, v_req.required_tag);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Trocas: prêmio da mesa fora do quadro; "tradeable" na coleção
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
  return jsonb_build_object(
    'mine', coalesce((
      select jsonb_agg(poster_item_json(pi) || jsonb_build_object('effect', up.effect, 'other_has', jackpot_owns(p_friend, up.item_id, up.effect))
                       order by array_position(order_r, pi.rarity), array_position(order_e, up.effect), pi.id)
        from user_posters up join poster_items pi on pi.id = up.item_id
       where up.user_id = v_uid and up.reset_at is null and pi.is_active and up.tradeable), '[]'::jsonb),
    'theirs', coalesce((
      select jsonb_agg(poster_item_json(pi) || jsonb_build_object('effect', up.effect, 'other_has', jackpot_owns(v_uid, up.item_id, up.effect))
                       order by array_position(order_r, pi.rarity), array_position(order_e, up.effect), pi.id)
        from user_posters up join poster_items pi on pi.id = up.item_id
       where up.user_id = p_friend and up.reset_at is null and pi.is_active and up.tradeable), '[]'::jsonb)
  );
end;
$function$;

-- 03/11/2026 (pôquer): + "tradeable" (false = prêmio da mesa, selo na Coleção).
CREATE OR REPLACE FUNCTION public.get_my_posters()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(poster_item_json(pi) || jsonb_build_object(
           'effect', up.effect, 'copies', 1, 'first_pulled_at', up.first_pulled_at,
           'equipped', exists (select 1 from user_poster_equips e where e.user_id = up.user_id and e.item_id = up.item_id and e.effect = up.effect and e.active),
           'in_library', exists (select 1 from user_movies um where um.user_id = up.user_id and um.movie_id = pi.tmdb_id and coalesce(um.media_type, 'movie') = pi.media_type),
           'tradeable', up.tradeable)
         order by array_position(array['legendary', 'epic', 'rare', 'common'], pi.rarity),
                  array_position(array['ultra_red', 'negative', 'holo', 'none'], up.effect), up.first_pulled_at desc), '[]'::jsonb)
    from user_posters up
    join poster_items pi on pi.id = up.item_id
   where up.user_id = auth.uid() and up.reset_at is null;
$function$;
