-- Poster Jackpot: tickets especiais que acumulam e convites (31/10/2026).
--
-- Pedido do Bruno: o ticket especial ganha um contador. O Premium continua
-- ganhando 1 por semana (esse não acumula: vale até domingo), mas agora dá
-- para ganhar especiais por outros meios, que ficam guardados na carteira
-- (jackpot_wallets.special_tickets). O primeiro meio é o convite: quem cria
-- a conta pelo link de alguém ganha 3 especiais, e quem convidou também.
--
-- Como o convite funciona:
--   • cada pessoa tem um código (invite_codes), criado na primeira vez que
--     abre o convite (get_my_invite);
--   • o link é https://www.cineoracle.com/auth?signup=true&convite=<código>;
--     o site guarda o código e o manda junto no cadastro
--     (raw_user_meta_data.invite_code);
--   • quando o e-mail da conta nova é confirmado, o gatilho
--     zz_jackpot_invite_on_confirm credita os dois (jackpot_apply_invite).
--     Se por algum motivo o código não foi no cadastro, o site tenta de novo
--     no primeiro login (redeem_invite);
--   • regras: conta criada há no máximo 7 dias, uma vez por conta, não vale
--     o próprio código nem conta de bot; quem convida ganha por até 10
--     amigos a cada 30 dias (o amigo ganha sempre).
--
-- Gasto no giro especial: primeiro o semanal do Premium (que venceria),
-- depois os guardados. jackpot_pulls.from_bonus marca os giros pagos com um
-- especial guardado (não contam como o semanal).

alter table public.jackpot_wallets add column if not exists special_tickets integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jackpot_wallets_special_tickets_check') then
    alter table public.jackpot_wallets add constraint jackpot_wallets_special_tickets_check check (special_tickets >= 0);
  end if;
end $$;
alter table public.jackpot_pulls add column if not exists from_bonus boolean not null default false;

create table if not exists public.invite_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;

create table if not exists public.invite_redemptions (
  invitee_id uuid primary key references public.profiles(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  inviter_rewarded boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists invite_redemptions_inviter on public.invite_redemptions (inviter_id, created_at desc);
alter table public.invite_redemptions enable row level security;

-- Código curto, sem letras que confundem (i, l, o, 0, 1).
create or replace function public.jackpot_new_invite_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v text;
begin
  loop
    v := '';
    for i in 1..7 loop
      v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from invite_codes where code = v);
  end loop;
  return v;
end;
$$;
revoke all on function public.jackpot_new_invite_code() from public, anon, authenticated;

-- O convite de quem está logado (cria o código na primeira vez).
create or replace function public.get_my_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not jackpot_enabled(v_uid) then
    raise exception 'jackpot_closed';
  end if;
  select code into v_code from invite_codes where user_id = v_uid;
  if v_code is null then
    insert into invite_codes (user_id, code) values (v_uid, jackpot_new_invite_code()) on conflict (user_id) do nothing;
    select code into v_code from invite_codes where user_id = v_uid;
  end if;
  return jsonb_build_object(
    'code', v_code,
    'reward', 3,
    'joined', (select count(*) from invite_redemptions where inviter_id = v_uid),
    'rewarded', (select count(*) from invite_redemptions where inviter_id = v_uid and inviter_rewarded)
  );
end;
$$;
revoke all on function public.get_my_invite() from public, anon;
grant execute on function public.get_my_invite() to authenticated;

-- Quem convidou (para a tela de cadastro mostrar "Fulano te convidou").
create or replace function public.get_invite_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p.id is null then null
              else jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url, 'reward', 3) end
    from (select 1) one
    left join invite_codes ic on ic.code = lower(trim(p_code))
    left join profiles p on p.id = ic.user_id;
