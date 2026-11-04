-- 04/11/2026 — Mercado Negro da Cobra: o contrato entra na mesma fila dos giros.
-- Antes ele só se travava contra outro contrato da mesma pessoa; um giro feito
-- no mesmo instante podia sortear o mesmo pôster novo (a pessoa receberia um só).
-- Agora jackpot_contract trava a linha da carteira (jackpot_wallets), como o
-- jackpot_pull já faz, e os dois esperam um pelo outro. O resto da função não muda
-- (20261104090000_jackpot_contracts.sql).

-- Fecha o contrato. p_items = [{ "item_id": 12, "effect": "holo" }, …] (size itens).
-- Erros: not_authenticated, closed, bad_rarity, bad_size, bad_item, duplicate,
-- not_owned, wrong_rarity, exclusive, prize, staked, target_complete.
create or replace function public.jackpot_contract(p_rarity text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s poster_jackpot_settings;
  v_out text;
  v_inputs jsonb := '[]'::jsonb;
  v_n int;
  v_fx int := 0;
  v_counts jsonb := '{}'::jsonb;
  v_chance int;
  v_rolled boolean;
  v_pick text;
  v_order text[] := '{}';
  v_eff text;
  v_item int;
  v_pull bigint;
  v_contract bigint;
  r record;
  x jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not jackpot_contract_allowed(v_uid) then
    raise exception 'closed';
  end if;
  select * into s from poster_jackpot_settings where id;
  v_out := case p_rarity when 'common' then 'rare' when 'rare' then 'epic' when 'epic' then 'legendary' end;
  if v_out is null then
    raise exception 'bad_rarity';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' or jsonb_array_length(p_items) <> s.contract_size then
    raise exception 'bad_size';
  end if;

  -- Um contrato por vez para a pessoa (dois toques, dois aparelhos), e na fila
  -- com os giros: a mesma trava da carteira que o jackpot_pull usa. Sem ela, um
  -- giro e um contrato ao mesmo tempo poderiam sortear o mesmo pôster novo.
  perform pg_advisory_xact_lock(hashtext('jackpot_contract:' || v_uid::text));
  perform jackpot_wallet_row(v_uid);
  perform 1 from jackpot_wallets where user_id = v_uid for update;

  -- Normaliza a lista (item inteiro, efeito conhecido) e recusa versão repetida.
  for x in select value from jsonb_array_elements(p_items) loop
    if coalesce(jsonb_typeof(x), '') <> 'object' or coalesce(jsonb_typeof(x -> 'item_id'), '') <> 'number'
       or coalesce(x ->> 'effect', '') not in ('none', 'holo', 'negative', 'ultra_red') then
      raise exception 'bad_item';
    end if;
    v_inputs := v_inputs || jsonb_build_array(jsonb_build_object('item_id', (x ->> 'item_id')::int, 'effect', x ->> 'effect'));
  end loop;
  select count(distinct (e ->> 'item_id') || ':' || (e ->> 'effect')) into v_n from jsonb_array_elements(v_inputs) e;
  if v_n <> s.contract_size then
    raise exception 'duplicate';
  end if;

  -- Trava as linhas dos 6 (uma troca aceita ao mesmo tempo espera este contrato
  -- terminar, e vice-versa) e só depois confere cada um.
  perform 1
     from user_posters up
     join jsonb_array_elements(v_inputs) e on up.item_id = (e ->> 'item_id')::int and up.effect = e ->> 'effect'
    where up.user_id = v_uid
      for update of up;
  for r in
    select (e ->> 'item_id')::int as item_id, e ->> 'effect' as effect, up.reset_at, up.tradeable,
           up.user_id is not null as found, pi.rarity, pi.exclusive
      from jsonb_array_elements(v_inputs) e
      left join user_posters up on up.user_id = v_uid and up.item_id = (e ->> 'item_id')::int and up.effect = e ->> 'effect'
      left join poster_items pi on pi.id = (e ->> 'item_id')::int
  loop
    if not r.found or r.reset_at is not null then
      raise exception 'not_owned';
    end if;
    if r.exclusive is not null then
      raise exception 'exclusive';
    end if;
    if r.rarity is distinct from p_rarity then
      raise exception 'wrong_rarity';
    end if;
    if not coalesce(r.tradeable, false) then
      raise exception 'prize';
    end if;
    if poker_poster_staked(v_uid, r.item_id, r.effect) then
      raise exception 'staked';
    end if;
    if r.effect <> 'none' then
      v_fx := v_fx + 1;
      v_counts := jsonb_set(v_counts, array[r.effect], to_jsonb(coalesce((v_counts ->> r.effect)::int, 0) + 1));
    end if;
  end loop;

  -- A chance de efeito e qual efeito.
  v_chance := least(s.contract_effect_cap, greatest(s.contract_effect_floor, v_fx * s.contract_effect_step));
  v_rolled := random() * 100 < v_chance;
  if v_rolled then
    if v_fx > 0 then
      -- Na proporção do que foi entregue.
      select k into v_pick
        from (select key as k, sum(value::int) over (order by key) as acc
                from jsonb_each_text(v_counts)) c,
             (select random() * v_fx as roll) rr
       where c.acc > rr.roll
       order by c.acc
       limit 1;
    else
      -- Sem efeito entregue (o piso): a mesma conta do giro, 80 / 15 / 5.
      v_pick := case when random() < 0.80 then 'holo' when random() < 0.75 then 'negative' else 'ultra_red' end;
    end if;
    v_order := array[v_pick];
    -- Depois, os outros efeitos entregues (do mais entregue ao menos), os demais e o sem efeito.
    v_order := v_order || array(select key from jsonb_each_text(v_counts) where key <> v_pick
                                 order by value::int desc, array_position(array['holo', 'negative', 'ultra_red'], key));
    v_order := v_order || array(select e from unnest(array['holo', 'negative', 'ultra_red']) e where e <> all (v_order));
    v_order := v_order || array['none'];
  else
    v_order := array['none', 'holo', 'negative', 'ultra_red'];
  end if;

  -- Nunca repetido: o primeiro efeito da ordem que ainda tem pôster para a pessoa.
  foreach v_eff in array v_order loop
    select pi.id into v_item
      from poster_items pi
     where pi.rarity = v_out and pi.is_active and pi.exclusive is null
       and not jackpot_owns(v_uid, pi.id, v_eff)
     order by random()
     limit 1;
    exit when v_item is not null;
  end loop;
  if v_item is null then
    raise exception 'target_complete';
  end if;

  -- Os 6 saem da coleção e da biblioteca (desequipados).
  update user_posters up
     set reset_at = now(), left_via = 'contract'
    from jsonb_array_elements(v_inputs) e
   where up.user_id = v_uid and up.item_id = (e ->> 'item_id')::int and up.effect = e ->> 'effect' and up.reset_at is null;
  update user_poster_equips q
     set active = false
    from jsonb_array_elements(v_inputs) e
   where q.user_id = v_uid and q.item_id = (e ->> 'item_id')::int and q.effect = e ->> 'effect' and q.active;

  -- O pôster novo (uma linha antiga, de um reset ou de uma troca, volta à vida).
  insert into user_posters (user_id, item_id, effect)
  values (v_uid, v_item, v_eff)
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, left_via = null, copies = 1, first_pulled_at = now(), last_pulled_at = now()
   where user_posters.reset_at is not null;

  insert into jackpot_pulls (user_id, kind, item_id, rarity, effect, duplicate, fragments_gained, from_bonus)
  values (v_uid, 'contract', v_item, v_out, v_eff, false, 0, false)
  returning id into v_pull;

  insert into jackpot_contracts (user_id, pull_id, rarity_in, rarity_out, inputs, item_id, effect, effect_chance, effect_rolled)
  values (v_uid, v_pull, p_rarity, v_out, v_inputs, v_item, v_eff, v_chance, v_rolled)
  returning id into v_contract;

  -- Propostas de troca com os pôsteres que saíram (ou com o que entrou) deixam de valer.
  perform jackpot_void_stale_trades(array[v_uid]);

  -- Tags do contrato (um erro aqui nunca desfaz o contrato).
  begin
    perform award_jackpot_game_tags(v_uid, array['contracts', 'contract_legendaries']);
  exception when others then
    raise warning 'game tags (jackpot_contract): %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'contract_id', v_contract,
    'pull_id', v_pull,
    'poster', poster_version_json(v_item, v_eff),
    'effect_chance', v_chance,
    'effect_rolled', v_rolled,
    'given', v_inputs,
    'left', jackpot_contract_left(v_uid, v_out));
end;
$$;
revoke all on function public.jackpot_contract(text, jsonb) from public, anon;
grant execute on function public.jackpot_contract(text, jsonb) to authenticated;
