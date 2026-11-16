-- Conta Diretor, etapa A: a base (16/11/2026).
--
-- Pedido do Bruno: uma "Conta Diretor" que não aparece na comunidade e tem acesso
-- a tudo pelo próprio site (desbloqueáveis, menus de teste, prévia de eventos,
-- prateleiras, pôsteres da roleta). Cinco agentes mapearam o site; esta migração
-- é a fundação que eles pediram, e nada nela concede nada a ninguém ainda:
--
--   * esquema privado `director`, sem USAGE para anon, authenticated e service_role:
--     o site nunca lê nem grava ali diretamente, só por funções que conferem o papel;
--   * director.accounts: quem é diretor. A conta é escolhida SÓ por SQL (console ou
--     migração), nunca pelo site: o gatilho de trava recusa qualquer gravação que
--     venha de uma requisição do site, menos a renúncia da própria conta (pânico);
--   * is_director(nível): 1 = papel ativo; 2 = papel + código do app autenticador
--     nesta sessão (aal2); 3 = nível 2 + código digitado nos últimos 15 minutos.
--     Mudar o site para todos vai exigir 2; destrutivo ou em massa, 3;
--   * diário de auditoria que só aceita linhas novas (o "desfazer" só marca);
--   * is_hidden_account(uid): a regra única do fantasma. Ela vale mesmo depois da
--     renúncia: a conta continua escondida e fora dos prêmios;
--   * fantasma na leitura crua: políticas RESTRITIVAS (somam-se às que já existem)
--     em profiles, reviews, user_special_tags, lists, list_movies e follows, e a view
--     public_profiles passa a respeitar a RLS (security_invoker);
--   * sem laços sociais: amizade, sussurro, story, troca, convite e mesa de pôquer
--     com a conta escondida não nascem. Se é ela quem tenta, erro claro; se é outra
--     pessoa ou um cron (bots), a linha é descartada em silêncio, para não revelar
--     nada e não derrubar o lote dos bots;
--   * prize_ineligible(uid): bots e diretor fora de prêmios e placares (ligada nos
--     pontos de prêmio na etapa B);
--   * de quebra, a brecha antiga do INSERT em profiles: quem cria o próprio perfil
--     pelo site podia nascer Premium vitalício. Agora as mesmas colunas que a guarda
--     de UPDATE protege nascem com o valor padrão.
--
-- A identidade da conta diretor NÃO entra no repositório (ele é público): a linha
-- em director.accounts é gravada à parte, pelo console.

create schema if not exists director;
revoke all on schema director from public, anon, authenticated, service_role;
comment on schema director is
  'Conta Diretor (16/11/2026). Privado: o site só chega aqui por funções public.director_* que conferem o papel.';

-- ---------------------------------------------------------------------------
-- 1. Quem é diretor
-- ---------------------------------------------------------------------------
create table if not exists director.accounts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  hidden      boolean not null default true,   -- fantasma: some da comunidade
  require_mfa boolean not null default true,   -- níveis 2 e 3 só com o app autenticador
  granted_at  timestamptz not null default now(),
  granted_via text not null,                   -- por exemplo 'sql:2026-11-16' (nunca 'site')
  revoked_at  timestamptz,
  revoked_via text,
  note        text
);
-- no máximo um diretor ativo por vez
create unique index if not exists accounts_one_active on director.accounts ((true)) where revoked_at is null;
alter table director.accounts enable row level security;
revoke all on director.accounts from public, anon, authenticated, service_role;

-- Trava: dentro de uma requisição do site (PostgREST ou função de borda, inclusive
-- passando por função SECURITY DEFINER) só vale a renúncia da própria linha.
-- Fora dela (migração, console) tudo vale.
create or replace function director.guard_accounts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(current_setting('request.jwt.claims', true), '') is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and old.revoked_at is null and new.revoked_at is not null
     and old.user_id = auth.uid()
     and (to_jsonb(new) - 'revoked_at' - 'revoked_via') = (to_jsonb(old) - 'revoked_at' - 'revoked_via') then
    new.revoked_via := 'site:renuncia';
    return new;
  end if;
  raise exception 'director_accounts_locked' using errcode = '42501';
end;
$$;

create or replace trigger guard_accounts before insert or update or delete on director.accounts
  for each row execute function director.guard_accounts();
create or replace trigger guard_accounts_truncate before truncate on director.accounts
  for each statement execute function director.guard_accounts();

-- ---------------------------------------------------------------------------
-- 2. O papel e os níveis
-- ---------------------------------------------------------------------------
-- Usada só por dentro das funções definer (o site não chama direto).
create or replace function public.is_director(p_level int default 1)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from director.accounts a
     where a.user_id = (select auth.uid())
       and a.revoked_at is null
       and (p_level < 2 or not a.require_mfa
            or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2')
       and (p_level < 3 or not a.require_mfa
            or exists (select 1
                         from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) m
                        where m ->> 'method' = 'totp'
                          and to_timestamp((m ->> 'timestamp')::bigint) > now() - interval '15 minutes'))
  );