$$;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- Credita o convite (os dois ganham 3 especiais). Não lança erro: devolve
-- o motivo quando não vale.
create or replace function public.jackpot_apply_invite(p_invitee uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  v_inviter uuid;
  v_created timestamptz;
  v_rewarded boolean;
begin
  if p_invitee is null or v_code = '' then
    return 'no_code';
  end if;
  select user_id into v_inviter from invite_codes where code = v_code;
  if v_inviter is null then
    return 'invalid';
  end if;
  if v_inviter = p_invitee then
    return 'self';
  end if;
  if exists (select 1 from invite_redemptions where invitee_id = p_invitee) then
    return 'already';
  end if;
  if exists (select 1 from bot_accounts where user_id = p_invitee) then
    return 'bot';
  end if;
  select created_at into v_created from auth.users where id = p_invitee;
  if v_created is null or v_created < now() - interval '7 days' then
    return 'not_new';
  end if;
  if not exists (select 1 from profiles where id = p_invitee) then
    return 'no_profile';
  end if;

  v_rewarded := (select count(*) from invite_redemptions
                  where inviter_id = v_inviter and inviter_rewarded and created_at > now() - interval '30 days') < 10;
  insert into invite_redemptions (invitee_id, inviter_id, code, inviter_rewarded)
  values (p_invitee, v_inviter, v_code, v_rewarded)
  on conflict (invitee_id) do nothing;
  if not found then
    return 'already';
  end if;

  perform jackpot_wallet_row(p_invitee);
  update jackpot_wallets set special_tickets = special_tickets + 3, updated_at = now() where user_id = p_invitee;
  if v_rewarded then
    perform jackpot_wallet_row(v_inviter);
    update jackpot_wallets set special_tickets = special_tickets + 3, updated_at = now() where user_id = v_inviter;
  end if;
  return 'ok';
end;
$$;
revoke all on function public.jackpot_apply_invite(uuid, text) from public, anon, authenticated;

-- Gatilho: e-mail confirmado (ou conta já criada confirmada) com código no
-- cadastro. Nunca derruba o cadastro.
create or replace function public.jackpot_invite_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null)
     and coalesce(new.raw_user_meta_data->>'invite_code', '') <> '' then
    begin
      perform jackpot_apply_invite(new.id, new.raw_user_meta_data->>'invite_code');
    exception when others then
      raise log 'jackpot_invite_on_confirm: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.jackpot_invite_on_confirm() from public, anon, authenticated;

create or replace trigger zz_jackpot_invite_on_confirm
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.jackpot_invite_on_confirm();

-- Segunda chance pelo site, no primeiro login (conta confirmada).
create or replace function public.redeem_invite(p_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select coalesce(nullif(trim(p_code), ''), raw_user_meta_data->>'invite_code') into v_code
    from auth.users where id = v_uid and email_confirmed_at is not null;
  v_status := jackpot_apply_invite(v_uid, v_code);
  return jsonb_build_object('status', v_status,
    'inviter', case when v_status = 'ok' then (select p.username from invite_redemptions r join profiles p on p.id = r.inviter_id where r.invitee_id = v_uid) end);
end;
$$;
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- O giro: o especial usa primeiro o semanal do Premium, depois os guardados.
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
  select * into w from jackpot_wallets where user_id = v_uid;

  if p_kind = 'special' then
    v_weekly := coalesce(is_premium_active(v_uid), false) and not exists (
      select 1 from jackpot_pulls p
       where p.user_id = v_uid and p.kind = 'special' and not p.voided and not p.from_bonus
         and p.created_at >= b.starts_at and p.created_at < b.ends_at);
    if not v_weekly and w.special_tickets < 1 then
      raise exception 'no_special';
    end if;
  else
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
  elsif not v_weekly then
    update jackpot_wallets set special_tickets = special_tickets - 1, updated_at = now() where user_id = v_uid;
  end if;

  insert into user_posters as up (user_id, item_id, effect) values (v_uid, v_item.id, v_effect)
  on conflict (user_id, item_id, effect) do update
     set reset_at = null, copies = 1, first_pulled_at = now(), last_pulled_at = now();
  insert into jackpot_pulls (user_id, kind, item_id, rarity, effect, duplicate, fragments_gained, from_bonus)
  values (v_uid, p_kind, v_item.id, v_item.rarity, v_effect, false, 0, p_kind = 'special' and not v_weekly);

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
         and p.created_at >= b.starts_at and p.created_at < b.ends_at)
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
