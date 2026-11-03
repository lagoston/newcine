-- 03/11/2026 (tarde) — Pôster Poker, pacote F: o lobby, o resumo e o placar.
--
--   - get_poker_home: + "tournament" (o torneio da semana: pôster, entrada,
--     tentativas do dia, "já é seu", aposta possível, partida aberta, Cobra) e
--     "collection" (os 9 pôsteres, com a próxima semana de cada um) e
--     "cobra_items" (a vitrine, vazia por enquanto). "bounty" (o prêmio do dia)
--     vira null; "tickets" vai para o topo.
--   - poker_teaser (o campo "poker" de get_jackpot_state): o torneio da semana
--     no lugar do prêmio do dia; home_strip = true (o botão "Pôster Poker" da
--     home aparece para quem tem o pôquer liberado).
--   - get_poker_scoreboard: + semana, efeito, aposta e recompensas nas últimas
--     partidas; "week" nos prêmios; amigos que venceram nesta semana.
-- Formatos em .../poker2/status/F_NOTES.md (para o pacote G).

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.get_poker_home()', 'f3fde737d0a35dda8287f2d2dfd3a236'),
      ('public.get_poker_scoreboard()', '42e4f8d583a4f86a57546772ba5e4dbc'),
      ('public.poker_teaser(uuid)', '1d6946207667a93a018c8501ba40d693')
    ) v(sig, expected)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.expected then
      raise exception 'A função % mudou em produção desde 03/11/2026: releia com pg_get_functiondef antes de aplicar', r.sig;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auxiliares do lobby
-- ---------------------------------------------------------------------------

-- O torneio da semana para uma pessoa (o "tournament" de get_poker_home).
create or replace function public.poker_tournament_home(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg poker_settings;
  v_day date := poker_today();
  v_week date := poker_week_start();
  t poker_tournament_weeks;
  n poker_tournament_weeks;
  p poker_prizes;
  v_item int;
  a poker_bounty_matches;
  v_tickets int;
begin
  select * into cfg from poker_settings;
  t := poker_tournament_for_week(v_week);
  if t.week is null then
    return null;
  end if;
  n := poker_tournament_for_week(v_week + 7);
  select * into p from poker_prizes where id = t.prize_id;
  v_item := (p.payload ->> 'item_id')::int;
  select * into a from poker_bounty_matches where user_id = p_uid and status = 'active';
  select tickets into v_tickets from jackpot_wallets where user_id = p_uid;
  return jsonb_build_object(
    'week', v_week,
    'ends_at', ((v_week + 7)::timestamp at time zone 'America/Sao_Paulo'),
    'prize', poker_pp_json(t.prize_id),
    'entry_chips', coalesce((cfg.entry_chips ->> p.rarity)::int, 1),
    'chips', coalesce(v_tickets, 0),
    'attempts_used', poker_tournament_attempts(p_uid, v_day),
    'max_attempts', cfg.max_attempts,
    'owned', jackpot_owns(p_uid, v_item, 'gold'),
    'won_this_week', poker_won_week(p_uid, v_week),
    'active_match', case when a.id is not null then jsonb_build_object(
                      'match_id', a.id, 'week', a.week, 'hand', a.hands, 'seq', a.seq, 'prize_id', a.prize_id,
                      'stake', poker_stake_json(a.stake_kind, a.stake_chips, a.stake_item_id, a.stake_effect)) end,
    -- Pôsteres que dá para apostar: da mesma raridade, qualquer efeito; nunca exclusivo/gold nem já apostado.
    'stake_options', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', pi.id, 'effect', up.effect,
               'title', coalesce(mc.title_pt, mc.title_en), 'title_en', coalesce(mc.title_en, mc.title_pt),
               'year', extract(year from mc.release_date)::int, 'file_path', pi.file_path,
               'serial', pi.serial, 'rarity', pi.rarity)
             order by array_position(array['none', 'holo', 'negative', 'ultra_red'], up.effect), pi.serial)
        from user_posters up
        join poster_items pi on pi.id = up.item_id
        left join movie_cache mc on mc.tmdb_id = pi.tmdb_id and mc.media_type = pi.media_type
       where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null and up.effect <> 'gold'
         and pi.rarity = p.rarity and not poker_poster_staked(up.user_id, up.item_id, up.effect)), '[]'::jsonb),
    'cobra_pool', (select count(*) from poker_cobra_eligible(p_uid)),
    'stars', coalesce((cfg.difficulty -> p.rarity ->> 'stars')::int, 0),
    'loan_next', poker_loan_due(p_uid),
    'friends_won', (select count(distinct g.user_id) from poker_prize_grants g
                     where g.week = v_week and g.user_id <> p_uid
                       and exists (select 1 from friendships f
                                    where f.status = 'accepted'
                                      and ((f.requester_id = p_uid and f.addressee_id = g.user_id)
                                        or (f.addressee_id = p_uid and f.requester_id = g.user_id)))),
    'next', case when n.week is not null then jsonb_build_object(
              'week', n.week, 'prize_id', n.prize_id, 'rarity', (select x.rarity from poker_prizes x where x.id = n.prize_id)) end);
