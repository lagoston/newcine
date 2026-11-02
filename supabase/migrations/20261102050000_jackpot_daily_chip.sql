-- 02/11/2026 — A ficha do dia do Poster Jackpot (pedido do Bruno).
--
-- Todo dia (dia de Brasília) cada pessoa pode pegar 1 ficha comum de graça.
-- Na home, um balão sai da porta do Jackpot ("Ficha grátis!"); tocar nele
-- pega a ficha e abre a gaveta na aba Missões, com a recompensa no topo e,
-- logo embaixo, as missões que dão mais fichas.
--   • jackpot_daily_chips: um registro por pessoa por dia (chave dupla) — a
--     mesma ficha não sai duas vezes, nem com dois aparelhos ao mesmo tempo.
--   • jackpot_claim_daily(): pega a ficha de hoje (+1 em jackpot_wallets.tickets).
--   • get_jackpot_state ganha daily_chip (a ficha de hoje ainda está lá).
-- Bots não pegam. O APK antigo não tem o balão (a ficha do dia chega com o
-- próximo build).

create table if not exists public.jackpot_daily_chips (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Só as funções leem e escrevem (sem políticas).
alter table public.jackpot_daily_chips enable row level security;
revoke all on table public.jackpot_daily_chips from anon, authenticated;

create or replace function public.jackpot_claim_daily()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_new boolean;
  w jackpot_wallets;
begin
  if v_uid is null or not jackpot_enabled(v_uid)
     or exists (select 1 from bot_accounts b where b.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  insert into jackpot_daily_chips (user_id, day) values (v_uid, v_day)
  on conflict do nothing
  returning true into v_new;

  w := jackpot_wallet_row(v_uid);
  if v_new is null then
    return jsonb_build_object('ok', false, 'reason', 'already', 'tickets', w.tickets);
  end if;

  update jackpot_wallets set tickets = tickets + 1, updated_at = now()
   where user_id = v_uid
  returning * into w;

  return jsonb_build_object('ok', true, 'tickets', w.tickets);
end;
$$;

revoke all on function public.jackpot_claim_daily() from public, anon;
grant execute on function public.jackpot_claim_daily() to authenticated;

-- O estado do Jackpot ganha daily_chip. O resto é igual ao de
-- 20261102020000_trades_expiry_friday13.
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
       where t.user_id = v_uid and (t.tag_id = 'scary-clown' or t.tag_id ~ '^scary-clown-[0-9]+$')),
    -- A ficha do dia ainda não foi pega hoje (02/11/2026). Bots nunca.
    'daily_chip', not exists (select 1 from jackpot_daily_chips d where d.user_id = v_uid and d.day = v_today)
                  and not exists (select 1 from bot_accounts ba where ba.user_id = v_uid)
  );
end;
$$;
