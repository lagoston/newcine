-- 16/11/2026 (pedido do Bruno): trocas de pôsteres com até 3 pôsteres de cada
-- lado (3 por 1, 3 por 2, 3 por 3...), e cada pôster oferecido só pode estar em
-- UMA proposta pendente por vez.
--
-- Por que a reserva: antes, dava para oferecer o mesmo pôster ao amigo A e ao
-- amigo B. O banco já impedia a duplicação (a resposta trava as linhas do
-- pôster, confere de novo quem tem o quê e anula o que ficou velho), mas o
-- segundo amigo aceitava e recebia "anulada" sem entender por quê. Agora a
-- segunda proposta com o mesmo pôster nem sai: erro 'offer_pending'. Uma trava
-- por pessoa (advisory lock) impede que dois toques simultâneos passem juntos.
--
-- Como os slots são guardados: o 1º pôster de cada lado continua nas colunas
-- de sempre (offer_item/offer_effect, ask_item/ask_effect), e o 2º e o 3º vão
-- para poster_trade_extras. Assim o app antigo (APK) continua lendo as trocas
-- de 1 por 1 como sempre. Para não deixar alguém no app antigo aceitar uma
-- troca de vários pôsteres vendo só o primeiro, respond_poster_trade passa a
-- recusar aceitar essas (erro 'update_app'; recusar continua valendo). O site
-- usa respond_poster_trade_v2, que move todos os pôsteres de uma vez.
--
-- O limite de 3 trocas por dia conta trocas, não pôsteres: um 3 por 3 é uma troca.

create table if not exists public.poster_trade_extras (
  trade_id bigint not null references public.poster_trades (id) on delete cascade,
  side text not null check (side in ('offer', 'ask')),
  slot smallint not null check (slot between 2 and 3),
  item_id integer not null references public.poster_items (id),
  effect text not null check (effect in ('none', 'holo', 'negative', 'ultra_red')),
  primary key (trade_id, side, slot)
);
create index if not exists poster_trade_extras_item on public.poster_trade_extras (item_id, effect);
alter table public.poster_trade_extras enable row level security;
-- Só as funções do banco leem e escrevem aqui (sem políticas = ninguém de fora).
revoke all on table public.poster_trade_extras from public, anon, authenticated;

-- Todas as linhas de uma troca: quem dá (giver), quem recebe (taker) e o pôster.
create or replace function public.jackpot_trade_lines(p_trade bigint)
returns table (side text, slot smallint, giver uuid, taker uuid, item_id integer, effect text)
language sql
stable security definer
set search_path = public
as $$
  select 'offer'::text, 1::smallint, t.from_user, t.to_user, t.offer_item, t.offer_effect
    from poster_trades t where t.id = p_trade
  union all
  select 'ask'::text, 1::smallint, t.to_user, t.from_user, t.ask_item, t.ask_effect
    from poster_trades t where t.id = p_trade
  union all
  select x.side, x.slot,
         case x.side when 'offer' then t.from_user else t.to_user end,
         case x.side when 'offer' then t.to_user else t.from_user end,
         x.item_id, x.effect
    from poster_trade_extras x join poster_trades t on t.id = x.trade_id
   where x.trade_id = p_trade;
$$;
revoke all on function public.jackpot_trade_lines(bigint) from public, anon, authenticated;

-- A troca ainda vale: cada pôster continua com quem dá e quem recebe ainda não tem.
create or replace function public.jackpot_trade_valid(p_trade bigint)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select not exists (
    select 1 from jackpot_trade_lines(p_trade) l
     where not jackpot_owns(l.giver, l.item_id, l.effect)
        or jackpot_owns(l.taker, l.item_id, l.effect));
$$;
revoke all on function public.jackpot_trade_valid(bigint) from public, anon, authenticated;

-- As mesmas regras do poker_trade_guard, para qualquer slot: gold, exclusivo,
-- ganho na mesa (tradeable = false) ou apostado numa partida aberta não trocam.
create or replace function public.jackpot_trade_line_blocked(p_uid uuid, p_item integer, p_effect text)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select p_effect = 'gold'
      or exists (select 1 from poster_items pi where pi.id = p_item and pi.exclusive is not null)
      or exists (select 1 from user_posters up
                  where up.user_id = p_uid and up.item_id = p_item and up.effect = p_effect
                    and not up.tradeable)
      or poker_poster_staked(p_uid, p_item, p_effect);
