-- Poster Jackpot: trocas de pôsteres entre amigos (31/10/2026).
--
-- Pedido do Bruno: no modal do jackpot, propor trocas com amigos; as
-- propostas (e as respostas) aparecem nos sussurros.
--
-- Uma troca é "o meu pôster X pelo seu pôster Y" (pôster = item + efeito).
-- Regras (as mesmas da roleta: ninguém fica com repetido):
--   • só entre amigos (are_friends), fora bots;
--   • quem propõe tem X e o amigo não tem X; o amigo tem Y e quem propõe
--     não tem Y;
--   • até 10 propostas abertas por pessoa; nada de proposta repetida;
--   • ao aceitar, tudo é conferido de novo; se algum dos dois já não tiver o
--     pôster (trocou com outra pessoa, zerou…), a proposta é anulada;
--   • a troca move as linhas de user_posters (quem sai fica com reset_at e
--     left_via = 'trade'; quem recebe ganha a linha), desliga os pôsteres
--     equipados que saíram e anula as outras propostas que deixaram de
--     valer.
-- Sussurros (friend_indications.trade_id): 'poster_trade' para quem recebe
-- a proposta e 'poster_trade_result' para quem propôs, quando o amigo aceita
-- ou recusa. Mais o 'jackpot_invite' do lançamento (20261031030000).

alter table public.user_posters add column if not exists left_via text;
alter table public.poster_jackpot_settings add column if not exists launched_at timestamptz;
alter table public.friend_indications add column if not exists trade_id bigint;

alter table public.friend_indications drop constraint if exists recommendations_type_check;
alter table public.friend_indications add constraint recommendations_type_check check (type = any (array[
  'movie', 'friend_request', 'new_episode', 'tag_unlocked', 'story_like', 'story_comment', 'story_reply', 'whisper_like',
  'jackpot_invite', 'poster_trade', 'poster_trade_result']));

create table if not exists public.poster_trades (
  id bigint generated always as identity primary key,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  offer_item integer not null references public.poster_items(id),
  offer_effect text not null,
  ask_item integer not null references public.poster_items(id),
  ask_effect text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'void')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists poster_trades_to on public.poster_trades (to_user, status, created_at desc);
create index if not exists poster_trades_from on public.poster_trades (from_user, status, created_at desc);
alter table public.poster_trades enable row level security;

