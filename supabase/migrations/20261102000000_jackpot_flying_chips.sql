-- Poster Jackpot: fichas voadoras (02/11/2026).
--
-- Pedido do Bruno: como os itens que atravessam a tela no Howrse, de vez em
-- quando uma ficha do Jackpot passa voando pelo site e quem tocar nela ganha
-- +1 ficha comum (jackpot_wallets.tickets). Tem que ser RARO e quem manda é
-- o banco (ninguém ganha ficha só porque o navegador pediu):
--
--   • no máximo uma ficha voadora por pessoa por dia (dia de São Paulo);
--   • a primeira consulta do dia joga o dado: ~45% dos dias têm ficha. Se
--     tiver, sorteia a hora: entre 90 s e 20 min depois dessa consulta (para
--     ela aparecer "enquanto a pessoa usa o site"). Se a pessoa não estiver
--     no site nessa hora, a ficha espera e voa na próxima vez que ela
--     aparecer no mesmo dia;
--   • um voo só por dia: o site avisa a decolagem (jackpot_ufo_launch) e a
--     ficha só pode ser pega até 25 s depois disso (o voo dura ~12 s; o
--     resto é folga para a rede). Não pegou, foi embora ("missed");
--   • a pega (jackpot_ufo_catch) vale uma vez só, com a linha travada (sem
--     ficha em dobro com dois toques ou duas abas);
--   • bots e quem não tem o Jackpot liberado nunca veem ficha voadora.
--
-- A tabela não é acessível pelo site: tudo passa pelas três funções abaixo
-- (security definer, só para quem está logado).

create table if not exists public.jackpot_ufo_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  will_fly boolean not null,
  fly_after timestamptz,
  launched_at timestamptz,
  caught_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, day),
  check (not will_fly or fly_after is not null),
  check (caught_at is null or launched_at is not null)
);

alter table public.jackpot_ufo_days enable row level security;
revoke all on public.jackpot_ufo_days from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ajudantes
-- ---------------------------------------------------------------------------

-- O dia de hoje em São Paulo (a mesma virada de jackpot_today_start()).
create or replace function public.jackpot_ufo_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Quanto tempo a ficha pode ser pega depois da decolagem: o voo na tela dura
-- ~12 s; os outros 13 s são folga para a rede (a decolagem e a pega são duas
-- idas ao banco).
create or replace function public.jackpot_ufo_window()
returns interval
language sql
immutable
set search_path = public
as $$
  select interval '25 seconds';
$$;

