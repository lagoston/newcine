-- O amigo secreto do Natal: a raspadinha (28/11/2026).
--
-- Pedido do Bruno (25/11, 21h08): "o primeiro desafio ao invés de um sussurrar
-- deve ser um presentinho de verdade, que pode ser dado de 'amigo secreto' de
-- Natal para um amigo que só poderá receber um. Uma raspadinha de Natal que
-- poderá dar até 3 fichas especiais, e com um mínimo de 2 fichas comuns."
--
-- Como funciona:
--   * cada pessoa DÁ uma raspadinha por Natal, a um amigo (amizade aceita);
--   * cada pessoa GANHA no máximo uma por Natal: quem já ganhou não pode ser
--     escolhido de novo;
--   * quem não tem amigo livre (todos já ganharam, ou não tem amigo) não fica
--     travado: o Oráculo entrega a raspadinha dela a alguém de verdade que
--     ainda não ganhou (via = 'oracle');
--   * quem ganhou raspa: 2 fichas comuns garantidas e de 0 a 3 fichas
--     especiais, uma em cada janela da raspadinha. As chances ficam na tabela
--     secret_friend_prizes (dá para mudar sem mexer em função nenhuma);
--   * o amigo é secreto: quem ganhou só descobre quem deu depois de raspar;
--   * robôs da comunidade não dão nem ganham.
--
-- A missão: dar a raspadinha cumpre a 1ª missão do Natal (🎁 Secret Friend).
-- Para o banco ela continua sendo uma ação do tipo 'whisper' (com movie_id 0,
-- "nenhum filme"): assim seasonal_events.steps, get_seasonal_event_state e as
-- funções das missões NÃO mudam, e o APK antigo, que só sabe sussurrar um filme
-- da lista, continua cumprindo a missão do jeito dele.
--
-- O ensaio da Conta Diretor (evento fora do ar, com a prévia ligada): "dar"
-- só marca a missão no ensaio e "raspar" sorteia um prêmio de mostruário;
-- ninguém recebe nada e nenhuma ficha é creditada.
--
-- Só acrescenta: duas tabelas, duas funções de apoio e três funções para a
-- tela. Nada do Jackpot é tocado além de somar fichas na carteira.

create table if not exists public.secret_friend_gifts (
  event_id text not null default 'christmas',
  edition integer not null,
  from_user uuid not null references auth.users (id) on delete cascade,
  -- null: ninguém estava livre para receber (a missão vale do mesmo jeito)
  to_user uuid references auth.users (id) on delete set null,
  via text not null default 'friend' check (via in ('friend', 'oracle')),
  created_at timestamptz not null default now(),
  scratched_at timestamptz,
  prize_tickets integer,
  prize_special integer,
  -- em quais das três janelas (0, 1, 2) saiu ficha especial
  spots integer[],
  primary key (event_id, edition, from_user)
);

-- "um amigo que só poderá receber um": uma raspadinha por pessoa por edição
create unique index if not exists secret_friend_gifts_one_per_receiver
  on public.secret_friend_gifts (event_id, edition, to_user)
  where to_user is not null;

alter table public.secret_friend_gifts enable row level security;
revoke all on public.secret_friend_gifts from anon, authenticated;

-- As chances da raspadinha: quantas fichas especiais saem (0 a 3) e com que
-- peso. As fichas comuns são as garantidas ("um mínimo de 2 fichas comuns").
create table if not exists public.secret_friend_prizes (
  special integer primary key check (special between 0 and 3),
  tickets integer not null default 2 check (tickets >= 2),
  weight integer not null check (weight >= 0)
);

insert into public.secret_friend_prizes (special, tickets, weight)
values (0, 2, 40), (1, 2, 38), (2, 2, 17), (3, 2, 5)
on conflict (special) do nothing;

alter table public.secret_friend_prizes enable row level security;
revoke all on public.secret_friend_prizes from anon, authenticated;

