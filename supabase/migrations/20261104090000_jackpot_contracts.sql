-- 04/11/2026 — Pedido do Bruno: o Mercado Negro da Cobra no Poster Jackpot, um
-- "contrato" como o do CS:GO. A pessoa entrega 6 pôsteres da mesma raridade e
-- recebe 1 da raridade de cima (comum → raro → épico → lendário).
--
-- Números (o Bruno estimou e deixou regular; ficam em poster_jackpot_settings
-- para mudar sem migração):
--   contract_size = 6. Um contrato nunca rende mais que girar: com a barra da
--     sorte, cada giro com ficha dá em média 0,55 comum, 0,28 raro, 0,18 épico
--     e 0,09 lendário, então "o preço justo" seria ~2 comuns por raro, ~1,6 raro
--     por épico e ~2 épicos por lendário. Com 6, o contrato custa ~3× o justo nos
--     três degraus (o mesmo peso em todos) e, para quem fecha contrato com tudo o
--     que sobra, soma ~+30% na chance de tirar a raridade de cima. É um escoadouro
--     de pôsteres, não uma fábrica.
--   Efeito: cada pôster entregue com efeito (holográfico, negativo ou ultra
--     vermelho) soma contract_effect_step = 10 pontos, até contract_effect_cap =
--     60 (6 de 6). O piso é contract_effect_floor = 5, a mesma chance de um giro
--     com ficha comum: um contrato sem efeito não é pior que girar.
--   Qual efeito: sorteado entre os efeitos que a pessoa entregou, na proporção
--     (2 holográficos e 1 negativo → 2/3 holográfico, 1/3 negativo). "A Cobra
--     costura o que você deu a ela."
--
-- Regras:
--   - Os 6 têm que ser versões diferentes (pôster + efeito), da pessoa, da mesma
--     raridade, fora do Pôster Poker (exclusivos e gold não entram), trocáveis
--     (prêmios não entram) e sem aposta aberta no pôquer.
--   - Nunca repetido, como na roleta: o pôster que sai é um da raridade de cima
--     que a pessoa ainda não tem, sorteado por igual. Se o efeito sorteado já
--     estiver completo, tenta os outros efeitos entregues, depois os demais
--     (holográfico, negativo, ultra vermelho) e por fim o sem efeito; sem efeito
--     sorteado, tenta primeiro o sem efeito e depois os efeitos. Com a raridade
--     de cima toda completa, recusa ('target_complete') sem tirar nada.
--   - Os 6 saem da coleção (reset_at, left_via = 'contract'), são desequipados e
--     as propostas de troca que deixaram de valer são anuladas. Eles podem voltar
--     a sair na roleta (a pessoa não os tem mais).
--   - O resultado entra em jackpot_pulls com kind = 'contract'. Isso faz o
--     lendário de contrato virar story (gatilho feed_jackpot_story) e contar para
--     a tag Jackpot (1º lendário), sem contar como giro (Gambler, High Roller e a
--     especial semanal só olham 'normal' e 'special'). A barra da sorte não anda.
--   - Nada aqui toca em jackpot_pull nem em jackpot_scheduled_pulls: os giros
--     programados valem só para a roleta.
--
-- Tags novas (categoria Jogos, Poster Jackpot): 🕶️ Black Market (1º contrato) e
-- ⚗️ Alchemist (um lendário saído de contrato).

-- ---------------------------------------------------------------------------
-- Configuração
-- ---------------------------------------------------------------------------

alter table public.poster_jackpot_settings
  -- Nasce fechado; abre junto com a tela (20261104091000_jackpot_contracts_open.sql).
  add column if not exists contract_open boolean not null default false,
  add column if not exists contract_size integer not null default 6 check (contract_size between 2 and 12),
  add column if not exists contract_effect_step integer not null default 10 check (contract_effect_step between 0 and 100),
  add column if not exists contract_effect_cap integer not null default 60 check (contract_effect_cap between 0 and 100),
  add column if not exists contract_effect_floor integer not null default 5 check (contract_effect_floor between 0 and 100);

-- O kind novo em jackpot_pulls (troca da restrição numa instrução só, como as
-- outras trocas de CHECK pedidas pelos recursos novos).
alter table public.jackpot_pulls
  drop constraint jackpot_pulls_kind_check,
  add constraint jackpot_pulls_kind_check check (kind = any (array['normal', 'special', 'lucky', 'contract']));

