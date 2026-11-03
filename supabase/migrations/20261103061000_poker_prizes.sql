-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: os prêmios.
--
-- O Prêmio de Hoje: um prêmio e um portador por dia (iguais para todo mundo),
-- mais um reserva da mesma raridade para quem já tem o principal. Vem da
-- agenda do Bruno (poker_bounty_days) ou, num dia sem agenda, de um sorteio
-- determinístico do catálogo (poker_prizes.in_rotation).
--
-- A concessão (poker_grant_prize) é idempotente: uma linha em
-- poker_prize_grants por (source, ref) e no máximo um prêmio de mesa por
-- pessoa por dia; só despacha para o destino se a linha nasceu agora.
--
-- Pôster ganho na mesa fica fora das trocas (user_posters.tradeable = false;
-- gatilho poker_trade_guard em poster_trades).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.poker_prize_kinds (kind text primary key, note text);
insert into public.poker_prize_kinds (kind, note) values
  ('tickets', 'fichas comuns do Jackpot: {"amount":1..3}'),
  ('special_tickets', 'fichas especiais do Jackpot: {"amount":1..3}'),
  ('poster', 'pôster do Jackpot: {"item_id":int,"effect":"none|holo|negative|ultra_red"}; entra sem troca'),
  ('avatar_frame', 'moldura: {"cosmetic_id":"…"} em user_cosmetic_unlocks'),
  ('banner', 'banner: {"cosmetic_id":"…"} em user_cosmetic_unlocks'),
  ('tag', 'tag especial: {"tag_id":"…"} em user_special_tags (permanente)'),
  ('deck', 'verso de baralho: {"item_id":"…"} em poker_owned_items'),
  ('table', 'feltro: {"item_id":"…"} em poker_owned_items'),
  ('rival', 'rival jogável (sem conteúdo na v1): {"rival_id":"…","item_id":"rival-…"}'),
  ('poker_quip', 'pacote de réplicas: {"item_id":"…"} em poker_owned_items')
on conflict (kind) do nothing;