$$;
revoke all on function public.jackpot_trade_line_blocked(uuid, integer, text) from public, anon, authenticated;

-- Trocas pendentes em que esta pessoa entrega este pôster (em qualquer slot).
create or replace function public.jackpot_pending_trades_with(p_uid uuid, p_item integer, p_effect text)
returns setof bigint
language sql
stable security definer
set search_path = public
as $$
  select t.id from poster_trades t
   where t.status = 'pending'
     and ((t.from_user = p_uid and t.offer_item = p_item and t.offer_effect = p_effect)
       or (t.to_user = p_uid and t.ask_item = p_item and t.ask_effect = p_effect))
  union
  select t.id from poster_trade_extras x join poster_trades t on t.id = x.trade_id
   where t.status = 'pending' and x.item_id = p_item and x.effect = p_effect
     and ((x.side = 'offer' and t.from_user = p_uid) or (x.side = 'ask' and t.to_user = p_uid));
$$;
revoke all on function public.jackpot_pending_trades_with(uuid, integer, text) from public, anon, authenticated;

create or replace function public.jackpot_poster_in_trade(p_uid uuid, p_item integer, p_effect text)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (select 1 from jackpot_pending_trades_with(p_uid, p_item, p_effect));
$$;
revoke all on function public.jackpot_poster_in_trade(uuid, integer, text) from public, anon, authenticated;

-- A reserva: este pôster já está oferecido numa proposta pendente desta pessoa.
create or replace function public.jackpot_offer_reserved(p_uid uuid, p_item integer, p_effect text)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (select 1 from poster_trades t
                  where t.status = 'pending' and t.from_user = p_uid
                    and t.offer_item = p_item and t.offer_effect = p_effect)
      or exists (select 1 from poster_trade_extras x join poster_trades t on t.id = x.trade_id
                  where t.status = 'pending' and t.from_user = p_uid and x.side = 'offer'
                    and x.item_id = p_item and x.effect = p_effect);
$$;
revoke all on function public.jackpot_offer_reserved(uuid, integer, text) from public, anon, authenticated;

-- Quando um pôster sai da coleção por outro caminho (pôquer), anula as trocas
-- pendentes que o entregariam, em qualquer slot.
create or replace function public.jackpot_void_trades_with(p_uid uuid, p_item integer, p_effect text)
returns void
language sql
security definer
set search_path = public
as $$
  update poster_trades set status = 'void', responded_at = now()
   where status = 'pending' and id in (select jackpot_pending_trades_with(p_uid, p_item, p_effect));
$$;
revoke all on function public.jackpot_void_trades_with(uuid, integer, text) from public, anon, authenticated;

