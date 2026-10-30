-- Poster Jackpot: zerar a coleção de alguém sem apagar linhas (30/10/2026).
-- O Bruno pediu para zerar os pôsteres dele e refazer o teste. Em vez de
-- apagar, a coleção é "zerada": os pôsteres ganham reset_at (somem da
-- coleção e podem sair de novo na roleta), os giros ficam marcados como
-- anulados (o ticket especial da semana volta) e os equipados são
-- desligados.
--
--   select public.jackpot_reset_user('<id da pessoa>');

alter table public.user_posters add column if not exists reset_at timestamptz;
alter table public.jackpot_pulls add column if not exists voided boolean not null default false;
alter table public.user_poster_equips add column if not exists active boolean not null default true;

create or replace function public.jackpot_reset_user(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_posters integer;
begin
  update user_posters set reset_at = now() where user_id = p_uid and reset_at is null;
  get diagnostics v_posters = row_count;
  update jackpot_pulls set voided = true where user_id = p_uid and not voided;
  update user_poster_equips set active = false where user_id = p_uid and active;
  return jsonb_build_object('posters_reset', v_posters);
end;
$$;
revoke all on function public.jackpot_reset_user(uuid) from public, anon, authenticated;

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
    if exists (select 1 from jackpot_pulls p where p.user_id = v_uid and p.kind = 'special' and not p.voided and p.created_at >= b.starts_at and p.created_at < b.ends_at) then
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
  v_eorder := array[v_effect] || array(
    select e from unnest(case when p_kind = 'special' then array['holo', 'negative', 'ultra_red']
                              else array['none', 'holo', 'negative', 'ultra_red'] end) e
     where e <> v_effect);

  -- Só versões que a pessoa ainda não tem (nunca sai repetido).
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

  if not v_found then
    raise exception 'collection_complete';
  end if;

  if p_kind = 'normal' then
    update jackpot_wallets set tickets = tickets - 1, updated_at = now() where user_id = v_uid;
  end if;

  insert into user_posters as up (user_id, item_id, effect) values (v_uid, v_item.id, v_effect)
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, copies = 1, first_pulled_at = now(), last_pulled_at = now();
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
    select 1 from jackpot_pulls p where p.user_id = v_uid and p.kind = 'special' and not p.voided and p.created_at >= b.starts_at and p.created_at < b.ends_at);

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
    'owned', (select count(*) from user_posters where user_id = v_uid and reset_at is null),
    'remaining', v_items * 4 - v_owned,
    'remaining_special', v_items * 3 - v_owned_fx
  );
end;
$$;

create or replace function public.get_my_posters()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(poster_item_json(pi) || jsonb_build_object(
           'effect', up.effect, 'copies', 1, 'first_pulled_at', up.first_pulled_at,
           'equipped', exists (select 1 from user_poster_equips e where e.user_id = up.user_id and e.item_id = up.item_id and e.effect = up.effect and e.active),
           'in_library', exists (select 1 from user_movies um where um.user_id = up.user_id and um.movie_id = pi.tmdb_id and coalesce(um.media_type, 'movie') = pi.media_type))
         order by array_position(array['legendary', 'epic', 'rare', 'common'], pi.rarity),
                  array_position(array['ultra_red', 'negative', 'holo', 'none'], up.effect), up.first_pulled_at desc), '[]'::jsonb)
    from user_posters up
    join poster_items pi on pi.id = up.item_id
   where up.user_id = auth.uid() and up.reset_at is null;
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
  if not exists (select 1 from user_posters where user_id = v_uid and item_id = p_item_id and effect = p_effect and reset_at is null) then
    raise exception 'not_owned';
  end if;
  select * into v_item from poster_items where id = p_item_id;
  insert into user_poster_equips (user_id, media_type, tmdb_id, item_id, effect, active)
  values (v_uid, v_item.media_type, v_item.tmdb_id, p_item_id, p_effect, true)
  on conflict (user_id, media_type, tmdb_id) do update set item_id = excluded.item_id, effect = excluded.effect, active = true, equipped_at = now();
  return jsonb_build_object('media_type', v_item.media_type, 'tmdb_id', v_item.tmdb_id, 'item_id', p_item_id, 'effect', p_effect);
end;
$$;

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
                join user_posters up on up.user_id = e.user_id and up.item_id = e.item_id and up.effect = e.effect and up.reset_at is null
               where e.user_id = p_user_id and e.active), '[]'::jsonb)
  end;
$$;