-- Em que pé está o Natal para quem chama: a edição, se está no ar e se é o
-- ensaio da Conta Diretor (a mesma regra de get_seasonal_event_state).
create or replace function private.secret_friend_ctx(p_preview text, out edition integer, out live boolean, out trial boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  w record;
  v_enabled boolean;
begin
  select se.enabled into v_enabled from public.seasonal_events se where se.id = 'christmas';
  select * into w from public.seasonal_event_window('christmas');
  edition := w.edition;
  live := coalesce(v_enabled, false) and coalesce(w.is_active, false);
  trial := not live and p_preview = 'christmas' and auth.uid() is not null and public.is_director(1);
end;
$fn$;

-- O sorteio de uma raspadinha: as fichas e as janelas premiadas.
create or replace function private.secret_friend_draw(out tickets integer, out special integer, out spots integer[])
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_total numeric;
  v_roll numeric := random();
  v_acc numeric := 0;
  p record;
begin
  select coalesce(sum(weight), 0) into v_total from public.secret_friend_prizes;
  for p in select * from public.secret_friend_prizes order by special loop
    v_acc := v_acc + p.weight;
    if v_total > 0 and v_roll * v_total < v_acc then
      tickets := p.tickets;
      special := p.special;
      exit;
    end if;
  end loop;
  if tickets is null then
    tickets := 2;
    special := 0;
  end if;
  select coalesce(array_agg(q.s order by q.s), '{}'::integer[])
    into spots
    from (select s from generate_series(0, 2) s order by random() limit special) q;
end;
$fn$;

-- O cartãozinho de uma pessoa (o que a tela precisa para desenhar o avatar).
create or replace function private.secret_friend_person(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
           'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
           'avatar_frame', p.avatar_frame, 'plan_type', p.plan_type)
    from public.profiles p
   where p.id = p_id;
$fn$;

revoke all on function private.secret_friend_ctx(text) from public, anon, authenticated;
revoke all on function private.secret_friend_draw() from public, anon, authenticated;
revoke all on function private.secret_friend_person(uuid) from public, anon, authenticated;

-- O estado do amigo secreto para quem está logado.
create or replace function public.get_secret_friend(p_preview text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  c record;
  g public.secret_friend_gifts%rowtype;
  v_sent jsonb;
  v_received jsonb;
  v_friends jsonb;
  v_trial_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into c from private.secret_friend_ctx(p_preview);

  if c.trial then
    v_trial_at := director.trial_started_at(v_uid, 'christmas', c.edition);
    if exists (select 1 from director.event_trial_actions a
                where a.user_id = v_uid and a.event_id = 'christmas' and a.edition = c.edition
                  and a.kind = 'whisper' and a.movie_id is null and a.created_at >= v_trial_at) then
      v_sent := jsonb_build_object('to', null, 'via', 'trial', 'scratched', false);
    end if;
    -- a raspadinha de mostruário: dá para raspar quantas vezes quiser
    v_received := jsonb_build_object('scratched', false, 'trial', true);
  else
    select * into g from public.secret_friend_gifts x
     where x.event_id = 'christmas' and x.edition = c.edition and x.from_user = v_uid;
    if found then
      v_sent := jsonb_build_object(
        'to', case when g.via = 'friend' then private.secret_friend_person(g.to_user) end,
        'via', g.via,
        'at', g.created_at,
        'scratched', g.scratched_at is not null);
    end if;

    -- a que eu ganhei: a desta edição ou uma antiga ainda por raspar
    select * into g from public.secret_friend_gifts x
     where x.event_id = 'christmas' and x.to_user = v_uid
       and (x.edition = c.edition or x.scratched_at is null)
     order by x.edition desc
     limit 1;
    if found then
      v_received := jsonb_build_object('scratched', g.scratched_at is not null, 'at', g.created_at, 'edition', g.edition);
      if g.scratched_at is not null then
        -- o amigo só deixa de ser secreto depois da raspada
        v_received := v_received || jsonb_build_object(
          'tickets', g.prize_tickets,
          'special', g.prize_special,
          'spots', to_jsonb(coalesce(g.spots, '{}'::integer[])),
          'from', private.secret_friend_person(g.from_user));
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(s.x order by (s.x ->> 'taken')::boolean, lower(s.x ->> 'username')), '[]'::jsonb)
    into v_friends
    from (
      select jsonb_build_object(
               'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
               'avatar_frame', p.avatar_frame, 'plan_type', p.plan_type,
               'taken', exists (select 1 from public.secret_friend_gifts t
                                 where t.event_id = 'christmas' and t.edition = c.edition and t.to_user = p.id)) as x
        from public.friendships f
        join public.profiles p on p.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
       where f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid)
         and not exists (select 1 from public.bot_accounts b where b.user_id = p.id)
    ) s;

  return jsonb_build_object(
    'v', 1,
    'open', c.live or c.trial,
    'trial', c.trial,
    'edition', c.edition,
    'sent', v_sent,
    'received', v_received,
    'friends', v_friends);
