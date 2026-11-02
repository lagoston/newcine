-- 02/11/2026 — Duas coisas do Poster Jackpot, a pedido do Bruno:
--
-- 1. O histórico de trocas vale 30 dias, como os sussurros.
--    Os sussurros (friend_indications) somem 30 dias depois de criados: o
--    pg_cron roda delete_expired_indications() todo dia às 02:00 UTC. As
--    trocas passam a fazer o mesmo, para o banco não guardar para sempre um
--    histórico que ninguém mais olha:
--      • a lista (get_my_poster_trades) só mostra a troca até 30 dias depois
--        do último movimento dela — a resposta (aceita, recusada, cancelada,
--        anulada) ou, se ninguém respondeu, a proposta. Antes contava só a
--        data da proposta e as propostas abertas ficavam para sempre;
--      • delete_expired_poster_trades() apaga essas trocas vencidas, todo dia
--        às 02:15 UTC (logo depois da limpeza dos sussurros).
--    Nada mais depende de troca antiga: os limites do dia (3 trocas, 3
--    propostas) só contam as de hoje, e nenhuma tabela aponta para
--    poster_trades. O sussurro de uma troca que já sumiu mostra "Esta troca
--    não está mais disponível" (e ele mesmo some no mesmo prazo).
--
-- 2. A tag Scary Clown dá 3 fichas especiais em toda sexta-feira 13.
--    Quem tem a tag (qualquer edição: scary-clown, scary-clown-2…; o mesmo
--    critério de secret_room_has_tag) recebe 3 fichas especiais à 00:05 do
--    dia (horário de Brasília), pelo pg_cron. Se a tag chegar durante a
--    própria sexta-feira 13 (pode cair em outubro, no Halloween), o presente
--    sai na próxima vez que a pessoa abrir o Jackpot (get_jackpot_state).
--    Um presente por pessoa por dia (jackpot_gifts, chave user_id + kind +
--    day), mesmo com duas edições da tag. Bots não ganham. As fichas
--    especiais guardadas não vencem.
--    O site avisa uma vez ("gift" em get_jackpot_state; o aviso marca como
--    visto com jackpot_gift_seen()). O APK antigo só vê o saldo subir.
--    Próximas: 13/11/2026, 13/08/2027, 13/10/2028.

-- ---------------------------------------------------------------------------
-- 1. Trocas com validade
-- ---------------------------------------------------------------------------

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
           -- 30 dias desde o último movimento (02/11/2026)
           and coalesce(responded_at, created_at) > now() - interval '30 days'
           and (p_ids is null or id = any (p_ids))
         order by created_at desc
         limit 60
      ) t
      join profiles p on p.id = case when t.from_user = v_uid then t.to_user else t.from_user end), '[]'::jsonb);
end;
$$;

create or replace function public.delete_expired_poster_trades()
returns void
language sql
security definer
set search_path = public
as $$
  delete from poster_trades
   where coalesce(responded_at, created_at) < now() - interval '30 days';
$$;

revoke all on function public.delete_expired_poster_trades() from public, anon, authenticated;

select cron.schedule('delete-expired-poster-trades', '15 2 * * *', 'select public.delete_expired_poster_trades();');

-- ---------------------------------------------------------------------------
-- 2. O presente da Scary Clown na sexta-feira 13
-- ---------------------------------------------------------------------------

create table if not exists public.jackpot_gifts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('friday13')),
  day date not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  -- quando o site mostrou o aviso
  seen_at timestamptz,
  primary key (user_id, kind, day)
);

-- Só as funções leem e escrevem (sem políticas).
alter table public.jackpot_gifts enable row level security;

create or replace function public.jackpot_is_friday13(p_day date)
returns boolean
language sql
immutable
as $$
  select extract(isodow from p_day) = 5 and extract(day from p_day) = 13;
$$;

-- O trabalho de verdade, num dia dado (para dar para testar fora de uma
-- sexta-feira 13). p_uid null = todo mundo que tem a tag.
create or replace function public.jackpot_grant_friday13_on(p_day date, p_uid uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_day is null or not jackpot_is_friday13(p_day) then
    return 0;
  end if;

  with holders as (
    select distinct t.user_id
      from user_special_tags t
     where (t.tag_id = 'scary-clown' or t.tag_id ~ '^scary-clown-[0-9]+$')
       and (p_uid is null or t.user_id = p_uid)
       and not exists (select 1 from bot_accounts b where b.user_id = t.user_id)
       and jackpot_enabled(t.user_id)
  ), fresh as (
    insert into jackpot_gifts (user_id, kind, day, amount)
    select h.user_id, 'friday13', p_day, 3 from holders h
    on conflict do nothing
    returning user_id, amount
  ), credited as (
    insert into jackpot_wallets (user_id, special_tickets)
    select f.user_id, f.amount from fresh f
    on conflict (user_id) do update
      set special_tickets = jackpot_wallets.special_tickets + excluded.special_tickets,
          updated_at = now()
    returning user_id
  )
  select count(*) into v_count from credited;

  return v_count;
end;
$$;

-- Hoje (dia de Brasília). É o que o pg_cron chama, e o get_jackpot_state
-- chama para a própria pessoa (quem ganhou a tag no meio do dia).
create or replace function public.jackpot_grant_friday13(p_uid uuid default null)
returns integer
language sql
security definer
set search_path = public
as $$
  select jackpot_grant_friday13_on((now() at time zone 'America/Sao_Paulo')::date, p_uid);
$$;

revoke all on function public.jackpot_grant_friday13_on(date, uuid) from public, anon, authenticated;
revoke all on function public.jackpot_grant_friday13(uuid) from public, anon, authenticated;

-- Todo dia à 00:05 de Brasília (03:05 UTC); a função só age na sexta-feira 13.
-- (Não dá para pôr "dia 13 e sexta" na própria agenda: no cron, dia do mês e
-- dia da semana juntos valem como "ou".)
select cron.schedule('jackpot-friday13', '5 3 * * *', 'select public.jackpot_grant_friday13();');

-- O aviso foi mostrado.
create or replace function public.jackpot_gift_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update jackpot_gifts set seen_at = now()
   where user_id = auth.uid() and seen_at is null;
$$;

revoke all on function public.jackpot_gift_seen() from public, anon;
grant execute on function public.jackpot_gift_seen() to authenticated;

-- O estado do Jackpot ganha:
--   • o presente da sexta-feira 13 de quem ganhou a tag no meio do dia;
--   • gift: o presente ainda não avisado (dos últimos 7 dias), ou null;
--   • friday13_perk: a pessoa tem a Scary Clown (a gaveta lembra quando é a
--     próxima sexta-feira 13).
-- O resto é igual ao de 20261101000000_poster_jackpot_lucky_spin.
create or replace function public.get_jackpot_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
       where t.user_id = v_uid and (t.tag_id = 'scary-clown' or t.tag_id ~ '^scary-clown-[0-9]+$'))
  );
end;
$$;