end;
$$;

-- Os 9 pôsteres do Pôster Poker (a "collection" de get_poker_home), com a
-- próxima semana (>= a atual) em que cada um volta, pelo ciclo.
create or replace function public.poker_tournament_collection(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := poker_week_start();
  v_anchor date;
  t poker_tournament_weeks;
  v_n int;
  v_cur int;
begin
  select tournament_anchor into v_anchor from poker_settings;
  t := poker_tournament_for_week(v_week);
  select count(*) into v_n from poker_prizes where tournament_slot is not null and is_active;
  if v_n = 0 then
    return '[]'::jsonb;
  end if;
  v_cur := ((((v_week - v_anchor) / 7) % v_n) + v_n) % v_n;
  return coalesce((
    select jsonb_agg(c.j || jsonb_build_object(
             'owned', jackpot_owns(p_uid, (c.j ->> 'item_id')::int, 'gold'),
             'next_week', case when c.id = t.prize_id then v_week else v_week + 7 * ((((c.idx - v_cur) % v_n) + v_n) % v_n) end,
             'this_week', c.id = t.prize_id)
           order by array_position(array['common', 'rare', 'epic', 'legendary'], c.j ->> 'rarity'), (c.j ->> 'serial')::int)
      from (select p.id, (row_number() over (order by p.tournament_slot) - 1)::int as idx, poker_pp_json(p.id) as j
              from poker_prizes p where p.tournament_slot is not null and p.is_active) c), '[]'::jsonb);
end;
$$;

revoke all on function public.poker_tournament_home(uuid) from public, anon, authenticated;
revoke all on function public.poker_tournament_collection(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_poker_home
-- ---------------------------------------------------------------------------

create or replace function public.get_poker_home()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  cfg poker_settings;
  pl poker_players;
  v_wins int;
  v_tickets int;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false, 'open', false);
  end if;
  select * into cfg from poker_settings;
  pl := poker_player_row(v_uid);
  select tickets into v_tickets from jackpot_wallets where user_id = v_uid;

  v_wins := poker_wins_total(v_uid);
  return jsonb_build_object(
    'enabled', true,
    'open', true,
    'proto_min', cfg.min_proto,
    'settings', poker_settings_json(),
    'bot_params', poker_bot_params_json(),
    -- 03/11/2026 (Pôster Poker): o prêmio do dia acabou; o torneio da semana mora em "tournament".
    'bounty', null,
    'tickets', coalesce(v_tickets, 0),
    'tournament', poker_tournament_home(v_uid),
    'collection', poker_tournament_collection(v_uid),
    'cobra_items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'name_pt', i.name_pt, 'name_en', i.name_en,
                                                                  'owned', exists (select 1 from poker_owned_items o where o.user_id = v_uid and o.item_id = i.id))
                                               order by i.sort, i.id)
                               from poker_items i where i.is_active and i.cobra_pool), '[]'::jsonb),
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
$function$;

-- ---------------------------------------------------------------------------
-- poker_teaser (o campo "poker" de get_jackpot_state)
-- ---------------------------------------------------------------------------

