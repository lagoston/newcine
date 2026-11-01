-- Poster Jackpot: fichas e o Giro da Sorte (01/11/2026).
--
-- Pedido do Bruno: os tickets do Jackpot passam a se chamar "fichas" (num
-- porta-fichas de cassino) e a máquina ganha uma barra contadora: a cada 10
-- giros, um Giro da Sorte grátis, com 50% de chance de pôster épico e 50% de
-- lendário. Os efeitos seguem a regra do giro padrão (5% de chance; com
-- efeito, holográfico 80 / negativo 15 / ultra vermelho 5).
--
-- No banco os nomes ficam como estavam (tickets, special_tickets): só a
-- palavra na tela muda.
--
-- Regras da barra:
--   • conta todo giro pago (ficha comum ou especial); o Giro da Sorte não
--     conta;
--   • no 10º giro a barra volta a zero e fica guardado 1 Giro da Sorte
--     (lucky_spins), que acumula e não vence;
--   • nunca sai repetido: sorteia épico ou lendário (meio a meio); se a
--     pessoa já tiver todas as versões possíveis da raridade sorteada, cai na
--     outra das duas, depois em raro e em comum. Com tudo completo, o giro é
--     recusado sem gastar o Giro da Sorte;
--   • a barra começa com os giros que cada um já deu (no máximo 9: ninguém
--     ganha um Giro da Sorte só com a migração).

alter table public.jackpot_wallets add column if not exists lucky_progress integer not null default 0;
alter table public.jackpot_wallets add column if not exists lucky_spins integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jackpot_wallets_lucky_progress_check') then
    alter table public.jackpot_wallets add constraint jackpot_wallets_lucky_progress_check check (lucky_progress between 0 and 9);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jackpot_wallets_lucky_spins_check') then
    alter table public.jackpot_wallets add constraint jackpot_wallets_lucky_spins_check check (lucky_spins >= 0);
  end if;
end $$;

-- O tipo de giro ganha 'lucky'.
alter table public.jackpot_pulls drop constraint if exists jackpot_pulls_kind_check;
alter table public.jackpot_pulls add constraint jackpot_pulls_kind_check check (kind in ('normal', 'special', 'lucky'));

-- A barra começa com os giros já dados (até 9).
update public.jackpot_wallets w
   set lucky_progress = least(9, s.n)
  from (select user_id, count(*)::int as n from public.jackpot_pulls where not voided group by user_id) s
 where s.user_id = w.user_id and w.lucky_progress = 0 and w.lucky_spins = 0;

-- ---------------------------------------------------------------------------
-- O giro
-- ---------------------------------------------------------------------------

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
  v_lucky_earned boolean := false;
begin
  if not jackpot_enabled(v_uid) then
    raise exception 'jackpot_closed';
  end if;
  if p_kind not in ('normal', 'special', 'lucky') then
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
  elsif p_kind = 'lucky' then
    if w.lucky_spins < 1 then
      raise exception 'no_lucky';
    end if;
  else
    if w.tickets < 1 then
      raise exception 'no_tickets';
    end if;
  end if;

  r := random();
  if p_kind = 'lucky' then
    -- Giro da Sorte: meio a meio entre épico e lendário.
    v_rarity := case when r < 0.5 then 'legendary' else 'epic' end;
    v_rorder := case v_rarity
                  when 'legendary' then array['legendary', 'epic', 'rare', 'common']
                  else array['epic', 'legendary', 'rare', 'common'] end;
  else
    v_rarity := case when r < 0.04 then 'legendary' when r < 0.17 then 'epic' when r < 0.45 then 'rare' else 'common' end;
    v_rorder := case v_rarity
                  when 'legendary' then array['legendary', 'epic', 'rare', 'common']
                  when 'epic' then array['epic', 'rare', 'common', 'legendary']
                  when 'rare' then array['rare', 'common', 'epic', 'legendary']
                  else array['common', 'rare', 'epic', 'legendary'] end;
  end if;

  -- Efeitos: a ficha especial sempre traz; a comum e o Giro da Sorte, 5%.
  if p_kind = 'special' or random() < 0.05 then
    r := random();
    v_effect := case when r < 0.80 then 'holo' when r < 0.95 then 'negative' else 'ultra_red' end;
  end if;
  v_eorder := array[v_effect] || array(
    select e from unnest(case when p_kind = 'special' then array['holo', 'negative', 'ultra_red']
                              else array['none', 'holo', 'negative', 'ultra_red'] end) e
     where e <> v_effect);

  -- Giro comum e especial (como antes): o efeito sorteado pesa mais; só
  -- troca de efeito quando nenhuma raridade serve. Giro da Sorte: a
  -- raridade é o prêmio, então ela pesa mais; troca o efeito antes de
  -- descer de raridade.
  if p_kind = 'lucky' then
    <<lucky_search>>
    for ri in 1..4 loop
      for ei in 1..cardinality(v_eorder) loop
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
          exit lucky_search;
        end if;
      end loop;
    end loop;
  else
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
  end if;

  if not v_found then
    raise exception 'collection_complete';
  end if;

  if p_kind = 'normal' then
    update jackpot_wallets set tickets = tickets - 1, updated_at = now() where user_id = v_uid;
  elsif p_kind = 'lucky' then
    update jackpot_wallets set lucky_spins = lucky_spins - 1, updated_at = now() where user_id = v_uid;
  elsif not v_weekly then
    update jackpot_wallets set special_tickets = special_tickets - 1, updated_at = now() where user_id = v_uid;
  end if;

  -- A barra: todo giro pago anda uma casa; na 10ª, guarda um Giro da Sorte.
  if p_kind <> 'lucky' then
    update jackpot_wallets
       set lucky_progress = case when lucky_progress + 1 >= 10 then 0 else lucky_progress + 1 end,
           lucky_spins = lucky_spins + case when lucky_progress + 1 >= 10 then 1 else 0 end
     where user_id = v_uid
    returning lucky_progress = 0 into v_lucky_earned;
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
         and p.created_at >= b.starts_at and p.created_at < b.ends_at),
    'lucky_progress', w.lucky_progress,
    'lucky_spins', w.lucky_spins,
    'lucky_goal', 10,
    'lucky_earned', coalesce(v_lucky_earned, false)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- O estado (a barra vai junto)
-- ---------------------------------------------------------------------------

create or replace function public.get_jackpot_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := jackpot_week_start();
  w jackpot_wallets;
  v_premium boolean;
  v_weekly boolean;
  v_missions jsonb;
  v_items integer;
  v_owned integer;
  v_owned_fx integer;
  b record;
begin
  if not jackpot_enabled(v_uid) then
    return jsonb_build_object('enabled', false);
  end if;
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
    'remaining_special', v_items * 3 - v_owned_fx
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Zerar a coleção (testes): a barra e os Giros da Sorte zeram junto
-- ---------------------------------------------------------------------------

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
  update jackpot_wallets set lucky_progress = 0, lucky_spins = 0, updated_at = now() where user_id = p_uid;
  return jsonb_build_object('posters_reset', v_posters);
end;
$$;
