-- Eventos sazonais: Recomendações de Halloween (outubro) e de Natal
-- (dezembro), com espaço para outros temas e datas (04/10/2026).
--
-- Como funciona
--   • seasonal_events guarda cada evento: a janela que se repete todo ano
--     (mês/dia de início e de fim, no horário de Brasília), a seleção de
--     filmes (até 20, na ordem de exibição), as etapas que liberam as tags
--     especiais e a tag que decora o perfil.
--   • A "edição" de um evento é o ano em que ele começa (halloween 2026).
--   • seasonal_event_actions registra o que a pessoa fez DURANTE a edição
--     com os filmes da seleção: avaliou (rate), pôs na Watchlist
--     (watchlist) ou sussurrou para alguém (whisper). Quem grava são os
--     gatilhos em user_movies e friend_indications; o navegador não escreve.
--   • As tags são concedidas pelo servidor, em ordem: a etapa 2 só libera
--     depois da 1, e assim por diante. Uma vez conquistada, a tag é para
--     sempre (user_special_tags.is_permanent), como o Beta Tester.
--   • get_seasonal_event_state() devolve tudo que o site precisa: o evento
--     ativo (ou uma prévia pedida por ?evento=natal), a seleção com o
--     oráculo de cada filme, o progresso de cada etapa e se o perfil da
--     pessoa já está decorado.
--
-- Etapas
--   Halloween: avaliar 1, 2 e 3 filmes da seleção → Scary Clown 🤡,
--   Deadly Sleeping ⚰️ e Pumpkin Head 🎃 (esta decora o perfil).
--   Natal: pôr 3 filmes da seleção na Watchlist → Spark of Grace 🎄;
--   sussurrar 1 filme da seleção para um amigo → Secret Friend 🎁;
--   avaliar 2 filmes da seleção → Ho Ho Ho 🎅 (esta decora o perfil).

-- ---------------------------------------------------------------------------
-- 1. Textos em português das tags especiais
-- ---------------------------------------------------------------------------

alter table public.special_tags add column if not exists description_pt text;
alter table public.special_tags add column if not exists requirement_description_pt text;

update public.special_tags
set description_pt = 'Participou do beta do Cine Oracle',
    requirement_description_pt = 'Criar uma conta durante o beta'
where id = 'beta-tester' and description_pt is null;

-- ---------------------------------------------------------------------------
-- 2. As seis tags dos eventos (janela da edição 2026; nas próximas edições
--    get_seasonal_event_state() atualiza as datas sozinho)
-- ---------------------------------------------------------------------------

insert into public.special_tags
  (id, name, emoji, description, description_pt, requirement_description, requirement_description_pt, starts_at, ends_at, requirement_type, requirement_data)