-- Zerar marca o motivo da saída.
create or replace function public.jackpot_reset_user(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_posters integer;
begin
  update user_posters set reset_at = now(), left_via = 'reset' where user_id = p_uid and reset_at is null;
  get diagnostics v_posters = row_count;
  update jackpot_pulls set voided = true where user_id = p_uid and not voided;
  update user_poster_equips set active = false where user_id = p_uid and active;
  update poster_trades set status = 'void', responded_at = now() where status = 'pending' and (from_user = p_uid or to_user = p_uid);
  return jsonb_build_object('posters_reset', v_posters);
end;
$$;
revoke all on function public.jackpot_reset_user(uuid) from public, anon, authenticated;

create or replace function public.jackpot_owns(p_uid uuid, p_item integer, p_effect text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from user_posters where user_id = p_uid and item_id = p_item and effect = p_effect and reset_at is null);
$$;
revoke all on function public.jackpot_owns(uuid, integer, text) from public, anon, authenticated;

create or replace function public.poster_version_json(p_item integer, p_effect text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select poster_item_json(pi) || jsonb_build_object('effect', p_effect) from poster_items pi where pi.id = p_item;
$$;
revoke all on function public.poster_version_json(integer, text) from public, anon, authenticated;

-- Os amigos (sem bots), com quantos pôsteres cada um tem.
create or replace function public.get_trade_friends()
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
  return coalesce((
    select jsonb_agg(x order by (x->>'posters')::int desc, lower(x->>'username'))
      from (
        select jsonb_build_object(
                 'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
                 'posters', (select count(*) from user_posters up join poster_items pi on pi.id = up.item_id
                              where up.user_id = p.id and up.reset_at is null and pi.is_active)) x
          from friendships f
          join profiles p on p.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
         where f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid)
           and not exists (select 1 from bot_accounts b where b.user_id = p.id)
      ) s), '[]'::jsonb);
end;
$$;
revoke all on function public.get_trade_friends() from public, anon;
grant execute on function public.get_trade_friends() to authenticated;

-- A mesa da troca com um amigo: os meus pôsteres (marcando os que ele já
-- tem) e os dele (marcando os que eu já tenho).
create or replace function public.get_trade_board(p_friend uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
  return jsonb_build_object(
    'mine', coalesce((
      select jsonb_agg(poster_item_json(pi) || jsonb_build_object('effect', up.effect, 'other_has', jackpot_owns(p_friend, up.item_id, up.effect))
                       order by array_position(order_r, pi.rarity), array_position(order_e, up.effect), pi.id)
        from user_posters up join poster_items pi on pi.id = up.item_id
       where up.user_id = v_uid and up.reset_at is null and pi.is_active), '[]'::jsonb),
    'theirs', coalesce((
      select jsonb_agg(poster_item_json(pi) || jsonb_build_object('effect', up.effect, 'other_has', jackpot_owns(v_uid, up.item_id, up.effect))
                       order by array_position(order_r, pi.rarity), array_position(order_e, up.effect), pi.id)
        from user_posters up join poster_items pi on pi.id = up.item_id
       where up.user_id = p_friend and up.reset_at is null and pi.is_active), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_trade_board(uuid) from public, anon;
grant execute on function public.get_trade_board(uuid) to authenticated;

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

-- Anula as propostas abertas que deixaram de valer (alguém já não tem o
-- pôster, ou já tem o que receberia).
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
     and not (jackpot_owns(t.from_user, t.offer_item, t.offer_effect)
              and not jackpot_owns(t.to_user, t.offer_item, t.offer_effect)
              and jackpot_owns(t.to_user, t.ask_item, t.ask_effect)
              and not jackpot_owns(t.from_user, t.ask_item, t.ask_effect));
$$;
revoke all on function public.jackpot_void_stale_trades(uuid[]) from public, anon, authenticated;

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

  -- Trava as linhas dos dois e confere tudo de novo.
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

create or replace function public.cancel_poster_trade(p_trade bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  update poster_trades set status = 'cancelled', responded_at = now()
   where id = p_trade and from_user = v_uid and status = 'pending'
  returning status into v_status;
  return jsonb_build_object('status', coalesce(v_status, (select status from poster_trades where id = p_trade and (from_user = v_uid or to_user = v_uid))));
end;
$$;
revoke all on function public.cancel_poster_trade(bigint) from public, anon;
grant execute on function public.cancel_poster_trade(bigint) to authenticated;

-- As trocas da pessoa: sem ids, as abertas e as dos últimos 30 dias; com
-- ids (os sussurros), só essas. Cada uma com o amigo e os dois pôsteres
-- ("offer" é o que quem propôs dá; "ask" o que pede).
create or replace function public.get_my_poster_trades(p_ids bigint[] default null)
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'status', t.status,
             'incoming', t.to_user = v_uid,
             'created_at', t.created_at,
             'responded_at', t.responded_at,
             'friend', jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url),
             'offer', poster_version_json(t.offer_item, t.offer_effect),
             'ask', poster_version_json(t.ask_item, t.ask_effect))
           order by (t.status = 'pending') desc, t.created_at desc)
      from (
        select * from poster_trades
         where (from_user = v_uid or to_user = v_uid)
           and (case when p_ids is null then status = 'pending' or created_at > now() - interval '30 days'
                     else id = any (p_ids) end)
         order by created_at desc
         limit 60
      ) t
      join profiles p on p.id = case when t.from_user = v_uid then t.to_user else t.from_user end), '[]'::jsonb);
end;
$$;
revoke all on function public.get_my_poster_trades(bigint[]) from public, anon;
grant execute on function public.get_my_poster_trades(bigint[]) to authenticated;