$$;
revoke all on function public.is_director(int) from public, anon, authenticated;

create or replace function director.require(p_level int)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_director(p_level) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
revoke all on function director.require(int) from public;

-- O único sinal para a tela: responde só sobre a própria conta, com a mesma forma
-- para todo mundo. É só uma dica de tela (mostrar ou não o menu); cada função de
-- diretor confere de novo no banco.
create or replace function public.get_director_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('director', public.is_director(1),
                            'mfa',      public.is_director(2),
                            'recent',   public.is_director(3));
$$;
revoke all on function public.get_director_state() from public, anon;
grant execute on function public.get_director_state() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Diário de auditoria (só aceita linhas novas)
-- ---------------------------------------------------------------------------
create table if not exists director.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid not null,
  action      text not null,          -- 'pool.add', 'poster.create', 'event.preview', 'undo'…
  target_kind text not null,          -- 'recommendation_pools', 'poster_items', …
  target_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  reversible  boolean not null default false,
  undone_at   timestamptz,
  undone_by   bigint references director.audit_log(id),
  aal         text,
  session_id  text,
  ip          text,
  user_agent  text
);
create index if not exists audit_log_actor_action_at on director.audit_log (actor, action, at desc);
alter table director.audit_log enable row level security;
revoke all on director.audit_log from public, anon, authenticated, service_role;

create or replace function director.audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'audit_append_only' using errcode = '42501';
  end if;
  -- UPDATE: só marcar "desfeito", uma vez
  if old.undone_at is null and new.undone_at is not null
     and (to_jsonb(new) - 'undone_at' - 'undone_by') = (to_jsonb(old) - 'undone_at' - 'undone_by') then
    return new;
  end if;
  raise exception 'audit_append_only' using errcode = '42501';
end;
$$;

create or replace trigger audit_append_only before update or delete on director.audit_log
  for each row execute function director.audit_append_only();
create or replace trigger audit_no_truncate before truncate on director.audit_log
  for each statement execute function director.audit_append_only();

create or replace function director.log(p_action text, p_kind text, p_target text,
  p_before jsonb, p_after jsonb, p_reason text, p_reversible boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_id bigint;
begin
  insert into director.audit_log (actor, action, target_kind, target_id, before, after, reason, reversible,
                                  aal, session_id, ip, user_agent)
  values (auth.uid(), p_action, p_kind, p_target, p_before, p_after, left(p_reason, 500), p_reversible,
          auth.jwt() ->> 'aal', auth.jwt() ->> 'session_id',
          split_part(h ->> 'x-forwarded-for', ',', 1), left(h ->> 'user-agent', 300))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function director.log(text, text, text, jsonb, jsonb, text, boolean) from public;

-- Limite por ação e um teto geral de 200 ações por hora.
create or replace function director.rate(p_action text, p_max int, p_window interval)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from director.audit_log
       where actor = auth.uid() and action = p_action and at > now() - p_window) >= p_max
  or (select count(*) from director.audit_log
       where actor = auth.uid() and at > now() - interval '1 hour') >= 200 then
    raise exception 'rate_limited' using errcode = '42501';
  end if;
end;
$$;
revoke all on function director.rate(text, int, interval) from public;