values
  ('scary-clown', 'Scary Clown', '🤡',
   'Rated the 1st film of the Halloween selection', 'Avaliou o 1º filme da seleção de Halloween',
   'Rate 1 film from the Halloween selection in October', 'Avalie 1 filme da seleção de Halloween em outubro',
   timestamptz '2026-10-01 00:00 America/Sao_Paulo', timestamptz '2026-11-01 00:00 America/Sao_Paulo',
   'custom', '{"event": "halloween", "step": 1}'),
  ('deadly-sleeping', 'Deadly Sleeping', '⚰️',
   'Rated 2 films of the Halloween selection', 'Avaliou 2 filmes da seleção de Halloween',
   'Rate 2 films from the Halloween selection in October', 'Avalie 2 filmes da seleção de Halloween em outubro',
   timestamptz '2026-10-01 00:00 America/Sao_Paulo', timestamptz '2026-11-01 00:00 America/Sao_Paulo',
   'custom', '{"event": "halloween", "step": 2}'),
  ('pumpkin-head', 'Pumpkin Head', '🎃',
   'Completed the Halloween ritual — the profile gets dressed for Halloween', 'Completou o ritual de Halloween — o perfil se veste para o Halloween',
   'Rate 3 films from the Halloween selection in October', 'Avalie 3 filmes da seleção de Halloween em outubro',
   timestamptz '2026-10-01 00:00 America/Sao_Paulo', timestamptz '2026-11-01 00:00 America/Sao_Paulo',
   'custom', '{"event": "halloween", "step": 3}'),
  ('spark-of-grace', 'Spark of Grace', '🎄',
   'Lit up the Christmas tree with 3 films', 'Acendeu a árvore de Natal com 3 filmes',
   'Put 3 films from the Christmas selection on your Watchlist in December', 'Coloque 3 filmes da seleção de Natal na sua Watchlist em dezembro',
   timestamptz '2026-12-01 00:00 America/Sao_Paulo', timestamptz '2027-01-01 00:00 America/Sao_Paulo',
   'custom', '{"event": "christmas", "step": 1}'),
  ('secret-friend', 'Secret Friend', '🎁',
   'Gave a Christmas film to a friend', 'Presenteou um amigo com um filme de Natal',
   'Whisper a film from the Christmas selection to a friend in December', 'Sussurre um filme da seleção de Natal para um amigo em dezembro',
   timestamptz '2026-12-01 00:00 America/Sao_Paulo', timestamptz '2027-01-01 00:00 America/Sao_Paulo',
   'custom', '{"event": "christmas", "step": 2}'),
  ('ho-ho-ho', 'Ho Ho Ho', '🎅',
   'Completed the Christmas night — the profile gets dressed for Christmas', 'Completou a noite de Natal — o perfil se veste para o Natal',
   'Rate 2 films from the Christmas selection in December', 'Avalie 2 filmes da seleção de Natal em dezembro',
   timestamptz '2026-12-01 00:00 America/Sao_Paulo', timestamptz '2027-01-01 00:00 America/Sao_Paulo',
   'custom', '{"event": "christmas", "step": 3}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.seasonal_events (
  id text primary key,
  -- janela que se repete todo ano, no horário de Brasília (fim incluso);
  -- se o início vier depois do fim no calendário, a janela vira o ano
  start_month int not null check (start_month between 1 and 12),
  start_day int not null check (start_day between 1 and 31),
  end_month int not null check (end_month between 1 and 12),
  end_day int not null check (end_day between 1 and 31),
  -- filmes da seleção, na ordem de exibição (até 20)
  movie_ids jsonb not null default '[]'::jsonb,
  -- etapas em ordem: [{"tag": "...", "kind": "rate|watchlist|whisper", "count": n}]
  steps jsonb not null default '[]'::jsonb,
  -- tag que decora o perfil durante o evento
  decoration_tag text references public.special_tags(id),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.seasonal_events enable row level security;
create policy "Anyone can read seasonal events"
  on public.seasonal_events for select
  to anon, authenticated
  using (true);

create table if not exists public.seasonal_event_actions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id text not null references public.seasonal_events(id) on delete cascade,
  edition int not null,
  kind text not null check (kind in ('rate', 'watchlist', 'whisper')),
  movie_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id, edition, kind, movie_id)
);

alter table public.seasonal_event_actions enable row level security;
create policy "Users read own seasonal actions"
  on public.seasonal_event_actions for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Os dois eventos
-- ---------------------------------------------------------------------------

insert into public.seasonal_events (id, start_month, start_day, end_month, end_day, movie_ids, steps, decoration_tag)
values
  ('halloween', 10, 1, 10, 31,
   -- 16 com a palavra-chave "halloween" nas prateleiras dos oráculos e 4
   -- surpresas ligadas às tags: It (o palhaço), A Lenda do Cavaleiro Sem
   -- Cabeça (a cabeça de abóbora), Nosferatu e O Que Fazemos nas Sombras
   -- (o sono no caixão).
   '[948, 23202, 9479, 938614, 10439, 346364, 4011, 396535, 14836, 2668, 241848, 246741, 4232, 359246, 141, 36685, 11905, 426063, 297608, 9297]',
   '[{"tag": "scary-clown", "kind": "rate", "count": 1},
     {"tag": "deadly-sleeping", "kind": "rate", "count": 2},
     {"tag": "pumpkin-head", "kind": "rate", "count": 3}]',
   'pumpkin-head'),
  ('christmas', 12, 1, 12, 31,
   -- todos com a palavra-chave "christmas" nas prateleiras; as surpresas são
   -- Duro de Matar, Gremlins, Papai Noel das Cavernas e Edward Mãos de
   -- Tesoura, que se passam no Natal sem ser "filme de Natal".
   '[771, 1585, 508965, 562, 10719, 11661, 10437, 840430, 48395, 927, 508, 549053, 5825, 755339, 284, 850, 8871, 16938, 162, 5255]',
   '[{"tag": "spark-of-grace", "kind": "watchlist", "count": 3},
     {"tag": "secret-friend", "kind": "whisper", "count": 1},
     {"tag": "ho-ho-ho", "kind": "rate", "count": 2}]',
   'ho-ho-ho')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Funções
