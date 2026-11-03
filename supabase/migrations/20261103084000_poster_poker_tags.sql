-- 03/11/2026 (tarde, adendo das 13h22) — Pôster Poker, pacote F: as tags do pôquer.
--
-- Pedido do Bruno: as conquistas do pôquer viram tags da categoria nova "Jogos".
-- As LINHAS de special_tags (nomes, emojis, textos, categoria) são do pacote T;
-- aqui só a concessão, no fim do torneio, no servidor, idempotente (on conflict
-- do nothing) e só para tags que já existem em special_tags (uma tag que o T
-- ainda não criou simplesmente não é concedida — não quebra o fim da partida).
--
--   poker-first-win     1º lugar num torneio
--   poker-fox-hunter    eliminou o Raposo num torneio
--   poker-clean-sweep   eliminou os três oráculos no mesmo torneio
--   poker-oscar-bluff   pote de 20 BB+ sem showdown com mão pior (apurado pelo motor)
--   poker-seven-nights  torneio terminado em 7 dias seguidos (Brasília)
--   poker-high-stakes   venceu apostando um pôster da coleção
--   poker-royal-flush   venceu um torneio de pôster lendário
--   poker-full-house    passou a ter os 9 pôsteres do Pôster Poker (gold)
--   poker-card-shark    10 vitórias em torneio
--
-- get_poker_home().marks e get_poker_scoreboard().marks passam a listar os 9 ids.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.poker_award_marks(uuid,uuid,jsonb)', '9327b92077fb8e978417bc7b748a7180'),
      ('public.get_poker_home()', '9672c8a19dd875812edbed3d572d0aa7'),
      ('public.get_poker_scoreboard()', 'b41dd69451bffd4530618e6fedcfdce2')
    ) v(sig, expected)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.expected then
      raise exception 'A função % mudou em produção desde 03/11/2026: releia com pg_get_functiondef antes de aplicar', r.sig;
    end if;
  end loop;
end;
$$;

-- As tags do pôquer, na ordem de exibição.
create or replace function public.poker_mark_ids()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['poker-first-win', 'poker-fox-hunter', 'poker-clean-sweep', 'poker-oscar-bluff', 'poker-seven-nights',
               'poker-high-stakes', 'poker-royal-flush', 'poker-full-house', 'poker-card-shark'];
$$;
revoke all on function public.poker_mark_ids() from public, anon, authenticated;

-- Fim de uma partida de torneio → tags. Só partidas do servidor (chamada por
-- poker_apply_bounty_result, depois de poker_tournament_settle ter concedido o
-- pôster). Partida da fase 1 (week null) não concede mais nada.
create or replace function public.poker_award_marks(p_uid uuid, p_match_id uuid, p_summary jsonb)
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m poker_bounty_matches;
  s jsonb := coalesce(p_summary, '{}'::jsonb);
  v_elims jsonb := case when jsonb_typeof(p_summary -> 'eliminations') = 'array' then p_summary -> 'eliminations' else '[]'::jsonb end;
  v_tags text[] := '{}';
  v_new text[];
  v_won boolean;
  v_need int;
begin
  select * into m from poker_bounty_matches where id = p_match_id and user_id = p_uid;
  if not found or m.week is null then
    return '{}';
  end if;
  v_won := m.status = 'won' and m.place = 1;

  -- All-in: 1º lugar num torneio.
  if v_won then
    v_tags := array_append(v_tags, 'poker-first-win');
  end if;
  -- Outfoxed: eliminatorOf(fincher) = human.
  if (s -> 'marks' -> 'foxHunter') = 'true'::jsonb
     or exists (select 1 from jsonb_array_elements(v_elims) e where e ->> 'victimId' = 'fincher' and e ->> 'byId' = 'human') then
    v_tags := array_append(v_tags, 'poker-fox-hunter');
  end if;
  -- Clean Sweep: a pessoa eliminou os três oráculos no mesmo torneio.
  if (s -> 'marks' -> 'cleanSweep') = 'true'::jsonb
     or (select count(distinct e ->> 'victimId') from jsonb_array_elements(v_elims) e
          where e ->> 'byId' = 'human' and e ->> 'victimId' in ('bogart', 'cypher', 'fincher')) = 3 then
    v_tags := array_append(v_tags, 'poker-clean-sweep');
  end if;
  -- Poker Face: apurado pelo motor no servidor (informação privada).
  if (s -> 'marks' -> 'oscarBluff') = 'true'::jsonb then
    v_tags := array_append(v_tags, 'poker-oscar-bluff');
  end if;
  -- Seven Nights: torneio terminado em 7 dias seguidos de Brasília.
  if (select count(distinct x.day) from poker_bounty_matches x
       where x.user_id = p_uid and x.week is not null and x.status in ('won', 'lost', 'forfeit', 'abandoned')
         and x.day between m.day - 6 and m.day) = 7 then
    v_tags := array_append(v_tags, 'poker-seven-nights');
  end if;
  if v_won then
    -- High Stakes: venceu apostando um pôster da coleção.
    if m.stake_kind = 'poster' then
      v_tags := array_append(v_tags, 'poker-high-stakes');
    end if;
    -- Royal Flush: venceu um torneio de pôster lendário.
    if m.rarity = 'legendary' then
      v_tags := array_append(v_tags, 'poker-royal-flush');
    end if;
    -- Full House: tem os 9 pôsteres do Pôster Poker (o desta vitória já foi concedido).
    select count(*) into v_need from poster_items where exclusive = 'poker';
    if v_need > 0 and (select count(distinct up.item_id) from user_posters up join poster_items pi on pi.id = up.item_id
                        where up.user_id = p_uid and up.reset_at is null and up.effect = 'gold' and pi.exclusive = 'poker') >= v_need then
      v_tags := array_append(v_tags, 'poker-full-house');
    end if;
    -- Card Shark: 10 vitórias em torneio.
    if (select count(*) from poker_bounty_matches x where x.user_id = p_uid and x.week is not null and x.status = 'won') >= 10 then
      v_tags := array_append(v_tags, 'poker-card-shark');
    end if;
  end if;

  -- Só tags que existem (as linhas são do pacote T); quem já tem não ganha de novo.
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
$function$;

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
                        where u.user_id = v_uid and u.tag_id = any (poker_mark_ids())), '[]'::jsonb));
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
                       order by array_position(poker_mark_ids(), st.id))
        from special_tags st
        left join user_special_tags u on u.user_id = v_uid and u.tag_id = st.id
       where st.id = any (poker_mark_ids())), '[]'::jsonb),
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