create or replace function public.poker_teaser(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg poker_settings;
  v_day date := poker_today();
  v_week date := poker_week_start();
  t poker_tournament_weeks;
  p poker_prizes;
  v_won boolean;
  v_age boolean;
begin
  if not poker_enabled(p_uid) or poker_is_bot(p_uid) then
    return jsonb_build_object('open', false);
  end if;
  select * into cfg from poker_settings;
  select age_confirmed_at is not null into v_age from poker_players where user_id = p_uid;
  t := poker_tournament_for_week(v_week);
  if t.week is null then
    return jsonb_build_object('open', true, 'enabled', true, 'day', v_day, 'week', v_week, 'prize', null,
                              'home_strip', true, 'age_confirmed', coalesce(v_age, false));
  end if;
  select * into p from poker_prizes where id = t.prize_id;
  v_won := poker_won_week(p_uid, v_week);
  -- 03/11/2026 (Pôster Poker): o torneio da semana no lugar do prêmio do dia. O
  -- botão "Pôster Poker" da home aparece para todo mundo com o pôquer liberado.
  return jsonb_build_object(
    'open', true,
    'enabled', true,
    'day', v_day,
    'week', v_week,
    'ends_at', ((v_week + 7)::timestamp at time zone 'America/Sao_Paulo'),
    'prize', (select jsonb_build_object('id', j ->> 'id', 'kind', j ->> 'kind', 'rarity', j ->> 'rarity',
                                        'name_pt', j ->> 'name_pt', 'name_en', j ->> 'name_en', 'article_pt', j ->> 'article_pt',
                                        'image', j ->> 'image', 'payload', j -> 'payload', 'effect_id', j ->> 'effect_id')
                from poker_prize_json(t.prize_id) j),
    'tournament_prize', poker_pp_json(t.prize_id),
    'carrier', null,
    'stars', coalesce((cfg.difficulty -> p.rarity ->> 'stars')::int, 0),
    'attempts_used', poker_tournament_attempts(p_uid, v_day),
    'max_attempts', cfg.max_attempts,
    'won_today', v_won,
    'won_this_week', v_won,
    'owned', jackpot_owns(p_uid, (p.payload ->> 'item_id')::int, 'gold'),
    'active', exists (select 1 from poker_bounty_matches where user_id = p_uid and status = 'active'),
    'home_strip', true,
    'age_confirmed', coalesce(v_age, false),
    'wins', poker_wins_total(p_uid),
    'matches', coalesce((select sum(matches) from poker_player_stats where user_id = p_uid), 0));
end;
$function$;

-- ---------------------------------------------------------------------------
-- get_poker_scoreboard
-- ---------------------------------------------------------------------------

create or replace function public.get_poker_scoreboard()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_day date := poker_today();
  v_week date := poker_week_start();
  v_wins int;
begin
  if not poker_enabled(v_uid) then
    return jsonb_build_object('enabled', false, 'open', false);
  end if;
  v_wins := poker_wins_total(v_uid);
  return jsonb_build_object(
    'enabled', true,
    'open', true,
    'stats', jsonb_build_object('free', poker_stats_json(v_uid, 'free'), 'bounty', poker_stats_json(v_uid, 'bounty')),
    'title', jsonb_build_object('wins', v_wins, 'id', poker_title(v_wins)),
    'recent_free', coalesce((
      select jsonb_agg(jsonb_build_object('client_id', r.client_id, 'played_at', r.played_at, 'place', r.place,
                                          'hands', r.hands, 'loan', r.loan, 'summary', r.summary) order by r.played_at desc)
        from poker_recent_matches r where r.user_id = v_uid), '[]'::jsonb),
    -- 03/11/2026 (Pôster Poker): + week, effect_id, stake, stake_status e rewards (só nas terminadas).
    'recent_bounty', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'day', m.day, 'attempt', m.attempt, 'status', m.status, 'place', m.place,
               'prize', (select jsonb_build_object('id', j ->> 'id', 'kind', j ->> 'kind', 'rarity', j ->> 'rarity',
                                                   'name_pt', j ->> 'name_pt', 'name_en', j ->> 'name_en', 'image', j ->> 'image')
                           from poker_prize_json(m.prize_id) j),
               'carrier', m.carrier, 'rarity', m.rarity, 'loan', m.loan, 'captured_hand', m.captured_hand,
               'hands', m.hands, 'created_at', m.created_at, 'finished_at', m.finished_at, 'seed_hash', m.seed_hash,
               'seed', case when m.status <> 'active' then m.seed end,
               'summary', case when m.status <> 'active' then m.summary end,
               'week', m.week, 'effect_id', m.effect_id,
               'stake', poker_stake_json(m.stake_kind, m.stake_chips, m.stake_item_id, m.stake_effect),
               'stake_status', m.stake_status,
               'rewards', case when m.status <> 'active' then m.rewards end) order by m.created_at desc)
        from (select * from poker_bounty_matches where user_id = v_uid order by created_at desc limit 20) m), '[]'::jsonb),
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object('prize_id', g.prize_id, 'kind', g.kind, 'day', g.day, 'week', g.week, 'granted_at', g.granted_at,
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
                                              or (f.addressee_id = v_uid and f.requester_id = g.user_id)))),
    'friends_won_week', (select count(distinct g.user_id) from poker_prize_grants g
                          where g.week = v_week and g.user_id <> v_uid
                            and exists (select 1 from friendships f
                                         where f.status = 'accepted'
                                           and ((f.requester_id = v_uid and f.addressee_id = g.user_id)
                                             or (f.addressee_id = v_uid and f.requester_id = g.user_id)))));
end;
$function$;