-- ---------------------------------------------------------------------------

-- Edição atual (ou a próxima, se o evento não está no ar) e a janela dela.
create or replace function public.seasonal_event_window(p_event_id text, p_at timestamptz default now())
returns table(edition int, starts_at timestamptz, ends_at timestamptz, is_active boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  e public.seasonal_events%rowtype;
  local_ts timestamp := p_at at time zone 'America/Sao_Paulo';
  y int := extract(year from (p_at at time zone 'America/Sao_Paulo'))::int;
  wraps boolean;
  s timestamp;
  f timestamp;
begin
  select * into e from public.seasonal_events se where se.id = p_event_id;
  if not found then
    return;
  end if;

  wraps := (e.start_month, e.start_day) > (e.end_month, e.end_day);
  s := make_timestamp(y, e.start_month, e.start_day, 0, 0, 0);

  if wraps then
    -- ainda no fim da edição que começou no ano passado?
    if local_ts < s and local_ts < make_timestamp(y, e.end_month, e.end_day, 0, 0, 0) + interval '1 day' then
      y := y - 1;
      s := make_timestamp(y, e.start_month, e.start_day, 0, 0, 0);
    end if;
    f := make_timestamp(y + 1, e.end_month, e.end_day, 0, 0, 0) + interval '1 day';
  else
    f := make_timestamp(y, e.end_month, e.end_day, 0, 0, 0) + interval '1 day';
    if local_ts >= f then
      -- a deste ano já passou: a próxima é no ano que vem
      y := y + 1;
      s := make_timestamp(y, e.start_month, e.start_day, 0, 0, 0);
      f := make_timestamp(y, e.end_month, e.end_day, 0, 0, 0) + interval '1 day';
    end if;
  end if;

  edition := y;
  starts_at := s at time zone 'America/Sao_Paulo';
  ends_at := f at time zone 'America/Sao_Paulo';
  is_active := e.enabled and p_at >= starts_at and p_at < ends_at;
  return next;
end;
$$;

-- Quanto da etapa a pessoa já fez nesta edição.
--   rate / whisper: filmes da seleção avaliados / sussurrados na edição;
--   watchlist: filmes da seleção postos na Watchlist na edição, somados aos
--   que já estão nela agora (quem já tinha guardado não precisa tirar e pôr).
create or replace function public.seasonal_step_progress(p_user_id uuid, p_event_id text, p_edition int, p_kind text)
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_kind = 'watchlist' then (
      select count(*)::int from (
        select a.movie_id
        from public.seasonal_event_actions a
        where a.user_id = p_user_id and a.event_id = p_event_id and a.edition = p_edition and a.kind = 'watchlist'
        union
        select um.movie_id
        from public.user_movies um
        join public.seasonal_events se on se.id = p_event_id
        where um.user_id = p_user_id
          and coalesce(um.media_type, 'movie') = 'movie'
          and um.rating is null
          and se.movie_ids @> to_jsonb(um.movie_id)
      ) z)
    else (
      select count(*)::int
      from public.seasonal_event_actions a
      where a.user_id = p_user_id and a.event_id = p_event_id and a.edition = p_edition and a.kind = p_kind)
  end;
$$;

-- Concede as tags que a pessoa já cumpriu, em ordem. Para na primeira
-- etapa que falta: a 2 nunca vem antes da 1. Quem já tem a tag (de outro
-- ano, por exemplo) tem a etapa como feita.
create or replace function public.grant_seasonal_tags(p_user_id uuid, p_event_id text, p_edition int)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.seasonal_events%rowtype;
  st jsonb;
begin
  select * into e from public.seasonal_events se where se.id = p_event_id;
  if not found or p_user_id is null then
    return;
  end if;

  for st in select value from jsonb_array_elements(e.steps) loop
    if exists (select 1 from public.user_special_tags ust where ust.user_id = p_user_id and ust.tag_id = st->>'tag') then
      continue;
    end if;
    if public.seasonal_step_progress(p_user_id, p_event_id, p_edition, st->>'kind') < (st->>'count')::int then
      exit;
    end if;
    insert into public.user_special_tags (user_id, tag_id, unlocked_at, is_permanent)
    values (p_user_id, st->>'tag', now(), true)
    on conflict (user_id, tag_id) do nothing;
  end loop;
end;
$$;

-- Registra uma ação num filme da seleção de todo evento no ar e concede o
-- que couber. Erros aqui nunca derrubam a avaliação/sussurro de quem chamou.
create or replace function public.record_seasonal_action(p_user_id uuid, p_kind text, p_movie_id int)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ev record;
  w record;
begin
  for ev in
    select se.id from public.seasonal_events se
    where se.enabled and se.movie_ids @> to_jsonb(p_movie_id)
  loop
    select * into w from public.seasonal_event_window(ev.id);
    if w.is_active then
      insert into public.seasonal_event_actions (user_id, event_id, edition, kind, movie_id)
      values (p_user_id, ev.id, w.edition, p_kind, p_movie_id)
      on conflict do nothing;
      perform public.grant_seasonal_tags(p_user_id, ev.id, w.edition);
    end if;
  end loop;
end;
$$;

create or replace function public.trigger_seasonal_event_on_movie()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.media_type, 'movie') <> 'movie' then
    return null;
  end if;
  begin
    if new.rating is not null and (tg_op = 'INSERT' or old.rating is distinct from new.rating) then
      perform public.record_seasonal_action(new.user_id, 'rate', new.movie_id);
    elsif new.rating is null and tg_op = 'INSERT' then
      perform public.record_seasonal_action(new.user_id, 'watchlist', new.movie_id);
    end if;
  exception when others then
    raise warning 'seasonal event (user_movies): %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.trigger_seasonal_event_on_whisper()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.type, 'movie') <> 'movie'
     or coalesce(new.media_type, 'movie') <> 'movie'
     or new.movie_id is null
     or new.from_user_id is null
     or new.from_user_id = new.to_user_id then
    return null;
  end if;
  begin
    perform public.record_seasonal_action(new.from_user_id, 'whisper', new.movie_id);
  exception when others then
    raise warning 'seasonal event (friend_indications): %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger seasonal_event_on_movie
  after insert or update of rating on public.user_movies
  for each row execute function public.trigger_seasonal_event_on_movie();