-- ---------------------------------------------------------------------------
-- Histórico dos contratos
-- ---------------------------------------------------------------------------

create table if not exists public.jackpot_contracts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pull_id bigint references public.jackpot_pulls(id) on delete set null,
  rarity_in text not null check (rarity_in in ('common', 'rare', 'epic')),
  rarity_out text not null check (rarity_out in ('rare', 'epic', 'legendary')),
  -- [{ "item_id": 12, "effect": "holo" }, …] na ordem em que a pessoa pôs na mesa
  inputs jsonb not null,
  item_id integer not null references public.poster_items(id),
  effect text not null,
  effect_chance integer not null,
  effect_rolled boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists jackpot_contracts_user_idx on public.jackpot_contracts (user_id, created_at desc);
alter table public.jackpot_contracts enable row level security;
revoke all on public.jackpot_contracts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internas
-- ---------------------------------------------------------------------------

-- O contrato está aberto para esta pessoa? (Jackpot aberto ou testador, o
-- contrato ligado e não é bot.)
create or replace function public.jackpot_contract_allowed(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null
     and not exists (select 1 from bot_accounts b where b.user_id = p_uid)
     and exists (select 1 from poster_jackpot_settings s
                  where s.id and s.contract_open and (s.is_open or p_uid = any (coalesce(s.testers, '{}'))));
$$;
revoke all on function public.jackpot_contract_allowed(uuid) from public, anon, authenticated;

-- Por que um pôster da pessoa não pode entrar num contrato (null = pode).
-- Exclusivos e gold nem aparecem na mesa da Cobra (são de outro jogo).
create or replace function public.jackpot_contract_lock(p_uid uuid, p_item integer, p_effect text, p_tradeable boolean)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not coalesce(p_tradeable, false) then 'prize'
    when poker_poster_staked(p_uid, p_item, p_effect) then 'staked'
  end;
$$;
revoke all on function public.jackpot_contract_lock(uuid, integer, text, boolean) from public, anon, authenticated;

-- Quantas versões da raridade a pessoa ainda pode receber (ativas, fora do pôquer).
create or replace function public.jackpot_contract_left(p_uid uuid, p_rarity text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from poster_items pi
   cross join unnest(array['none', 'holo', 'negative', 'ultra_red']) e(effect)
   where pi.rarity = p_rarity and pi.is_active and pi.exclusive is null
     and not jackpot_owns(p_uid, pi.id, e.effect);
$$;
revoke all on function public.jackpot_contract_left(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Para o site
-- ---------------------------------------------------------------------------

-- A mesa da Cobra: os números, os três degraus e os pôsteres da pessoa que
-- podem entrar (com o motivo, quando não podem).
create or replace function public.get_jackpot_contract_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s poster_jackpot_settings;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into s from poster_jackpot_settings where id;
  return jsonb_build_object(
    'open', jackpot_contract_allowed(v_uid),
    'size', s.contract_size,
    'effect_step', s.contract_effect_step,
    'effect_cap', s.contract_effect_cap,
    'effect_floor', s.contract_effect_floor,
    'tiers', jsonb_build_array(
      jsonb_build_object('from', 'common', 'to', 'rare', 'left', jackpot_contract_left(v_uid, 'rare')),
      jsonb_build_object('from', 'rare', 'to', 'epic', 'left', jackpot_contract_left(v_uid, 'epic')),
      jsonb_build_object('from', 'epic', 'to', 'legendary', 'left', jackpot_contract_left(v_uid, 'legendary'))),
    'posters', (
      select coalesce(jsonb_agg(poster_item_json(pi) || jsonb_build_object(
               'effect', up.effect,
               'first_pulled_at', up.first_pulled_at,
               'equipped', exists (select 1 from user_poster_equips e
                                    where e.user_id = up.user_id and e.item_id = up.item_id and e.effect = up.effect and e.active),
               'in_trade', exists (select 1 from poster_trades t
                                    where t.status = 'pending'
                                      and ((t.from_user = up.user_id and t.offer_item = up.item_id and t.offer_effect = up.effect)
                                        or (t.to_user = up.user_id and t.ask_item = up.item_id and t.ask_effect = up.effect))),
               'lock', jackpot_contract_lock(up.user_id, up.item_id, up.effect, up.tradeable))
             order by array_position(array['common', 'rare', 'epic', 'legendary'], pi.rarity),
                      array_position(array['none', 'holo', 'negative', 'ultra_red'], up.effect),
                      up.first_pulled_at), '[]'::jsonb)
        from user_posters up
        join poster_items pi on pi.id = up.item_id
       where up.user_id = v_uid and up.reset_at is null
         and pi.exclusive is null and up.effect <> 'gold'
         and pi.rarity in ('common', 'rare', 'epic')));
end;
$$;
revoke all on function public.get_jackpot_contract_board() from public, anon;
grant execute on function public.get_jackpot_contract_board() to authenticated;

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

  -- Um contrato por vez para a pessoa (dois toques, dois aparelhos).
  perform pg_advisory_xact_lock(hashtext('jackpot_contract:' || v_uid::text));

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

-- ---------------------------------------------------------------------------
-- Tags (métricas novas em game_tag_metric)
-- ---------------------------------------------------------------------------

create or replace function public.game_tag_metric(p_uid uuid, p_metric text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  case p_metric
    when 'spins' then
      return (select count(*) from jackpot_pulls p
               where p.user_id = p_uid and not p.voided and p.kind in ('normal', 'special'));
    when 'lucky_spins' then
      return (select count(*) from jackpot_pulls p
               where p.user_id = p_uid and not p.voided and p.kind = 'lucky');
    when 'legendary_pulls' then
      return (select count(*) from jackpot_pulls p
               where p.user_id = p_uid and not p.voided and p.rarity = 'legendary');
    when 'effect_posters' then
      return (select count(*) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null and up.effect <> 'none');
    when 'posters' then
      return (select count(*) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and pi.exclusive is null);
    when 'trades' then
      return coalesce((select c.value from game_tag_counters c where c.user_id = p_uid and c.metric = 'trades'), 0);
    -- 04/11/2026: contratos da Cobra (o histórico não some; um reset não tira a tag).
    when 'contracts' then
      return (select count(*) from jackpot_contracts c where c.user_id = p_uid);
    when 'contract_legendaries' then
      return (select count(*) from jackpot_contracts c where c.user_id = p_uid and c.rarity_out = 'legendary');
    -- Do Pôster Poker (só para o progresso no modal; quem concede é o fim do
    -- torneio, poker_award_marks — as mesmas contas de lá).
    when 'poker_wins' then
      return (select count(*) from poker_bounty_matches x
               where x.user_id = p_uid and x.week is not null and x.status = 'won');
    when 'poker_posters' then
      return (select count(distinct up.item_id) from user_posters up join poster_items pi on pi.id = up.item_id
               where up.user_id = p_uid and up.reset_at is null and up.effect = 'gold' and pi.exclusive = 'poker');
    else
      return null;
  end case;
end;
$$;
revoke all on function public.game_tag_metric(uuid, text) from public, anon, authenticated;

insert into public.special_tags (id, name, emoji, category, starts_at, description, description_pt,
                                 requirement_type, requirement_data, requirement_description, requirement_description_pt)
values
  -- starts_at no futuro: as duas aparecem junto com a tela (…091000_jackpot_contracts_open.sql).
  ('jackpot-black-market', 'Black Market', '🕶️', 'games', '2100-01-01',
   'You signed with the Cobra. No questions, no receipts.',
   'Você assinou com a Cobra. Sem perguntas, sem recibo.',
   'custom', '{"source": "jackpot", "metric": "contracts", "goal": 1}',
   'Close a contract at the Cobra''s Black Market (in the Poster Jackpot)',
   'Feche um contrato no Mercado Negro da Cobra (no Poster Jackpot)'),
  ('jackpot-alchemist', 'Alchemist', '⚗️', 'games', '2100-01-01',
   'Six epics in, one legend out. The Cobra almost smiled.',
   'Seis épicos entraram, um lendário saiu. A Cobra quase sorriu.',
   'custom', '{"source": "jackpot", "metric": "contract_legendaries", "goal": 1}',
   'Forge a legendary poster in a Black Market contract',
   'Consiga um pôster lendário num contrato do Mercado Negro')
on conflict (id) do nothing;