end;
$fn$;

-- Dar a raspadinha. p_to = o amigo escolhido; sem p_to, o Oráculo entrega (só
-- quando nenhum amigo está livre).
create or replace function public.secret_friend_send(p_to uuid default null, p_preview text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  c record;
  v_to uuid := p_to;
  v_via text := 'friend';
  v_free integer;
  v_trial_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.bot_accounts b where b.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'bot');
  end if;
  select * into c from private.secret_friend_ctx(p_preview);

  if c.trial then
    v_trial_at := director.trial_started_at(v_uid, 'christmas', c.edition);
    if not exists (select 1 from director.event_trial_actions a
                    where a.user_id = v_uid and a.event_id = 'christmas' and a.edition = c.edition
                      and a.kind = 'whisper' and a.movie_id is null and a.created_at >= v_trial_at) then
      insert into director.event_trial_actions (user_id, event_id, edition, kind, movie_id)
      values (v_uid, 'christmas', c.edition, 'whisper', null);
    end if;
    return jsonb_build_object('ok', true, 'trial', true, 'via', 'trial', 'to', null);
  end if;

  if not c.live then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;
  if exists (select 1 from public.secret_friend_gifts x
              where x.event_id = 'christmas' and x.edition = c.edition and x.from_user = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_sent');
  end if;

  if v_to is not null then
    if v_to = v_uid
       or not public.are_friends(v_uid, v_to)
       or exists (select 1 from public.bot_accounts b where b.user_id = v_to) then
      return jsonb_build_object('ok', false, 'error', 'not_friend');
    end if;
    if exists (select 1 from public.secret_friend_gifts x
                where x.event_id = 'christmas' and x.edition = c.edition and x.to_user = v_to) then
      return jsonb_build_object('ok', false, 'error', 'taken');
    end if;
  else
    select count(*) into v_free
      from public.friendships f
      join public.profiles p on p.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
     where f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid)
       and not exists (select 1 from public.bot_accounts b where b.user_id = p.id)
       and not exists (select 1 from public.secret_friend_gifts t
                        where t.event_id = 'christmas' and t.edition = c.edition and t.to_user = p.id);
    if v_free > 0 then
      return jsonb_build_object('ok', false, 'error', 'pick_friend');
    end if;
    -- Nenhum amigo livre: o Oráculo entrega a alguém de verdade que ainda não
    -- ganhou, de preferência quem andou por aqui nos últimos 60 dias.
    select p.id into v_to
      from public.profiles p
     where p.id <> v_uid
       and not exists (select 1 from public.bot_accounts b where b.user_id = p.id)
       and not exists (select 1 from director.accounts d where d.user_id = p.id and d.hidden)
       and not exists (select 1 from public.secret_friend_gifts t
                        where t.event_id = 'christmas' and t.edition = c.edition and t.to_user = p.id)
     order by exists (select 1 from public.user_movies um
                       where um.user_id = p.id and um.updated_at > now() - interval '60 days') desc,
              random()
     limit 1;
    v_via := 'oracle';
  end if;

  begin
    insert into public.secret_friend_gifts (event_id, edition, from_user, to_user, via)
    values ('christmas', c.edition, v_uid, v_to, v_via);
  exception when unique_violation then
    -- duas pessoas escolheram o mesmo amigo no mesmo instante (ou dois toques)
    if exists (select 1 from public.secret_friend_gifts x
                where x.event_id = 'christmas' and x.edition = c.edition and x.from_user = v_uid) then
      return jsonb_build_object('ok', false, 'error', 'already_sent');
    end if;
    return jsonb_build_object('ok', false, 'error', 'taken');
  end;

  -- a 1ª missão do Natal: a mesma ação do sussurro, sem filme
  insert into public.seasonal_event_actions (user_id, event_id, edition, kind, movie_id)
  values (v_uid, 'christmas', c.edition, 'whisper', 0)
  on conflict do nothing;
  perform public.grant_seasonal_tags(v_uid, 'christmas', c.edition);

  if v_to is not null then
    begin
      perform realtime.send(jsonb_build_object('kind', 'gift'), 'ping', 'user:' || v_to::text, true);
    exception when others then
      raise warning 'secret friend ping: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'via', v_via,
    'to', case when v_via = 'friend' then private.secret_friend_person(v_to) end);