-- ---------------------------------------------------------------------------
-- 4. Fantasma e prêmios
-- ---------------------------------------------------------------------------
-- Precisa de EXECUTE para anon e authenticated porque as políticas de RLS rodam
-- como quem consulta. Responde só sim/não sobre um id que a pessoa já tem.
create or replace function public.is_hidden_account(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id is not null and exists (select 1 from director.accounts a where a.user_id = p_id and a.hidden);
$$;
revoke all on function public.is_hidden_account(uuid) from public;
grant execute on function public.is_hidden_account(uuid) to anon, authenticated, service_role;

-- Bots e diretor (mesmo depois da renúncia) não ganham prêmio nem entram em placar.
-- Só para dentro das funções de prêmio; não é portão de acesso (o diretor joga
-- para testar, só não ganha).
create or replace function public.prize_ineligible(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is null
      or exists (select 1 from public.bot_accounts b where b.user_id = p_uid)
      or exists (select 1 from director.accounts a where a.user_id = p_uid);
$$;
revoke all on function public.prize_ineligible(uuid) from public, anon, authenticated;

-- Botão de pânico: a própria conta larga o papel. Mesma resposta para quem não é
-- diretor. O papel só volta por SQL; a conta continua escondida.
create or replace function public.director_self_revoke()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update director.accounts set revoked_at = now() where user_id = v_uid and revoked_at is null;
  if found then
    perform director.log('role.self_revoke', 'director.accounts', v_uid::text, null, null, 'botão de pânico', false);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.director_self_revoke() from public, anon;
grant execute on function public.director_self_revoke() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sem laços sociais com a conta escondida
-- ---------------------------------------------------------------------------
-- tg_argv: as duas colunas de pessoa da tabela. Avisos para si mesmo (lado nulo
-- ou os dois lados iguais) continuam valendo.
create or replace function director.no_ghost_edges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a uuid := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  b uuid := nullif(to_jsonb(new) ->> tg_argv[1], '')::uuid;
begin
  if a is null or b is null or a = b then
    return new;
  end if;
  if not (public.is_hidden_account(a) or public.is_hidden_account(b)) then
    return new;
  end if;
  if public.is_hidden_account(auth.uid()) then
    raise exception 'ghost_no_social' using errcode = '42501';
  end if;
  return null;  -- outra pessoa ou um cron mirando a conta escondida: descarta sem revelar
end;
$$;
revoke all on function director.no_ghost_edges() from public;

create or replace trigger zz_no_ghost_edges before insert or update of requester_id, addressee_id on public.friendships
  for each row execute function director.no_ghost_edges('requester_id', 'addressee_id');
create or replace trigger zz_no_ghost_edges before insert or update of from_user_id, to_user_id on public.friend_indications
  for each row execute function director.no_ghost_edges('from_user_id', 'to_user_id');
create or replace trigger zz_no_ghost_edges before insert or update of follower_id, following_id on public.follows
  for each row execute function director.no_ghost_edges('follower_id', 'following_id');
create or replace trigger zz_no_ghost_edges before insert or update of author_id, owner_id on public.feed_story_comments
  for each row execute function director.no_ghost_edges('author_id', 'owner_id');
create or replace trigger zz_no_ghost_edges before insert or update of user_id, owner_id on public.feed_story_likes
  for each row execute function director.no_ghost_edges('user_id', 'owner_id');
create or replace trigger zz_no_ghost_edges before insert or update of viewer_id, owner_id on public.feed_story_views
  for each row execute function director.no_ghost_edges('viewer_id', 'owner_id');
create or replace trigger zz_no_ghost_edges before insert or update of from_user, to_user on public.poster_trades
  for each row execute function director.no_ghost_edges('from_user', 'to_user');
create or replace trigger zz_no_ghost_edges before insert or update of user_id, partner_id on public.game_tag_trade_partners
  for each row execute function director.no_ghost_edges('user_id', 'partner_id');
create or replace trigger zz_no_ghost_edges before insert or update of invitee_id, inviter_id on public.invite_redemptions
  for each row execute function director.no_ghost_edges('invitee_id', 'inviter_id');
create or replace trigger zz_no_ghost_edges before insert or update of user_id, invited_by on public.poker_room_members
  for each row execute function director.no_ghost_edges('user_id', 'invited_by');

-- ---------------------------------------------------------------------------
-- 6. Fantasma na leitura crua (políticas restritivas: somam-se com E)
-- ---------------------------------------------------------------------------
create policy ghost_hide on public.profiles as restrictive for select to anon, authenticated
  using (id = (select auth.uid()) or not public.is_hidden_account(id));

create policy ghost_hide on public.reviews as restrictive for select to anon, authenticated
  using (user_id = (select auth.uid()) or not public.is_hidden_account(user_id));

create policy ghost_hide on public.user_special_tags as restrictive for select to anon, authenticated
  using (user_id = (select auth.uid()) or not public.is_hidden_account(user_id));

create policy ghost_hide on public.lists as restrictive for select to anon, authenticated
  using (user_id = (select auth.uid()) or not public.is_hidden_account(user_id));

-- Os títulos de uma lista seguem a lista (a consulta em lists já passa pela regra acima).
create policy ghost_hide on public.list_movies as restrictive for select to anon, authenticated
  using (exists (select 1 from public.lists l where l.id = list_movies.list_id));

create policy ghost_hide on public.follows as restrictive for select to anon, authenticated
  using ((follower_id = (select auth.uid()) or not public.is_hidden_account(follower_id))
     and (following_id = (select auth.uid()) or not public.is_hidden_account(following_id)));

-- A view passa a respeitar a RLS de profiles (e sai o erro "security definer view" do advisor).
alter view public.public_profiles set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 7. Brecha antiga: perfil criado pelo site nascia com o que a pessoa quisesse
-- ---------------------------------------------------------------------------
-- O perfil normal nasce em handle_new_user (dono postgres, não passa aqui). A
-- política "insert own profile" deixava o site criar o próprio perfil com
-- lifetime_premium, pontos ou molduras. Mesmas colunas da guarda de UPDATE
-- (guard_profile_protected_columns), com os valores padrão da tabela.
create or replace function public.guard_profile_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.plan_type := 'free';
    new.lifetime_premium := false;
    new.ai_review_daily_count := 0;
    new.last_ai_review_at := null;
    new.pontos_e := 0; new.pontos_i := 0; new.pontos_c := 0; new.pontos_s := 0; new.pontos_r := 0;
    new.personalidade_completa := null;
    new.persona_scores := null;
    new.persona_counted := 0;
    new.persona_updated_at := null;
    new.avatar_frame := '';
    new.banner := '';
    new.text_effect := 'default';
    new.card_style := 'default';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_insert() from public, anon, authenticated;

create or replace trigger a_guard_profile_insert before insert on public.profiles
  for each row execute function public.guard_profile_insert();
