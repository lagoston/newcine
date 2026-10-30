-- Poster Jackpot, segunda rodada (30/10/2026, pedido do Bruno):
--   - nunca sai um pôster repetido: o sorteio só escolhe versões (pôster +
--     efeito) que a pessoa ainda não tem. Sem repetidos, os fragmentos
--     deixam de existir (as colunas ficam, sem uso);
--   - a ordem do sorteio continua: primeiro a raridade (55/28/13/4) e o
--     efeito (5% no ticket comum, sempre no especial; 80/15/5). Se não
--     sobrar versão nova naquela raridade com aquele efeito, tenta as outras
--     raridades (da sorteada para as mais comuns) e depois os outros
--     efeitos. Se a pessoa já tem tudo, o ticket não é gasto
--     (collection_complete);
--   - get_jackpot_catalog(): os pôsteres ativos, para a fita da roleta (a
--     máquina virou uma roleta como a abertura de caixas do CS:GO);
--   - get_jackpot_state() diz quantas versões faltam (com e sem efeito).

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

  if p_kind = 'special' then
    if not coalesce(is_premium_active(v_uid), false) then
      raise exception 'not_premium';
    end if;
    if exists (select 1 from jackpot_pulls p where p.user_id = v_uid and p.kind = 'special' and p.created_at >= b.starts_at and p.created_at < b.ends_at) then
      raise exception 'special_used';
    end if;
  else
    select * into w from jackpot_wallets where user_id = v_uid;
    if w.tickets < 1 then
      raise exception 'no_tickets';
    end if;
  end if;

  -- Raridade: 55 / 28 / 13 / 4.
  r := random();
  v_rarity := case when r < 0.04 then 'legendary' when r < 0.17 then 'epic' when r < 0.45 then 'rare' else 'common' end;
  v_rorder := case v_rarity
                when 'legendary' then array['legendary', 'epic', 'rare', 'common']
                when 'epic' then array['epic', 'rare', 'common', 'legendary']
                when 'rare' then array['rare', 'common', 'epic', 'legendary']
                else array['common', 'rare', 'epic', 'legendary'] end;

  -- Efeito: no especial, sempre; no comum, 5%. Com efeito: 80 / 15 / 5.
  if p_kind = 'special' or random() < 0.05 then
    r := random();
    v_effect := case when r < 0.80 then 'holo' when r < 0.95 then 'negative' else 'ultra_red' end;
  end if;
  -- Os efeitos a tentar, na ordem: o sorteado, depois os outros (o especial
  -- nunca cai no "sem efeito").
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
         and not exists (select 1 from user_posters up where up.user_id = v_uid and up.item_id = pi.id and up.effect = v_eorder[ei])
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
  end if;

  insert into user_posters (user_id, item_id, effect) values (v_uid, v_item.id, v_effect);
  insert into jackpot_pulls (user_id, kind, item_id, rarity, effect, duplicate, fragments_gained)
  values (v_uid, p_kind, v_item.id, v_item.rarity, v_effect, false, 0);

  select * into w from jackpot_wallets where user_id = v_uid;

  return jsonb_build_object(
    'item', poster_item_json(v_item),
    'effect', v_effect,
    'kind', p_kind,
    'tickets', w.tickets
  );
end;
$$;

-- Os pôsteres ativos (para montar a fita da roleta).
create or replace function public.get_jackpot_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not jackpot_enabled(auth.uid()) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object('id', pi.id, 'rarity', pi.rarity, 'file_path', pi.file_path, 'media_type', pi.media_type, 'tmdb_id', pi.tmdb_id))
                from poster_items pi where pi.is_active), '[]'::jsonb)
  end;
$$;

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
  v_special boolean;
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
  v_special := v_premium and not exists (
    select 1 from jackpot_pulls p where p.user_id = v_uid and p.kind = 'special' and p.created_at >= b.starts_at and p.created_at < b.ends_at);

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', m.mission_key, 'kind', m.kind, 'param', m.param, 'target', m.target,
           'progress', least(m.target, jackpot_mission_progress(v_uid, v_week, m.kind, m.param)),
           'claimed', exists (select 1 from jackpot_mission_claims c where c.user_id = v_uid and c.week_start = v_week and c.mission_key = m.mission_key))), '[]'::jsonb)
    into v_missions
    from jackpot_week_missions(v_week) m;

  select count(*) into v_items from poster_items where is_active;
  select count(*), count(*) filter (where up.effect <> 'none') into v_owned, v_owned_fx
    from user_posters up join poster_items pi on pi.id = up.item_id
   where up.user_id = v_uid and pi.is_active;

  return jsonb_build_object(
    'enabled', true,
    'tickets', w.tickets,
    'fragments', 0,
    'premium', v_premium,
    'special_available', v_special,
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
    'owned', (select count(*) from user_posters where user_id = v_uid),
    -- versões novas que ainda podem sair: em qualquer ticket / no especial
    'remaining', v_items * 4 - v_owned,
    'remaining_special', v_items * 3 - v_owned_fx
  );
end;
$$;

revoke all on function public.get_jackpot_catalog() from public, anon;
grant execute on function public.get_jackpot_catalog() to authenticated;
