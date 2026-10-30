-- Poster Jackpot (30/10/2026, pedido do Bruno): uma máquina de cápsulas no
-- Oracle Hub que sorteia pôsteres alternativos de títulos (escolhidos à mão
-- pelo Bruno no TMDB). A pessoa coleciona e pode equipar o pôster: ele
-- aparece no lugar da capa na biblioteca dela (e no perfil, para quem visita).
--
-- Regras (decididas com o Bruno):
--   - 4 raridades: comum (cinza), raro (azul), épico (roxo), lendário
--     (dourado). Num ticket, a raridade sai com 55 / 28 / 13 / 4 %.
--   - Efeito especial, sorteado à parte: holográfico, negativo ou ultra
--     vermelho. Ticket comum: 5% de ter efeito; com efeito, 80 / 15 / 5 %.
--     Ticket especial: sempre tem efeito (80 / 15 / 5 %). Cada pôster existe
--     em 4 versões (sem efeito + 3 efeitos). O mais raro: lendário ultra
--     vermelho num ticket comum (4% × 5% × 5% = 1 em 10 mil).
--   - Repetido (mesmo pôster e mesmo efeito) vira fragmentos: comum 1, raro
--     2, épico 3, lendário 5. A cada 5 fragmentos, 1 ticket.
--   - Tickets: 3 missões por semana (iguais para todos, trocam toda segunda
--     no horário de Brasília), 1 ticket cada. Premium: 1 ticket especial por
--     semana, que não acumula (sem usar até domingo, some).
--   - Tudo que sorteia ou dá ticket roda aqui no banco (security definer); o
--     site só mostra.
--   - Enquanto o catálogo cresce, a máquina fica fechada: só quem está em
--     poster_jackpot_settings.testers vê (is_open liga para todos).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.poster_jackpot_settings (
  id boolean primary key default true check (id),
  is_open boolean not null default false,
  testers uuid[] not null default '{}'
);
insert into public.poster_jackpot_settings (id) values (true) on conflict do nothing;

create table if not exists public.poster_items (
  id serial primary key,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  -- caminho do pôster no TMDB (ex.: '/A6dblGBAZAgPICoO1rtP8Du7lPh.jpg')
  file_path text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists poster_items_rarity on public.poster_items (rarity) where is_active;
create index if not exists poster_items_title on public.poster_items (media_type, tmdb_id);

create table if not exists public.user_posters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id integer not null references public.poster_items(id),
  effect text not null default 'none' check (effect in ('none', 'holo', 'negative', 'ultra_red')),
  copies integer not null default 1,
  first_pulled_at timestamptz not null default now(),
  last_pulled_at timestamptz not null default now(),
  primary key (user_id, item_id, effect)
);

create table if not exists public.user_poster_equips (
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  item_id integer not null,
  effect text not null,
  equipped_at timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id),
  foreign key (user_id, item_id, effect) references public.user_posters (user_id, item_id, effect) on delete cascade
);

create table if not exists public.jackpot_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tickets integer not null default 0 check (tickets >= 0),
  fragments integer not null default 0 check (fragments >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.jackpot_pulls (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('normal', 'special')),
  item_id integer not null references public.poster_items(id),
  rarity text not null,
  effect text not null,
  duplicate boolean not null,
  fragments_gained integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists jackpot_pulls_user on public.jackpot_pulls (user_id, kind, created_at desc);

-- O que a pessoa fez (para as missões): avaliou, guardou na Watchlist,
-- sussurrou, escreveu resenha. Gravado pelos gatilhos abaixo.
create table if not exists public.jackpot_actions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('rate', 'watchlist', 'whisper', 'review')),
  media_type text not null default 'movie',
  tmdb_id integer not null,
  created_at timestamptz not null default now()
);
create index if not exists jackpot_actions_user on public.jackpot_actions (user_id, created_at desc);

create table if not exists public.jackpot_mission_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  mission_key text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week_start, mission_key)
);

alter table public.poster_jackpot_settings enable row level security;
alter table public.poster_items enable row level security;
alter table public.user_posters enable row level security;
alter table public.user_poster_equips enable row level security;
alter table public.jackpot_wallets enable row level security;
alter table public.jackpot_pulls enable row level security;
alter table public.jackpot_actions enable row level security;
alter table public.jackpot_mission_claims enable row level security;
revoke all on public.poster_jackpot_settings, public.poster_items, public.user_posters, public.user_poster_equips,
  public.jackpot_wallets, public.jackpot_pulls, public.jackpot_actions, public.jackpot_mission_claims from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ajudantes