create trigger seasonal_event_on_whisper
  after insert on public.friend_indications
  for each row execute function public.trigger_seasonal_event_on_whisper();

-- Estado do evento para o site. p_preview ('halloween', 'christmas'…) pede
-- a prévia de um evento fora da época — só visual: tags só saem no ar.
create or replace function public.get_seasonal_event_state(p_preview text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  e public.seasonal_events%rowtype;
  w record;
  chosen boolean := false;
  steps_out jsonb := '[]'::jsonb;
  st jsonb;
  st_index int := 0;
  prev_done boolean := true;
  owned_at timestamptz;
  prog int;
  items jsonb;
  actions jsonb;
  tag_row public.special_tags%rowtype;
begin
  if p_preview is not null then
    select * into e from public.seasonal_events se where se.id = p_preview and se.enabled;
    if found then
      chosen := true;
      select * into w from public.seasonal_event_window(e.id);
    end if;
  end if;

  if not chosen then
    for e in select * from public.seasonal_events se where se.enabled order by se.created_at, se.id loop
      select * into w from public.seasonal_event_window(e.id);
      if w.is_active then
        chosen := true;
        exit;
      end if;
    end loop;
  end if;

  if not chosen then
    return null;
  end if;

  if w.is_active then
    -- rede de segurança: concede o que a pessoa já cumpriu
    if uid is not null then
      perform public.grant_seasonal_tags(uid, e.id, w.edition);
    end if;
    -- as datas das tags (prazo no modal de Tags) acompanham a edição no ar
    update public.special_tags t
    set starts_at = w.starts_at, ends_at = w.ends_at
    where t.id in (select s.value->>'tag' from jsonb_array_elements(e.steps) s)
      and (t.starts_at is distinct from w.starts_at or t.ends_at is distinct from w.ends_at);
  end if;

  -- seleção, na ordem, com o oráculo que a guarda
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.mid,
           'oracle', (select rp.card_type from public.recommendation_pools rp
                      where rp.mood_key <> 'random-surprise' and rp.movie_ids @> to_jsonb(x.mid)
                      order by rp.card_type limit 1)
         ) order by x.ord), '[]'::jsonb)
  into items
  from (
    select (v #>> '{}')::int mid, ord
    from jsonb_array_elements(e.movie_ids) with ordinality as t(v, ord)
  ) x;

  -- o que a pessoa já fez nesta edição, por tipo
  select coalesce(jsonb_object_agg(k.kind, k.ids), '{}'::jsonb)
  into actions
  from (
    select a.kind, jsonb_agg(a.movie_id order by a.created_at) ids
    from public.seasonal_event_actions a
    where uid is not null and a.user_id = uid and a.event_id = e.id and a.edition = w.edition
    group by a.kind
  ) k;

  for st in select value from jsonb_array_elements(e.steps) loop
    st_index := st_index + 1;
    select * into tag_row from public.special_tags t where t.id = st->>'tag';
    owned_at := null;
    if uid is not null then
      select ust.unlocked_at into owned_at from public.user_special_tags ust where ust.user_id = uid and ust.tag_id = st->>'tag';
    end if;
    prog := case when uid is null then 0 else public.seasonal_step_progress(uid, e.id, w.edition, st->>'kind') end;
    steps_out := steps_out || jsonb_build_object(
      'index', st_index,
      'tag', st->>'tag',
      'name', tag_row.name,
      'emoji', tag_row.emoji,
      'kind', st->>'kind',
      'count', (st->>'count')::int,
      'progress', prog,
      'unlocked', owned_at is not null,
      'unlocked_at', owned_at,
      'available', prev_done
    );
    prev_done := prev_done and owned_at is not null;
  end loop;

  return jsonb_build_object(
    'id', e.id,
    'edition', w.edition,
    'starts_at', w.starts_at,
    'ends_at', w.ends_at,
    'is_active', w.is_active,
    'is_preview', not w.is_active,
    'now', now(),
    'items', items,
    'actions', actions,
    'steps', steps_out,
    'decoration_tag', e.decoration_tag,
    'decoration_unlocked', uid is not null and exists (
      select 1 from public.user_special_tags ust where ust.user_id = uid and ust.tag_id = e.decoration_tag)
  );
end;
$$;

revoke all on function public.seasonal_event_window(text, timestamptz) from public, anon, authenticated;
revoke all on function public.seasonal_step_progress(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.grant_seasonal_tags(uuid, text, int) from public, anon, authenticated;
revoke all on function public.record_seasonal_action(uuid, text, int) from public, anon, authenticated;
revoke all on function public.trigger_seasonal_event_on_movie() from public, anon, authenticated;
revoke all on function public.trigger_seasonal_event_on_whisper() from public, anon, authenticated;
revoke all on function public.get_seasonal_event_state(text) from public;
grant execute on function public.get_seasonal_event_state(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. O Halloween já está no ar desde 01/10: vale o que foi feito até agora
-- ---------------------------------------------------------------------------

insert into public.seasonal_event_actions (user_id, event_id, edition, kind, movie_id, created_at)
select um.user_id, 'halloween', 2026,
       case when um.rating is not null then 'rate' else 'watchlist' end,
       um.movie_id,
       greatest(um.created_at, coalesce(um.updated_at, um.created_at))
from public.user_movies um
join public.seasonal_events se on se.id = 'halloween'
where coalesce(um.media_type, 'movie') = 'movie'
  and se.movie_ids @> to_jsonb(um.movie_id)
  and greatest(um.created_at, coalesce(um.updated_at, um.created_at)) >= timestamptz '2026-10-01 00:00 America/Sao_Paulo'
on conflict do nothing;

select public.grant_seasonal_tags(z.user_id, 'halloween', 2026)
from (select distinct a.user_id from public.seasonal_event_actions a where a.event_id = 'halloween' and a.edition = 2026) z;