-- Esta pessoa pode ver fichas voadoras? (Jackpot liberado e não é bot.)
create or replace function public.jackpot_ufo_allowed(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select jackpot_enabled(p_uid)
     and not exists (select 1 from bot_accounts b where b.user_id = p_uid);
$$;

-- ---------------------------------------------------------------------------
-- O estado de hoje (e o dado do dia, na primeira consulta)
-- ---------------------------------------------------------------------------
--
-- Devolve { state, ... }:
--   none      — sem ficha hoje (o dado disse não, Jackpot fechado ou bot);
--   scheduled — vai voar: fly_at (hora do banco) e fly_in (segundos até lá,
--               para o site não depender do relógio do aparelho);
--   due       — já pode voar (o site escolhe o momento e chama o launch);
--   flying    — decolou e ainda dá para pegar: expires_at / expires_in;
--   caught    — já foi pega hoje;
--   missed    — voou e ninguém pegou (só volta amanhã, talvez).
create or replace function public.jackpot_ufo_status()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := jackpot_ufo_today();
  v_day_end timestamptz := jackpot_today_start() + interval '1 day';
  v_fly boolean;
  v_after timestamptz;
  r jackpot_ufo_days;
begin
  if v_uid is null or not jackpot_ufo_allowed(v_uid) then
    return jsonb_build_object('state', 'none');
  end if;

  select * into r from jackpot_ufo_days where user_id = v_uid and day = v_day;
  if not found then
    -- O dado do dia: ~45% de chance. A hora fica entre 90 s e 20 min a
    -- partir de agora, mas nunca depois do fim do dia (perto da meia-noite
    -- ela já nasce pronta para voar).
    v_fly := random() < 0.45;
    if v_fly then
      v_after := least(
        now() + make_interval(secs => 90 + floor(random() * (1200 - 90 + 1))),
        greatest(now(), v_day_end - interval '1 minute')
      );
    end if;
    insert into jackpot_ufo_days (user_id, day, will_fly, fly_after)
    values (v_uid, v_day, v_fly, v_after)
    on conflict (user_id, day) do nothing;
    -- Duas abas abrindo ao mesmo tempo: vale o dado de quem gravou primeiro.
    select * into r from jackpot_ufo_days where user_id = v_uid and day = v_day;
  end if;

  if not r.will_fly then
    return jsonb_build_object('state', 'none');
  end if;
  if r.caught_at is not null then
    return jsonb_build_object('state', 'caught', 'caught_at', r.caught_at);
  end if;
  if r.launched_at is not null then
    if now() <= r.launched_at + jackpot_ufo_window() then
      return jsonb_build_object(
        'state', 'flying',
        'expires_at', r.launched_at + jackpot_ufo_window(),
        'expires_in', round(extract(epoch from (r.launched_at + jackpot_ufo_window() - now()))::numeric, 1)
      );
    end if;
    return jsonb_build_object('state', 'missed');
  end if;
  if r.fly_after > now() then
    return jsonb_build_object(
      'state', 'scheduled',
      'fly_at', r.fly_after,
      'fly_in', round(extract(epoch from (r.fly_after - now()))::numeric, 1)
    );
  end if;
  return jsonb_build_object('state', 'due');
end;
$$;

-- ---------------------------------------------------------------------------
-- A decolagem: a ficha começa a atravessar a tela
-- ---------------------------------------------------------------------------
--
-- Só quando a hora já chegou e ela ainda não voou hoje. Um voo por dia: se
-- não for pega até expires_at, foi embora.
create or replace function public.jackpot_ufo_launch()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r jackpot_ufo_days;
begin
  if v_uid is null or not jackpot_ufo_allowed(v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'no_chip');
  end if;

  select * into r from jackpot_ufo_days
   where user_id = v_uid and day = jackpot_ufo_today()
   for update;
  if not found or not r.will_fly then
    return jsonb_build_object('ok', false, 'reason', 'no_chip');
  end if;
  if r.launched_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_launched');
  end if;
  if r.fly_after > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_due');
  end if;

  update jackpot_ufo_days set launched_at = now()
   where user_id = v_uid and day = r.day
  returning * into r;

  return jsonb_build_object(
    'ok', true,
    'expires_at', r.launched_at + jackpot_ufo_window(),
    'expires_in', round(extract(epoch from jackpot_ufo_window())::numeric, 1)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- A pega: +1 ficha comum
-- ---------------------------------------------------------------------------
--
-- Só depois da decolagem, dentro da janela e uma vez só. A linha do dia fica
-- travada até o fim (dois toques ou duas abas: o segundo encontra caught_at
-- preenchido).
create or replace function public.jackpot_ufo_catch()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r jackpot_ufo_days;
  w jackpot_wallets;
begin
  if v_uid is null or not jackpot_ufo_allowed(v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'no_chip');
  end if;

  select * into r from jackpot_ufo_days
   where user_id = v_uid and day = jackpot_ufo_today()
   for update;
  if not found or not r.will_fly then
    return jsonb_build_object('ok', false, 'reason', 'no_chip');
  end if;
  if r.caught_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_caught');
  end if;
  if r.launched_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_flying');
  end if;
  if now() > r.launched_at + jackpot_ufo_window() then
    return jsonb_build_object('ok', false, 'reason', 'gone');
  end if;

  update jackpot_ufo_days set caught_at = now()
   where user_id = v_uid and day = r.day;

  w := jackpot_wallet_row(v_uid);
  update jackpot_wallets set tickets = tickets + 1, updated_at = now()
   where user_id = v_uid
  returning * into w;

  return jsonb_build_object('ok', true, 'tickets', w.tickets);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: as ajudantes ficam fechadas; as três chamadas, só para quem
-- está logado.
-- ---------------------------------------------------------------------------

revoke all on function public.jackpot_ufo_today() from public, anon, authenticated;
revoke all on function public.jackpot_ufo_window() from public, anon, authenticated;
revoke all on function public.jackpot_ufo_allowed(uuid) from public, anon, authenticated;
revoke all on function public.jackpot_ufo_status() from public, anon;
revoke all on function public.jackpot_ufo_launch() from public, anon;
revoke all on function public.jackpot_ufo_catch() from public, anon;
grant execute on function public.jackpot_ufo_status() to authenticated;
grant execute on function public.jackpot_ufo_launch() to authenticated;
grant execute on function public.jackpot_ufo_catch() to authenticated;