create table if not exists public.poker_prizes (
  id text primary key check (id ~ '^[a-z0-9-]{2,48}$'),      -- 'fichas-2', 'deck-noir', 'poster-155-holo'
  kind text not null references public.poker_prize_kinds(kind),
  payload jsonb not null,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  carrier text,                                              -- null = pela raridade
  repeatable boolean not null default false,
  name_pt text not null,
  name_en text not null,
  article_pt text check (article_pt in ('o', 'a', 'os', 'as')), -- para {premio} nas falas
  blurb_pt text,
  blurb_en text,
  image_path text,
  in_rotation boolean not null default false,
  weight int not null default 1 check (weight between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.poker_bounty_days (          -- a agenda do Bruno + o que o sorteio gravou
  day date primary key,
  prize_id text not null references public.poker_prizes(id),
  reserve_prize_id text references public.poker_prizes(id),
  carrier text,
  source text not null default 'agenda' check (source in ('agenda', 'rotation')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.poker_prize_grants (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  prize_id text not null references public.poker_prizes(id),
  kind text not null,
  payload jsonb not null,
  source text not null check (source in ('bounty', 'admin')),
  ref text not null,
  day date,
  granted_at timestamptz not null default now(),
  unique (source, ref)
);
create unique index if not exists poker_one_bounty_prize_per_day on public.poker_prize_grants (user_id, day) where source = 'bounty';
create index if not exists poker_prize_grants_by_day on public.poker_prize_grants (day) where source = 'bounty';
create index if not exists poker_prize_grants_by_user on public.poker_prize_grants (user_id, granted_at desc);

create table if not exists public.user_cosmetic_unlocks (       -- molduras e banners ganhos fora de tag/Premium
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('frame', 'banner')),
  cosmetic_id text not null,
  source text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, category, cosmetic_id)
);

-- Pôster de prêmio da mesa não entra em trocas.
alter table public.user_posters add column if not exists tradeable boolean not null default true;

alter table public.poker_prize_kinds enable row level security;
alter table public.poker_prizes enable row level security;
alter table public.poker_bounty_days enable row level security;
alter table public.poker_prize_grants enable row level security;
alter table public.user_cosmetic_unlocks enable row level security;
revoke all on public.poker_prize_kinds, public.poker_prizes, public.poker_bounty_days, public.poker_prize_grants,
  public.user_cosmetic_unlocks from anon, authenticated;
revoke all on sequence public.poker_prize_grants_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trocas: a trava e a "volta à vida" de um pôster
-- ---------------------------------------------------------------------------

-- Na proposta (insert) e no aceite (status → accepted): se a oferta (de
-- from_user) ou o pedido (de to_user) é prêmio da mesa, recusa. No aceite, as
-- linhas já foram marcadas com reset_at, mas tradeable continua false, então a
-- troca inteira volta atrás.
create or replace function public.poker_trade_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status = 'accepted' then
    if exists (select 1 from user_posters up
                where up.user_id = new.from_user and up.item_id = new.offer_item and up.effect = new.offer_effect
                  and not up.tradeable)
       or exists (select 1 from user_posters up
                   where up.user_id = new.to_user and up.item_id = new.ask_item and up.effect = new.ask_effect
                     and not up.tradeable) then
      raise exception 'untradeable';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger poker_trade_guard
before insert or update of status on public.poster_trades
for each row execute function public.poker_trade_guard();

-- Uma linha de user_posters que volta à vida (reset_at sai) por sorteio ou
-- troca é uma cópia nova, vinda do Jackpot: volta a poder ser trocada. Só a
-- concessão do pôquer (que liga poker.granting na transação) mantém false.
create or replace function public.poker_poster_revive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.reset_at is not null and new.reset_at is null and not new.tradeable
     and coalesce(current_setting('poker.granting', true), '') <> '1' then
    new.tradeable := true;
  end if;
  return new;
end;
$$;

create or replace trigger poker_poster_revive
before update on public.user_posters
for each row execute function public.poker_poster_revive();

revoke all on function public.poker_trade_guard() from public, anon, authenticated;
revoke all on function public.poker_poster_revive() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auxiliares de prêmio (sem grant para o cliente)
-- ---------------------------------------------------------------------------

-- O prêmio em JSON. Pôster: payload.poster = poster_version_json (título nos
-- dois idiomas, arquivo do TMDB, efeito) e image = o arquivo do pôster.
create or replace function public.poker_prize_json(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'rarity', p.rarity,
    'name_pt', p.name_pt, 'name_en', p.name_en, 'article_pt', p.article_pt,
    'blurb_pt', p.blurb_pt, 'blurb_en', p.blurb_en,
    'image', coalesce(p.image_path, case when p.kind = 'poster' then
               (select pi.file_path from poster_items pi where pi.id = (p.payload ->> 'item_id')::int) end),
    'payload', case when p.kind = 'poster'
                    then p.payload || jsonb_build_object('poster',
                           poster_version_json((p.payload ->> 'item_id')::int, coalesce(p.payload ->> 'effect', 'none')))
                    else p.payload end,
    'repeatable', p.repeatable,
    'carrier', p.carrier)
  from poker_prizes p
  where p.id = p_id;
$$;

-- A pessoa já tem este prêmio? (§5.4) Repetível nunca conta como "já tem".
create or replace function public.poker_owns_prize(p_uid uuid, p_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p poker_prizes;
begin
  select * into p from poker_prizes where id = p_id;
  if not found or p.repeatable then
    return false;
  end if;
  return case p.kind
    when 'tickets' then false
    when 'special_tickets' then false
    when 'poster' then jackpot_owns(p_uid, (p.payload ->> 'item_id')::int, coalesce(p.payload ->> 'effect', 'none'))
    when 'avatar_frame' then is_cosmetic_unlocked(p_uid, 'frame', p.payload ->> 'cosmetic_id')
    when 'banner' then is_cosmetic_unlocked(p_uid, 'banner', p.payload ->> 'cosmetic_id')
    when 'tag' then exists (select 1 from user_special_tags t where t.user_id = p_uid and t.tag_id = p.payload ->> 'tag_id')
    when 'deck' then exists (select 1 from poker_owned_items o where o.user_id = p_uid and o.item_id = p.payload ->> 'item_id')
    when 'table' then exists (select 1 from poker_owned_items o where o.user_id = p_uid and o.item_id = p.payload ->> 'item_id')
    when 'poker_quip' then exists (select 1 from poker_owned_items o where o.user_id = p_uid and o.item_id = p.payload ->> 'item_id')
    when 'rival' then exists (select 1 from poker_owned_items o where o.user_id = p_uid and o.item_id = p.payload ->> 'item_id')
    else false
  end;
end;
$$;

-- Concede um prêmio. A linha em poker_prize_grants é a trava: se já existe
-- (mesmo source/ref, ou já houve prêmio de mesa hoje), nada é despachado.
-- Devolve true só quando concedeu agora.
create or replace function public.poker_grant_prize(p_uid uuid, p_prize_id text, p_source text, p_ref text, p_day date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p poker_prizes;
  v_id bigint;
  v_amount int;
begin
  select * into p from poker_prizes where id = p_prize_id;
  if not found then
    raise exception 'unknown_prize';
  end if;
  insert into poker_prize_grants (user_id, prize_id, kind, payload, source, ref, day)
  values (p_uid, p.id, p.kind, p.payload, p_source, p_ref, p_day)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;

  case p.kind
    when 'tickets' then
      v_amount := least(greatest(coalesce((p.payload ->> 'amount')::int, 1), 1), 3);
      perform jackpot_wallet_row(p_uid);
      update jackpot_wallets set tickets = tickets + v_amount, updated_at = now() where user_id = p_uid;
    when 'special_tickets' then
      v_amount := least(greatest(coalesce((p.payload ->> 'amount')::int, 1), 1), 3);
      perform jackpot_wallet_row(p_uid);
      update jackpot_wallets set special_tickets = special_tickets + v_amount, updated_at = now() where user_id = p_uid;
    when 'poster' then
      -- Entra sem troca. Uma linha antiga (reset_at) volta à vida como prêmio.
      perform set_config('poker.granting', '1', true);
      insert into user_posters (user_id, item_id, effect, tradeable)
      values (p_uid, (p.payload ->> 'item_id')::int, coalesce(p.payload ->> 'effect', 'none'), false)
      on conflict (user_id, item_id, effect) do update
         set reset_at = null, left_via = null, tradeable = false, copies = 1,
             first_pulled_at = now(), last_pulled_at = now()
       where user_posters.reset_at is not null;
      perform set_config('poker.granting', '', true);
    when 'avatar_frame' then
      insert into user_cosmetic_unlocks (user_id, category, cosmetic_id, source)
      values (p_uid, 'frame', p.payload ->> 'cosmetic_id', 'poker') on conflict do nothing;
    when 'banner' then
      insert into user_cosmetic_unlocks (user_id, category, cosmetic_id, source)
      values (p_uid, 'banner', p.payload ->> 'cosmetic_id', 'poker') on conflict do nothing;
    when 'tag' then
      insert into user_special_tags (user_id, tag_id, is_permanent)
      values (p_uid, p.payload ->> 'tag_id', true)
      on conflict (user_id, tag_id) do update set is_permanent = true;
    when 'deck', 'table', 'poker_quip', 'rival' then
      insert into poker_owned_items (user_id, item_id, source)
      values (p_uid, p.payload ->> 'item_id', p_source) on conflict do nothing;
    else
      raise exception 'unknown_prize_kind';
  end case;
  return true;
end;
$$;

-- Portador de um dia: o da agenda → o do prêmio → o da raridade.
create or replace function public.poker_day_carrier(p_carrier text, p_prize_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_carrier, p.carrier, s.carrier_by_rarity ->> p.rarity, 'bogart')
    from poker_prizes p, poker_settings s
   where p.id = p_prize_id;
$$;

-- O prêmio de um dia (§5.4): a agenda, se houver; senão o sorteio
-- determinístico do catálogo, gravado na primeira vez (não muda mais).
create or replace function public.poker_bounty_for_day(p_day date)
returns public.poker_bounty_days
language plpgsql
security definer
set search_path = public
as $$
declare
  d poker_bounty_days;
  cfg poker_settings;
  v_rot int;
  v_window int;
  v_last_tickets date;
  v_ids text[];
  v_rarities text[];
  v_main poker_prizes;
  v_reserve text;
  i int;
begin
  select * into d from poker_bounty_days where day = p_day;
  if found then
    return d;
  end if;
  select * into cfg from poker_settings;

  select count(*) into v_rot from poker_prizes where in_rotation and is_active and weight > 0;
  v_window := least(cfg.no_repeat_days, greatest(v_rot - 1, 0));
  select max(bd.day) into v_last_tickets
    from poker_bounty_days bd join poker_prizes p on p.id = bd.prize_id
   where p.kind = 'tickets' and bd.day < p_day;

  -- Sorteio com peso, sem aleatório de verdade: u sai do hash do dia + id e
  -- vence o menor -ln(u)/peso (corrida exponencial). Vão para o fim da fila:
  -- o que saiu nos últimos v_window dias e as fichas antes do intervalo mínimo
  -- (se só sobrar isso, ainda assim sai alguém).
  select array_agg(x.id order by (not x.ok), x.k, x.id), array_agg(x.rarity order by (not x.ok), x.k, x.id)
    into v_ids, v_rarities
    from (select p.id, p.rarity,
                 -ln(((hashtext(p_day::text || p.id)::bigint + 2147483649)::float8) / 4294967298.0) / p.weight as k,
                 not exists (select 1 from poker_bounty_days bd
                              where bd.prize_id = p.id and bd.day < p_day and bd.day >= p_day - v_window)
                 and (p.kind <> 'tickets' or v_last_tickets is null or p_day - v_last_tickets >= cfg.tickets_prize_gap_days) as ok
            from poker_prizes p
           where p.in_rotation and p.is_active and p.weight > 0) x;

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    select * into v_main from poker_prizes where id = v_ids[1];
    -- Reserva: o próximo do mesmo sorteio com a mesma raridade.
    for i in 2 .. array_length(v_ids, 1) loop
      if v_rarities[i] = v_main.rarity then
        v_reserve := v_ids[i];
        exit;
      end if;
    end loop;
  else
    select * into v_main from poker_prizes where id = cfg.fallback_prize_id;
    if not found then
      return null;
    end if;
  end if;

  insert into poker_bounty_days (day, prize_id, reserve_prize_id, carrier, source, note)
  values (p_day, v_main.id, v_reserve, poker_day_carrier(null, v_main.id), 'rotation', null)
  on conflict (day) do nothing;
  select * into d from poker_bounty_days where day = p_day;
  return d;
end;
$$;

-- Prêmio efetivo de uma pessoa num dia: o principal; se ela já tem (e não é
-- repetível), o reserva; se tem os dois, o fallback (fichas-2). A raridade e o
-- portador são sempre os do dia (iguais para todo mundo).
create or replace function public.poker_effective_prize(p_uid uuid, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d poker_bounty_days;
  v_rarity text;
  v_carrier text;
  v_fallback text;
begin
  d := poker_bounty_for_day(p_day);
  if d.day is null then
    return null;
  end if;
  select p.rarity into v_rarity from poker_prizes p where p.id = d.prize_id;
  v_carrier := poker_day_carrier(d.carrier, d.prize_id);
  if not poker_owns_prize(p_uid, d.prize_id) then
    return jsonb_build_object('prize_id', d.prize_id, 'is_reserve', false, 'is_fallback', false, 'rarity', v_rarity, 'carrier', v_carrier);
  end if;
  if d.reserve_prize_id is not null and not poker_owns_prize(p_uid, d.reserve_prize_id) then
    return jsonb_build_object('prize_id', d.reserve_prize_id, 'is_reserve', true, 'is_fallback', false, 'rarity', v_rarity, 'carrier', v_carrier);
  end if;
  select fallback_prize_id into v_fallback from poker_settings;
  return jsonb_build_object('prize_id', coalesce(v_fallback, d.prize_id), 'is_reserve', false, 'is_fallback', v_fallback is not null,
                            'rarity', v_rarity, 'carrier', v_carrier);
end;
$$;

revoke all on function public.poker_prize_json(text) from public, anon, authenticated;
revoke all on function public.poker_owns_prize(uuid, text) from public, anon, authenticated;
revoke all on function public.poker_grant_prize(uuid, text, text, text, date) from public, anon, authenticated;
revoke all on function public.poker_day_carrier(text, text) from public, anon, authenticated;
revoke all on function public.poker_bounty_for_day(date) from public, anon, authenticated;
revoke all on function public.poker_effective_prize(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cliente: molduras e banners ganhos (a Personalização conta como desbloqueado)
-- ---------------------------------------------------------------------------

create or replace function public.get_my_cosmetic_unlocks()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', u.category, 'cosmetic_id', u.cosmetic_id) order by u.granted_at), '[]'::jsonb)
    from user_cosmetic_unlocks u
   where u.user_id = auth.uid();
$$;

revoke all on function public.get_my_cosmetic_unlocks() from public, anon;
grant execute on function public.get_my_cosmetic_unlocks() to authenticated;