-- Anula as trocas pendentes que ficaram velhas, agora olhando todos os slots.
create or replace function public.jackpot_void_stale_trades(p_users uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update poster_trades t
     set status = 'void', responded_at = now()
   where t.status = 'pending'
     and (t.from_user = any (p_users) or t.to_user = any (p_users))
     and not jackpot_trade_valid(t.id);
$$;
revoke all on function public.jackpot_void_stale_trades(uuid[]) from public, anon, authenticated;

-- A proposta de 1 por 1 (a do app antigo), agora com a trava e a reserva.
create or replace function public.propose_poster_trade(p_friend uuid, p_offer_item integer, p_offer_effect text, p_ask_item integer, p_ask_effect text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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
  -- 16/11/2026: uma proposta por vez por pessoa (dois toques juntos não passam juntos).
  perform pg_advisory_xact_lock(hashtext('poster_trade_offer:' || v_uid::text));
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
  -- 16/11/2026: o pôster oferecido só pode estar numa proposta pendente por vez.
  if jackpot_offer_reserved(v_uid, p_offer_item, p_offer_effect) then
    raise exception 'offer_pending';
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
$function$;
revoke all on function public.propose_poster_trade(uuid, integer, text, integer, text) from public, anon;
grant execute on function public.propose_poster_trade(uuid, integer, text, integer, text) to authenticated;

-- A proposta com 1 a 3 pôsteres de cada lado. p_offer e p_ask são listas de
-- {"item_id": 12, "effect": "holo"}, na ordem dos slots.
create or replace function public.propose_poster_trade_multi(p_friend uuid, p_offer jsonb, p_ask jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_offer_items integer[];
  v_offer_effects text[];
  v_ask_items integer[];
  v_ask_effects text[];
  i integer;
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
  if jsonb_typeof(p_offer) is distinct from 'array' or jsonb_typeof(p_ask) is distinct from 'array'
     or jsonb_array_length(p_offer) not between 1 and 3 or jsonb_array_length(p_ask) not between 1 and 3 then
    raise exception 'bad_slots';
  end if;

  select array_agg(case when jsonb_typeof(e -> 'item_id') = 'number' then (e ->> 'item_id')::integer end order by o),
         array_agg(e ->> 'effect' order by o)
    into v_offer_items, v_offer_effects
    from jsonb_array_elements(p_offer) with ordinality as x (e, o);
  select array_agg(case when jsonb_typeof(e -> 'item_id') = 'number' then (e ->> 'item_id')::integer end order by o),
         array_agg(e ->> 'effect' order by o)
    into v_ask_items, v_ask_effects
    from jsonb_array_elements(p_ask) with ordinality as x (e, o);

  if array_position(v_offer_items, null) is not null or array_position(v_ask_items, null) is not null
     or exists (select 1 from unnest(v_offer_effects || v_ask_effects) ef
                 where ef is null or ef not in ('none', 'holo', 'negative', 'ultra_red', 'gold')) then
    raise exception 'bad_slots';
  end if;
  -- O mesmo pôster duas vezes do mesmo lado não vale.
  if (select count(distinct (it, ef)) from unnest(v_offer_items, v_offer_effects) as u (it, ef)) <> cardinality(v_offer_items)
     or (select count(distinct (it, ef)) from unnest(v_ask_items, v_ask_effects) as u (it, ef)) <> cardinality(v_ask_items) then
    raise exception 'bad_slots';
  end if;

  perform pg_advisory_xact_lock(hashtext('poster_trade_offer:' || v_uid::text));
  if jackpot_proposals_today(v_uid) >= 3 then
    raise exception 'daily_proposals';
  end if;
  if jackpot_trades_today(v_uid) >= 3 then
    raise exception 'daily_trades';
  end if;

  for i in 1 .. cardinality(v_offer_items) loop
    if not jackpot_owns(v_uid, v_offer_items[i], v_offer_effects[i]) then
      raise exception 'not_owned';
    end if;
    if jackpot_owns(p_friend, v_offer_items[i], v_offer_effects[i]) then
      raise exception 'they_have';
    end if;
    if jackpot_trade_line_blocked(v_uid, v_offer_items[i], v_offer_effects[i]) then
      raise exception 'untradeable';
    end if;
  end loop;
  for i in 1 .. cardinality(v_ask_items) loop
    if not jackpot_owns(p_friend, v_ask_items[i], v_ask_effects[i]) then
      raise exception 'not_theirs';
    end if;
    if jackpot_owns(v_uid, v_ask_items[i], v_ask_effects[i]) then
      raise exception 'you_have';
    end if;
    if jackpot_trade_line_blocked(p_friend, v_ask_items[i], v_ask_effects[i]) then
      raise exception 'untradeable';
    end if;
  end loop;
  for i in 1 .. cardinality(v_offer_items) loop
    if jackpot_offer_reserved(v_uid, v_offer_items[i], v_offer_effects[i]) then
      raise exception 'offer_pending';
    end if;
  end loop;
  if (select count(*) from poster_trades where status = 'pending' and from_user = v_uid) >= 10 then
    raise exception 'too_many';
  end if;

  insert into poster_trades (from_user, to_user, offer_item, offer_effect, ask_item, ask_effect)
  values (v_uid, p_friend, v_offer_items[1], v_offer_effects[1], v_ask_items[1], v_ask_effects[1])
  returning id into v_id;

  for i in 2 .. cardinality(v_offer_items) loop
    insert into poster_trade_extras (trade_id, side, slot, item_id, effect)
    values (v_id, 'offer', i, v_offer_items[i], v_offer_effects[i]);
  end loop;
  for i in 2 .. cardinality(v_ask_items) loop
    insert into poster_trade_extras (trade_id, side, slot, item_id, effect)
    values (v_id, 'ask', i, v_ask_items[i], v_ask_effects[i]);
  end loop;

  insert into friend_indications (from_user_id, to_user_id, type, media_type, trade_id, read)
  values (v_uid, p_friend, 'poster_trade', null, v_id, false);

  return jsonb_build_object('id', v_id);
end;
$function$;
revoke all on function public.propose_poster_trade_multi(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.propose_poster_trade_multi(uuid, jsonb, jsonb) to authenticated;

-- A resposta do app antigo: igual a antes, mas não aceita troca de vários pôsteres
-- (o app antigo só mostraria o primeiro de cada lado). Recusar continua valendo.
create or replace function public.respond_poster_trade(p_trade bigint, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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
  -- 16/11/2026: troca com mais de um pôster de algum lado só pelo app novo.
  if p_accept and exists (select 1 from poster_trade_extras where trade_id = t.id) then
    raise exception 'update_app';
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
$function$;
revoke all on function public.respond_poster_trade(bigint, boolean) from public, anon;
grant execute on function public.respond_poster_trade(bigint, boolean) to authenticated;

-- A resposta do site: move todos os pôsteres da troca de uma vez, ou nenhum.
create or replace function public.respond_poster_trade_v2(p_trade bigint, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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

  -- Trava os pôsteres de quem entrega, sempre na mesma ordem (evita impasse
  -- entre duas trocas aceitas ao mesmo tempo), e só então confere tudo de novo.
  perform 1 from user_posters up
    join jackpot_trade_lines(t.id) l on up.user_id = l.giver and up.item_id = l.item_id and up.effect = l.effect
   order by up.user_id, up.item_id, up.effect
     for update of up;
  if not jackpot_trade_valid(t.id) then
    update poster_trades set status = 'void', responded_at = now() where id = t.id;
    return jsonb_build_object('status', 'void');
  end if;
  if exists (select 1 from jackpot_trade_lines(t.id) l where jackpot_trade_line_blocked(l.giver, l.item_id, l.effect)) then
    raise exception 'untradeable';
  end if;

  update user_posters up set reset_at = now(), left_via = 'trade'
    from jackpot_trade_lines(t.id) l
   where up.user_id = l.giver and up.item_id = l.item_id and up.effect = l.effect;

  insert into user_posters (user_id, item_id, effect)
  select l.taker, l.item_id, l.effect from jackpot_trade_lines(t.id) l
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, left_via = null, copies = 1, first_pulled_at = now(), last_pulled_at = now();

  update user_poster_equips e set active = false
    from jackpot_trade_lines(t.id) l
   where e.active and e.user_id = l.giver and e.item_id = l.item_id and e.effect = l.effect;

  update poster_trades set status = 'accepted', responded_at = now() where id = t.id;
  perform jackpot_void_stale_trades(array[t.from_user, t.to_user]);

  insert into friend_indications (from_user_id, to_user_id, type, media_type, trade_id, read)
  values (v_uid, t.from_user, 'poster_trade_result', null, t.id, false);

  return jsonb_build_object('status', 'accepted');
end;
$function$;
revoke all on function public.respond_poster_trade_v2(bigint, boolean) from public, anon;
grant execute on function public.respond_poster_trade_v2(bigint, boolean) to authenticated;

-- As trocas da pessoa: 'offer' e 'ask' continuam sendo o 1º pôster de cada lado
-- (o app antigo lê só esses); 'offers' e 'asks' trazem todos, na ordem dos slots.
create or replace function public.get_my_poster_trades(p_ids bigint[] default null::bigint[])
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'status', t.status,
             'incoming', t.to_user = v_uid,
             'created_at', t.created_at,
             'responded_at', t.responded_at,
             'friend', jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url),
             'offer', poster_version_json(t.offer_item, t.offer_effect),
             'ask', poster_version_json(t.ask_item, t.ask_effect),
             'offers', (select jsonb_agg(poster_version_json(l.item_id, l.effect) order by l.slot)
                          from jackpot_trade_lines(t.id) l where l.side = 'offer'),
             'asks', (select jsonb_agg(poster_version_json(l.item_id, l.effect) order by l.slot)
                        from jackpot_trade_lines(t.id) l where l.side = 'ask'))
           order by (t.status = 'pending') desc, t.created_at desc)
      from (
        select * from poster_trades
         where (from_user = v_uid or to_user = v_uid)
           -- 30 dias desde o último movimento (02/11/2026)
           and coalesce(responded_at, created_at) > now() - interval '30 days'
           and (p_ids is null or id = any (p_ids))
         order by created_at desc
         limit 60
      ) t
      join profiles p on p.id = case when t.from_user = v_uid then t.to_user else t.from_user end), '[]'::jsonb);
end;
$function$;

-- O quadro de troca: os meus pôsteres agora dizem se já estão reservados numa
-- proposta pendente minha ('reserved'), para a tela mostrar e não deixar escolher.
create or replace function public.get_trade_board(p_friend uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $function$
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
      select jsonb_agg(poster_item_json(pi) || jsonb_build_object('effect', up.effect, 'other_has', jackpot_owns(p_friend, up.item_id, up.effect),
                                                                  'reserved', jackpot_offer_reserved(v_uid, up.item_id, up.effect))
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

-- Três funções em que um pôster sai da coleção (ou é marcado) olhando só o 1º
-- slot das trocas. Para não recriar funções longas de cabeça, cada bloco lê a
-- definição atual do banco, troca só o trecho das trocas (que precisa aparecer
-- exatamente uma vez) e confere o resultado. Se o trecho mudou, para com erro.
do $mig$
declare
  v_fn regprocedure;
  v_old text;
  v_new text;
  v_def text;
  v_before text;
  v_after text;
  v_patch record;
begin
  for v_patch in
    select * from (values
      ('public.poker_poster_take(uuid,integer,text)'::regprocedure,
       $old$  update poster_trades set status = 'void', responded_at = now()
   where status = 'pending'
     and ((from_user = p_uid and offer_item = p_item and offer_effect = p_effect)
       or (to_user = p_uid and ask_item = p_item and ask_effect = p_effect));$old$,
       $new$  update poster_trades set status = 'void', responded_at = now()
   where status = 'pending'
     and ((from_user = p_uid and offer_item = p_item and offer_effect = p_effect)
       or (to_user = p_uid and ask_item = p_item and ask_effect = p_effect));
  -- 16/11/2026: e as trocas em que o pôster está no 2º ou 3º slot.
  perform jackpot_void_trades_with(p_uid, p_item, p_effect);$new$),
      ('public.poker_tournament_settle(uuid)'::regprocedure,
       $old$      update poster_trades set status = 'void', responded_at = now()
       where status = 'pending'
         and ((from_user = m.user_id and offer_item = m.stake_item_id and offer_effect = m.stake_effect)
           or (to_user = m.user_id and ask_item = m.stake_item_id and ask_effect = m.stake_effect));$old$,
       $new$      update poster_trades set status = 'void', responded_at = now()
       where status = 'pending'
         and ((from_user = m.user_id and offer_item = m.stake_item_id and offer_effect = m.stake_effect)
           or (to_user = m.user_id and ask_item = m.stake_item_id and ask_effect = m.stake_effect));
      -- 16/11/2026: e as trocas em que o pôster está no 2º ou 3º slot.
      perform jackpot_void_trades_with(m.user_id, m.stake_item_id, m.stake_effect);$new$),
      ('public.get_jackpot_contract_board()'::regprocedure,
       $old$               'in_trade', exists (select 1 from poster_trades t
                                    where t.status = 'pending'
                                      and ((t.from_user = up.user_id and t.offer_item = up.item_id and t.offer_effect = up.effect)
                                        or (t.to_user = up.user_id and t.ask_item = up.item_id and t.ask_effect = up.effect))),$old$,
       $new$               -- 16/11/2026: em qualquer slot de uma troca pendente.
               'in_trade', jackpot_poster_in_trade(up.user_id, up.item_id, up.effect),$new$)
    ) as v (fn, old_text, new_text)
  loop
    v_fn := v_patch.fn;
    v_old := v_patch.old_text;
    v_new := v_patch.new_text;
    v_def := pg_get_functiondef(v_fn);
    select prosrc into v_before from pg_proc where oid = v_fn;
    if (length(v_before) - length(replace(v_before, v_old, ''))) <> length(v_old) then
      raise exception '%: o trecho das trocas não aparece exatamente uma vez', v_fn;
    end if;
    execute replace(v_def, v_old, v_new);
    select prosrc into v_after from pg_proc where oid = v_fn;
    if v_after is distinct from replace(v_before, v_old, v_new) then
      raise exception '%: o resultado não é a definição antiga com só o trecho trocado', v_fn;
    end if;
  end loop;
end
$mig$;
