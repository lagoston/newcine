-- Poster Jackpot: limite diário das trocas (31/10/2026).
--
-- Pedido do Bruno: "um limite de troca para não ficar algo sem controle,
-- tipo 3 por dia". Por pessoa, no dia de Brasília:
--   • até 3 trocas feitas (aceitas, dos dois lados);
--   • até 3 propostas enviadas (contam também as canceladas, recusadas ou
--     anuladas, para não virar mandar-e-cancelar).
-- Ao aceitar, valem os dois: quem aceita precisa ter troca sobrando hoje, e
-- quem propôs também. Se quem propôs já fez 3 hoje, a proposta continua
-- aberta e dá para aceitar amanhã.
--
-- E mais: depois de um giro, as propostas abertas da pessoa que deixaram
-- de valer (ela acabou de ganhar o pôster que receberia) já viram "não vale
-- mais", em vez de esperar alguém tentar aceitar.

create or replace function public.jackpot_today_start()
returns timestamptz
language sql
stable
as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
$$;

create or replace function public.jackpot_trades_today(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from poster_trades
   where status = 'accepted' and responded_at >= jackpot_today_start()
     and (from_user = p_uid or to_user = p_uid);
$$;
revoke all on function public.jackpot_trades_today(uuid) from public, anon, authenticated;

create or replace function public.jackpot_proposals_today(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from poster_trades where from_user = p_uid and created_at >= jackpot_today_start();
$$;
revoke all on function public.jackpot_proposals_today(uuid) from public, anon, authenticated;

-- O que sobrou hoje (para a aba Trocas mostrar).
create or replace function public.get_trade_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  return jsonb_build_object('limit', 3, 'trades_today', jackpot_trades_today(v_uid), 'proposals_today', jackpot_proposals_today(v_uid));
end;
$$;
revoke all on function public.get_trade_limits() from public, anon;
grant execute on function public.get_trade_limits() to authenticated;

create or replace function public.propose_poster_trade(p_friend uuid, p_offer_item integer, p_offer_effect text, p_ask_item integer, p_ask_effect text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not jackpot_enabled(v_uid) then
    raise exception 'jackpot_closed';
  end if;
  if p_friend is null or p_friend = v_uid or not are_friends(v_uid, p_friend)
     or exists (select 1 from bot_accounts where user_id = p_friend) then
    raise exception 'not_friends';
  end if;
  if jackpot_proposals_today(v_uid) >= 3 then
    raise exception 'daily_proposals';
  end if;
  if jackpot_trades_today(v_uid) >= 3 then
    raise exception 'daily_trades';
  end if;
  if not jackpot_owns(v_uid, p_offer_item, p_offer_effect) then
    raise exception 'not_owned';
  end if;
  if jackpot_owns(p_friend, p_offer_item, p_offer_effect) then
    raise exception 'they_have';
  end if;
  if not jackpot_owns(p_friend, p_ask_item, p_ask_effect) then
    raise exception 'not_theirs';
  end if;
  if jackpot_owns(v_uid, p_ask_item, p_ask_effect) then
    raise exception 'you_have';
  end if;
  if exists (select 1 from poster_trades
              where status = 'pending' and from_user = v_uid and to_user = p_friend
                and offer_item = p_offer_item and offer_effect = p_offer_effect
                and ask_item = p_ask_item and ask_effect = p_ask_effect) then
    raise exception 'duplicate';
  end if;
  if (select count(*) from poster_trades where status = 'pending' and from_user = v_uid) >= 10 then
    raise exception 'too_many';
  end if;

  insert into poster_trades (from_user, to_user, offer_item, offer_effect, ask_item, ask_effect)
  values (v_uid, p_friend, p_offer_item, p_offer_effect, p_ask_item, p_ask_effect)
  returning id into v_id;

  insert into friend_indications (from_user_id, to_user_id, type, media_type, trade_id, read)
  values (v_uid, p_friend, 'poster_trade', null, v_id, false);

  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function public.propose_poster_trade(uuid, integer, text, integer, text) from public, anon;
grant execute on function public.propose_poster_trade(uuid, integer, text, integer, text) to authenticated;

create or replace function public.respond_poster_trade(p_trade bigint, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t poster_trades;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into t from poster_trades where id = p_trade for update;
  if not found or t.to_user <> v_uid then
    raise exception 'not_found';
  end if;
  if t.status <> 'pending' then
    return jsonb_build_object('status', t.status);
  end if;

  if not p_accept then
    update poster_trades set status = 'declined', responded_at = now() where id = t.id;
    insert into friend_indications (from_user_id, to_user_id, type, media_type, trade_id, read)
    values (v_uid, t.from_user, 'poster_trade_result', null, t.id, false);
    return jsonb_build_object('status', 'declined');
  end if;

  if jackpot_trades_today(v_uid) >= 3 then
    raise exception 'daily_trades';
  end if;
  if jackpot_trades_today(t.from_user) >= 3 then
    raise exception 'their_daily_trades';
  end if;

  perform 1 from user_posters
   where (user_id = t.from_user and item_id = t.offer_item and effect = t.offer_effect)
      or (user_id = t.to_user and item_id = t.ask_item and effect = t.ask_effect)
     for update;
  if not (jackpot_owns(t.from_user, t.offer_item, t.offer_effect)
          and not jackpot_owns(t.to_user, t.offer_item, t.offer_effect)
          and jackpot_owns(t.to_user, t.ask_item, t.ask_effect)
          and not jackpot_owns(t.from_user, t.ask_item, t.ask_effect)) then
    update poster_trades set status = 'void', responded_at = now() where id = t.id;
    return jsonb_build_object('status', 'void');
  end if;

  update user_posters set reset_at = now(), left_via = 'trade'
   where user_id = t.from_user and item_id = t.offer_item and effect = t.offer_effect;
  update user_posters set reset_at = now(), left_via = 'trade'
   where user_id = t.to_user and item_id = t.ask_item and effect = t.ask_effect;

  insert into user_posters (user_id, item_id, effect) values (t.to_user, t.offer_item, t.offer_effect)
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, left_via = null, copies = 1, first_pulled_at = now(), last_pulled_at = now();
  insert into user_posters (user_id, item_id, effect) values (t.from_user, t.ask_item, t.ask_effect)
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, left_via = null, copies = 1, first_pulled_at = now(), last_pulled_at = now();

  update user_poster_equips set active = false
   where active
     and ((user_id = t.from_user and item_id = t.offer_item and effect = t.offer_effect)
       or (user_id = t.to_user and item_id = t.ask_item and effect = t.ask_effect));

  update poster_trades set status = 'accepted', responded_at = now() where id = t.id;
  perform jackpot_void_stale_trades(array[t.from_user, t.to_user]);

  insert into friend_indications (from_user_id, to_user_id, type, media_type, trade_id, read)
  values (v_uid, t.from_user, 'poster_trade_result', null, t.id, false);

  return jsonb_build_object('status', 'accepted');
end;
$$;
revoke all on function public.respond_poster_trade(bigint, boolean) from public, anon;
grant execute on function public.respond_poster_trade(bigint, boolean) to authenticated;

-- O giro (versão de 20261031010000) + anular as propostas que deixaram de
-- valer para quem girou.
create or replace function public.jackpot_pull(p_kind text default 'normal')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := jackpot_week_start();
  b record;
  w jackpot_wallets;
  r double precision;
  v_rarity text;
  v_effect text := 'none';
  v_rorder text[];
  v_eorder text[];
  v_item poster_items;
  v_found boolean := false;
  v_weekly boolean := false;
begin
  if not jackpot_enabled(v_uid) then
    raise exception 'jackpot_closed';
  end if;
  if p_kind not in ('normal', 'special') then
    raise exception 'invalid_kind';
  end if;
  w := jackpot_wallet_row(v_uid);
  perform 1 from jackpot_wallets where user_id = v_uid for update;
  select * into b from jackpot_week_bounds(v_week);
  select * into w from jackpot_wallets where user_id = v_uid;

  if p_kind = 'special' then
    v_weekly := coalesce(is_premium_active(v_uid), false) and not exists (
      select 1 from jackpot_pulls p
       where p.user_id = v_uid and p.kind = 'special' and not p.voided and not p.from_bonus
         and p.created_at >= b.starts_at and p.created_at < b.ends_at);
    if not v_weekly and w.special_tickets < 1 then
      raise exception 'no_special';
    end if;
  else
    if w.tickets < 1 then
      raise exception 'no_tickets';
    end if;
  end if;

  r := random();
  v_rarity := case when r < 0.04 then 'legendary' when r < 0.17 then 'epic' when r < 0.45 then 'rare' else 'common' end;
  v_rorder := case v_rarity
                when 'legendary' then array['legendary', 'epic', 'rare', 'common']
                when 'epic' then array['epic', 'rare', 'common', 'legendary']
                when 'rare' then array['rare', 'common', 'epic', 'legendary']
                else array['common', 'rare', 'epic', 'legendary'] end;

  if p_kind = 'special' or random() < 0.05 then
    r := random();
    v_effect := case when r < 0.80 then 'holo' when r < 0.95 then 'negative' else 'ultra_red' end;
  end if;
  v_eorder := array[v_effect] || array(
    select e from unnest(case when p_kind = 'special' then array['holo', 'negative', 'ultra_red']
                              else array['none', 'holo', 'negative', 'ultra_red'] end) e
     where e <> v_effect);

  <<search>>
  for ei in 1..cardinality(v_eorder) loop
    for ri in 1..4 loop
      select pi.* into v_item
        from poster_items pi
       where pi.is_active and pi.rarity = v_rorder[ri]
         and not exists (select 1 from user_posters up
                          where up.user_id = v_uid and up.item_id = pi.id and up.effect = v_eorder[ei] and up.reset_at is null)
       order by random()
       limit 1;
      if found then
        v_effect := v_eorder[ei];
        v_found := true;
        exit search;
      end if;
    end loop;
  end loop;

  if not v_found then
    raise exception 'collection_complete';
  end if;

  if p_kind = 'normal' then
    update jackpot_wallets set tickets = tickets - 1, updated_at = now() where user_id = v_uid;
  elsif not v_weekly then
    update jackpot_wallets set special_tickets = special_tickets - 1, updated_at = now() where user_id = v_uid;
  end if;

  insert into user_posters as up (user_id, item_id, effect) values (v_uid, v_item.id, v_effect)
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, left_via = null, copies = 1, first_pulled_at = now(), last_pulled_at = now();
  insert into jackpot_pulls (user_id, kind, item_id, rarity, effect, duplicate, fragments_gained, from_bonus)
  values (v_uid, p_kind, v_item.id, v_item.rarity, v_effect, false, 0, p_kind = 'special' and not v_weekly);

  perform jackpot_void_stale_trades(array[v_uid]);

  select * into w from jackpot_wallets where user_id = v_uid;

  return jsonb_build_object(
    'item', poster_item_json(v_item),
    'effect', v_effect,
    'kind', p_kind,
    'tickets', w.tickets,
    'special_tickets', w.special_tickets,
    'special_weekly', coalesce(is_premium_active(v_uid), false) and not exists (
      select 1 from jackpot_pulls p
       where p.user_id = v_uid and p.kind = 'special' and not p.voided and not p.from_bonus
         and p.created_at >= b.starts_at and p.created_at < b.ends_at)
  );
end;
$$;