end;
$fn$;

-- Raspar a raspadinha que eu ganhei: sorteia, credita as fichas e conta quem deu.
create or replace function public.secret_friend_scratch(p_preview text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  c record;
  d record;
  g public.secret_friend_gifts%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into c from private.secret_friend_ctx(p_preview);

  if c.trial then
    select * into d from private.secret_friend_draw();
    return jsonb_build_object('ok', true, 'trial', true, 'tickets', d.tickets, 'special', d.special,
                              'spots', to_jsonb(d.spots), 'from', null);
  end if;

  select * into g from public.secret_friend_gifts x
   where x.event_id = 'christmas' and x.to_user = v_uid and x.scratched_at is null
   order by x.edition desc
   limit 1
   for update;

  if not found then
    select * into g from public.secret_friend_gifts x
     where x.event_id = 'christmas' and x.to_user = v_uid
     order by x.edition desc
     limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'no_gift');
    end if;
    -- já raspada (dois toques, duas abas): devolve o mesmo resultado
    return jsonb_build_object('ok', true, 'already', true, 'tickets', g.prize_tickets, 'special', g.prize_special,
                              'spots', to_jsonb(coalesce(g.spots, '{}'::integer[])),
                              'from', private.secret_friend_person(g.from_user));
  end if;

  select * into d from private.secret_friend_draw();

  update public.secret_friend_gifts x
     set scratched_at = now(), prize_tickets = d.tickets, prize_special = d.special, spots = d.spots
   where x.event_id = g.event_id and x.edition = g.edition and x.from_user = g.from_user;

  insert into public.jackpot_wallets (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.jackpot_wallets w
     set tickets = w.tickets + d.tickets,
         special_tickets = w.special_tickets + d.special,
         updated_at = now()
   where w.user_id = v_uid;

  -- quem deu fica sabendo que a raspadinha foi raspada
  begin
    perform realtime.send(jsonb_build_object('kind', 'gift'), 'ping', 'user:' || g.from_user::text, true);
  exception when others then
    raise warning 'secret friend ping: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'tickets', d.tickets, 'special', d.special,
                            'spots', to_jsonb(d.spots), 'from', private.secret_friend_person(g.from_user));
end;
$fn$;

revoke all on function public.get_secret_friend(text) from public, anon;
revoke all on function public.secret_friend_send(uuid, text) from public, anon;
revoke all on function public.secret_friend_scratch(text) from public, anon;
grant execute on function public.get_secret_friend(text) to authenticated, service_role;
grant execute on function public.secret_friend_send(uuid, text) to authenticated, service_role;
grant execute on function public.secret_friend_scratch(text) to authenticated, service_role;

-- O texto da tag acompanha a missão nova (a tag-mãe vale para o site e para o
-- modal de Tags; o nome, o emoji e o id não mudam).
update public.special_tags
   set requirement_description_pt = 'Dê a raspadinha de Natal a um amigo secreto em dezembro',
       requirement_description = 'Give the Christmas scratch card to a secret friend in December',
       description_pt = 'Presenteou um amigo secreto com a raspadinha de Natal',
       description = 'Gave a secret friend the Christmas scratch card'
 where id = 'secret-friend';