-- ---------------------------------------------------------------------------

-- A máquina está liberada para esta pessoa?
create or replace function public.jackpot_enabled(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and exists (
    select 1 from poster_jackpot_settings s where s.is_open or p_uid = any(s.testers)
  );
$$;

-- Segunda-feira da semana atual, no horário de Brasília.
create or replace function public.jackpot_week_start()
returns date
language sql
stable
as $$
  select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Início e fim da semana como instantes.
create or replace function public.jackpot_week_bounds(p_week date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
as $$
  select (p_week::timestamp at time zone 'America/Sao_Paulo'), ((p_week + 7)::timestamp at time zone 'America/Sao_Paulo');
$$;

-- As 3 missões da semana (as mesmas para todo mundo): uma de oráculo, uma de
-- prateleira e uma variada. Trocam toda segunda.
create or replace function public.jackpot_week_missions(p_week date)
returns table (mission_key text, kind text, param text, target integer)
language plpgsql
immutable
as $$
declare
  idx integer := ((p_week - date '2026-01-05') / 7);
  oracles text[] := array['bogart', 'fincher', 'cypher'];
  moods text[] := array['mind-blowing', 'catharsis', 'adventures', 'adrenaline', 'dark-and-scary', 'drug-trip', 'romantic', 'family-time', 'laugh-out-loud'];
  misc text[] := array['whisper', 'rate_series', 'review', 'watchlist', 'rate_any', 'rate_classic'];
  v_oracle text := oracles[1 + ((idx % 3) + 3) % 3];
  v_mood text := moods[1 + (((idx * 4 + 1) % 9) + 9) % 9];
  v_misc text := misc[1 + (((idx * 5 + 2) % 6) + 6) % 6];
begin
  mission_key := 'oracle:' || v_oracle; kind := 'rate_oracle'; param := v_oracle; target := 1; return next;
  mission_key := 'mood:' || v_mood; kind := 'rate_mood'; param := v_mood; target := 1; return next;
  mission_key := 'misc:' || v_misc; kind := v_misc; param := null;
  target := case v_misc when 'watchlist' then 3 when 'rate_any' then 5 else 1 end;
  return next;
end;
$$;

-- Progresso de uma missão na semana.
create or replace function public.jackpot_mission_progress(p_uid uuid, p_week date, p_kind text, p_param text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b record;
  v integer := 0;
begin
  select * into b from jackpot_week_bounds(p_week);
  with acts as (
    select distinct a.kind, a.media_type, a.tmdb_id
      from jackpot_actions a
     where a.user_id = p_uid and a.created_at >= b.starts_at and a.created_at < b.ends_at
  )
  select count(*) into v
    from acts a
   where case p_kind
           when 'rate_oracle' then a.kind = 'rate' and exists (
             select 1 from recommendation_pools rp
              where rp.card_type = p_param and rp.mood_key <> 'random-surprise'
                and (case when a.media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(a.tmdb_id))
           when 'rate_mood' then a.kind = 'rate' and exists (
             select 1 from recommendation_pools rp
              where rp.mood_key = p_param and rp.card_type in ('bogart', 'fincher', 'cypher')
                and (case when a.media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(a.tmdb_id))
           when 'whisper' then a.kind = 'whisper'
           when 'review' then a.kind = 'review'
           when 'watchlist' then a.kind = 'watchlist'
           when 'rate_any' then a.kind = 'rate'
           when 'rate_series' then a.kind = 'rate' and a.media_type = 'tv'
           when 'rate_classic' then a.kind = 'rate' and a.media_type = 'movie' and exists (
             select 1 from movie_cache mc
              where mc.tmdb_id = a.tmdb_id and mc.media_type = 'movie' and mc.release_date < date '1980-01-01')
           else false
         end;
  return coalesce(v, 0);
end;
$$;

-- Carteira (cria se não existir).
create or replace function public.jackpot_wallet_row(p_uid uuid)
returns public.jackpot_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  w jackpot_wallets;
begin
  insert into jackpot_wallets (user_id) values (p_uid) on conflict do nothing;
  select * into w from jackpot_wallets where user_id = p_uid;
  return w;
end;
$$;

-- Pôster em JSON (com o título nos dois idiomas).
create or replace function public.poster_item_json(p_item public.poster_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_item.id, 'media_type', p_item.media_type, 'tmdb_id', p_item.tmdb_id,
    'rarity', p_item.rarity, 'file_path', p_item.file_path,
    'title_pt', coalesce(mc.title_pt, mc.title_en), 'title_en', coalesce(mc.title_en, mc.title_pt),
    'year', extract(year from mc.release_date)::int)
  from (select 1) one
  left join movie_cache mc on mc.tmdb_id = p_item.tmdb_id and mc.media_type = p_item.media_type;
$$;

-- ---------------------------------------------------------------------------
-- Estado da máquina (o que o site mostra)
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
  v_special boolean;
  v_missions jsonb;
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

  return jsonb_build_object(
    'enabled', true,
    'tickets', w.tickets,
    'fragments', w.fragments,
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
    'owned', (select count(*) from user_posters where user_id = v_uid)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- O sorteio
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
  v_order text[];
  v_item poster_items;
  v_effect text := 'none';
  v_copies integer;
  v_dup boolean;
  v_frag integer := 0;
  v_bonus integer := 0;
  v_prev integer;
begin
  if not jackpot_enabled(v_uid) then
    raise exception 'jackpot_closed';
  end if;
  if p_kind not in ('normal', 'special') then
    raise exception 'invalid_kind';
  end if;
  w := jackpot_wallet_row(v_uid);
  -- uma tiragem por vez para a mesma pessoa
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
    update jackpot_wallets set tickets = tickets - 1, updated_at = now() where user_id = v_uid;
  end if;

  -- Raridade: 55 / 28 / 13 / 4. Se a sorteada não tiver nenhum pôster
  -- ativo, cai para a mais comum seguinte que tenha.
  r := random();
  v_rarity := case when r < 0.04 then 'legendary' when r < 0.17 then 'epic' when r < 0.45 then 'rare' else 'common' end;
  v_order := case v_rarity
               when 'legendary' then array['legendary', 'epic', 'rare', 'common']
               when 'epic' then array['epic', 'rare', 'common', 'legendary']
               when 'rare' then array['rare', 'common', 'epic', 'legendary']
               else array['common', 'rare', 'epic', 'legendary'] end;
  for i in 1..4 loop
    select * into v_item from poster_items where is_active and rarity = v_order[i] order by random() limit 1;
    exit when found;
  end loop;
  if v_item.id is null then
    raise exception 'empty_catalog';
  end if;

  -- Efeito: no especial, sempre; no comum, 5%. Com efeito: 80 / 15 / 5.
  if p_kind = 'special' or random() < 0.05 then
    r := random();
    v_effect := case when r < 0.80 then 'holo' when r < 0.95 then 'negative' else 'ultra_red' end;
  end if;

  insert into user_posters as up (user_id, item_id, effect)
  values (v_uid, v_item.id, v_effect)
  on conflict (user_id, item_id, effect) do update set copies = up.copies + 1, last_pulled_at = now()
  returning up.copies into v_copies;
  v_dup := v_copies > 1;

  if v_dup then
    v_frag := case v_item.rarity when 'legendary' then 5 when 'epic' then 3 when 'rare' then 2 else 1 end;
    select fragments into v_prev from jackpot_wallets where user_id = v_uid;
    v_bonus := (v_prev + v_frag) / 5;
    update jackpot_wallets
       set fragments = (v_prev + v_frag) % 5,
           tickets = tickets + v_bonus,
           updated_at = now()
     where user_id = v_uid;
  end if;

  insert into jackpot_pulls (user_id, kind, item_id, rarity, effect, duplicate, fragments_gained)
  values (v_uid, p_kind, v_item.id, v_item.rarity, v_effect, v_dup, v_frag);

  select * into w from jackpot_wallets where user_id = v_uid;

  return jsonb_build_object(
    'item', poster_item_json(v_item),
    'effect', v_effect,
    'kind', p_kind,
    'duplicate', v_dup,
    'copies', v_copies,
    'fragments_gained', v_frag,
    'bonus_tickets', v_bonus,
    'tickets', w.tickets,
    'fragments', w.fragments
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Missões
-- ---------------------------------------------------------------------------

create or replace function public.jackpot_claim_mission(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := jackpot_week_start();
  m record;
  w jackpot_wallets;
begin
  if not jackpot_enabled(v_uid) then
    raise exception 'jackpot_closed';
  end if;
  select * into m from jackpot_week_missions(v_week) x where x.mission_key = p_key;
  if not found then
    raise exception 'mission_not_found';
  end if;
  if jackpot_mission_progress(v_uid, v_week, m.kind, m.param) < m.target then
    raise exception 'mission_incomplete';
  end if;
  insert into jackpot_mission_claims (user_id, week_start, mission_key) values (v_uid, v_week, p_key)
  on conflict do nothing;
  if not found then
    raise exception 'mission_claimed';
  end if;
  w := jackpot_wallet_row(v_uid);
  update jackpot_wallets set tickets = tickets + 1, updated_at = now() where user_id = v_uid returning * into w;
  return jsonb_build_object('tickets', w.tickets, 'fragments', w.fragments);
end;
$$;

-- ---------------------------------------------------------------------------
-- Coleção e pôster equipado
-- ---------------------------------------------------------------------------

-- A coleção de quem está logado: cada versão que tem, com o pôster, o
-- efeito, as cópias, se está equipada e se o título está na biblioteca.
create or replace function public.get_my_posters()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(poster_item_json(pi) || jsonb_build_object(
           'effect', up.effect, 'copies', up.copies, 'first_pulled_at', up.first_pulled_at,
           'equipped', exists (select 1 from user_poster_equips e where e.user_id = up.user_id and e.item_id = up.item_id and e.effect = up.effect),
           'in_library', exists (select 1 from user_movies um where um.user_id = up.user_id and um.movie_id = pi.tmdb_id and coalesce(um.media_type, 'movie') = pi.media_type))
         order by array_position(array['legendary', 'epic', 'rare', 'common'], pi.rarity),
                  array_position(array['ultra_red', 'negative', 'holo', 'none'], up.effect), up.first_pulled_at desc), '[]'::jsonb)
    from user_posters up
    join poster_items pi on pi.id = up.item_id
   where up.user_id = auth.uid();
$$;

create or replace function public.equip_poster(p_item_id integer, p_effect text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item poster_items;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from user_posters where user_id = v_uid and item_id = p_item_id and effect = p_effect) then
    raise exception 'not_owned';
  end if;
  select * into v_item from poster_items where id = p_item_id;
  insert into user_poster_equips (user_id, media_type, tmdb_id, item_id, effect)
  values (v_uid, v_item.media_type, v_item.tmdb_id, p_item_id, p_effect)
  on conflict (user_id, media_type, tmdb_id) do update set item_id = excluded.item_id, effect = excluded.effect, equipped_at = now();
  return jsonb_build_object('media_type', v_item.media_type, 'tmdb_id', v_item.tmdb_id, 'item_id', p_item_id, 'effect', p_effect);
end;
$$;

create or replace function public.unequip_poster(p_media_type text, p_tmdb_id integer)
returns void
language sql
security definer
set search_path = public
as $$
  delete from user_poster_equips where user_id = auth.uid() and media_type = p_media_type and tmdb_id = p_tmdb_id;
$$;

-- Os pôsteres equipados de uma pessoa (para a biblioteca dela, vista por ela
-- ou por quem visita o perfil).
create or replace function public.get_equipped_posters(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not can_view_user_content(p_user_id) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object('media_type', e.media_type, 'tmdb_id', e.tmdb_id, 'item_id', e.item_id,
                                                  'effect', e.effect, 'rarity', pi.rarity, 'file_path', pi.file_path))
                from user_poster_equips e
                join poster_items pi on pi.id = e.item_id
               where e.user_id = p_user_id), '[]'::jsonb)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos das missões
-- ---------------------------------------------------------------------------

create or replace function public.trigger_jackpot_action_on_movie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from bot_accounts b where b.user_id = new.user_id) then
    return null;
  end if;
  begin
    if new.rating is not null and (tg_op = 'INSERT' or old.rating is null) then
      insert into jackpot_actions (user_id, kind, media_type, tmdb_id) values (new.user_id, 'rate', coalesce(new.media_type, 'movie'), new.movie_id);
    elsif new.rating is null and tg_op = 'INSERT' then
      insert into jackpot_actions (user_id, kind, media_type, tmdb_id) values (new.user_id, 'watchlist', coalesce(new.media_type, 'movie'), new.movie_id);
    end if;
  exception when others then
    raise warning 'jackpot action (user_movies): %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace trigger jackpot_action_on_movie
  after insert or update of rating on public.user_movies
  for each row execute function public.trigger_jackpot_action_on_movie();

create or replace function public.trigger_jackpot_action_on_whisper()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.type, 'movie') <> 'movie' or new.movie_id is null or new.from_user_id is null or new.from_user_id = new.to_user_id then
    return null;
  end if;
  begin
    insert into jackpot_actions (user_id, kind, media_type, tmdb_id)
    values (new.from_user_id, 'whisper', case when new.media_type = 'tv' then 'tv' else 'movie' end, new.movie_id);
  exception when others then
    raise warning 'jackpot action (friend_indications): %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace trigger jackpot_action_on_whisper
  after insert on public.friend_indications
  for each row execute function public.trigger_jackpot_action_on_whisper();

create or replace function public.trigger_jackpot_action_on_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_ai_generated, false) or exists (select 1 from bot_accounts b where b.user_id = new.user_id) then
    return null;
  end if;
  begin
    insert into jackpot_actions (user_id, kind, media_type, tmdb_id)
    values (new.user_id, 'review', coalesce(new.media_type, 'movie'), new.movie_id);
  exception when others then
    raise warning 'jackpot action (reviews): %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace trigger jackpot_action_on_review
  after insert on public.reviews
  for each row execute function public.trigger_jackpot_action_on_review();

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on function public.jackpot_enabled(uuid) from public, anon, authenticated;
revoke all on function public.jackpot_mission_progress(uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.jackpot_wallet_row(uuid) from public, anon, authenticated;
revoke all on function public.poster_item_json(public.poster_items) from public, anon, authenticated;
revoke all on function public.get_jackpot_state() from public, anon;
revoke all on function public.jackpot_pull(text) from public, anon;
revoke all on function public.jackpot_claim_mission(text) from public, anon;
revoke all on function public.get_my_posters() from public, anon;
revoke all on function public.equip_poster(integer, text) from public, anon;
revoke all on function public.unequip_poster(text, integer) from public, anon;
grant execute on function public.get_jackpot_state() to authenticated;
grant execute on function public.jackpot_pull(text) to authenticated;
grant execute on function public.jackpot_claim_mission(text) to authenticated;
grant execute on function public.get_my_posters() to authenticated;
grant execute on function public.equip_poster(integer, text) to authenticated;
grant execute on function public.unequip_poster(text, integer) to authenticated;
grant execute on function public.get_equipped_posters(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Os primeiros pôsteres (escolhidos pelo Bruno em 30/10/2026)
-- ---------------------------------------------------------------------------

insert into public.poster_items (media_type, tmdb_id, rarity, file_path) values
  ('tv', 1396, 'rare', '/A6dblGBAZAgPICoO1rtP8Du7lPh.jpg'),
  ('tv', 1396, 'epic', '/ucbjrMJJA40RCShpDJPDxwcPW8M.jpg'),
  ('tv', 1396, 'legendary', '/nNqVVwbNTxrOD5FP7GJvdj0AXPt.jpg'),
  ('tv', 1399, 'common', '/v1uB0sHMlrLI1E6yzhg5XatgQJ1.jpg'),
  ('tv', 1399, 'epic', '/mc2dQBpxR1vJpOOqZVAqY9sQHOc.jpg'),
  ('tv', 1399, 'legendary', '/fnpyUJ2Y2xk9mMQUrcRB4JNnCHT.jpg'),
  ('movie', 345, 'legendary', '/eDaJm2BTSOwtHZIrVoBc1fhAidJ.jpg'),
  ('movie', 155, 'common', '/bRfVDNRpxJgKvUmqXFwK7tAZj0w.jpg'),
  ('movie', 155, 'legendary', '/d6sfqP7V3Z934F7WyI1ucSnKnng.jpg'),
  ('movie', 106646, 'common', '/9o9E3Szf7VkNFKU4wbqWnyxzaV3.jpg'),
  ('movie', 680, 'rare', '/dCUDEXC3CfsPQRZCHxHmmUxNRW4.jpg')
on conflict (file_path) do nothing;
