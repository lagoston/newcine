-- 17/11/2026 (pedido do Bruno): o ensaio dos eventos para a Conta Diretor.
--
-- "Não consigo completar a missão de Natal para testar porque não posso ter
-- amigos com ele [...] Tentei avaliar um filme para completar a primeira missão
-- de Halloween e também não funcionou."
--
-- O porquê: a prévia de um evento fora da época era só visual (16/11). O
-- gatilho das notas só grava ação com o evento no ar, e a missão do sussurro
-- do Natal pede um amigo, que a conta escondida não pode ter (o sussurro a
-- revelaria). Nada disso muda para ninguém.
--
-- O ensaio: com a prévia ligada num evento que não está no ar, o que o diretor
-- faz com os filmes da lista (avaliar, resenhar, pôr na Watchlist) vale num
-- ensaio guardado à parte, no esquema privado `director`. O painel mostra o
-- progresso do ensaio, as missões se completam em ordem e a comemoração
-- aparece, como no evento de verdade, sem gravar tag nenhuma (o princípio dos
-- desbloqueáveis do diretor: liberar, nunca dar posse). Cada missão também
-- pode ser marcada à mão (é o caminho do sussurro) e o ensaio pode recomeçar
-- do zero. Com o evento no ar, vale o evento de verdade, como antes.
--
-- A edição do ensaio é a da prévia: a próxima janela do evento (hoje, 17/11,
-- o Natal de 2026 e o Halloween de 2027, com as tags "II").

create table if not exists director.event_trial_runs (
  user_id uuid not null,
  event_id text not null references public.seasonal_events (id) on delete cascade,
  edition integer not null,
  -- só contam as ações daqui em diante (recomeçar = mudar esta data)
  started_at timestamptz not null default now(),
  primary key (user_id, event_id, edition)
);
alter table director.event_trial_runs enable row level security;

create table if not exists director.event_trial_actions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event_id text not null references public.seasonal_events (id) on delete cascade,
  edition integer not null,
  kind text not null check (kind in ('rate', 'watchlist', 'whisper', 'review')),
  -- null = marcada à mão no painel
  movie_id integer,
  created_at timestamptz not null default now()
);
create index if not exists event_trial_actions_lookup on director.event_trial_actions (user_id, event_id, edition, kind, created_at);
alter table director.event_trial_actions enable row level security;

-- O começo do ensaio desta edição (cria na primeira vez).
create or replace function director.trial_started_at(p_uid uuid, p_event text, p_edition integer)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  insert into director.event_trial_runs (user_id, event_id, edition)
  values (p_uid, p_event, p_edition)
  on conflict (user_id, event_id, edition) do nothing;
  select r.started_at into v_at
    from director.event_trial_runs r
   where r.user_id = p_uid and r.event_id = p_event and r.edition = p_edition;
  return v_at;
end;
$$;

-- Grava uma ação do ensaio: uma vez por filme e tipo em cada ensaio (como a 1ª nota de verdade).
create or replace function director.trial_record(p_uid uuid, p_event text, p_edition integer, p_kind text, p_movie integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz;
begin
  if p_uid is null or p_movie is null or p_kind not in ('rate', 'watchlist', 'whisper', 'review') then
    return;
  end if;
  v_start := director.trial_started_at(p_uid, p_event, p_edition);
  if exists (select 1 from director.event_trial_actions a
              where a.user_id = p_uid and a.event_id = p_event and a.edition = p_edition
                and a.kind = p_kind and a.movie_id = p_movie and a.created_at >= v_start) then
    return;
  end if;
  insert into director.event_trial_actions (user_id, event_id, edition, kind, movie_id)
  values (p_uid, p_event, p_edition, p_kind, p_movie);
end;
$$;

-- O que conta no ensaio: as ações de filme que ainda valem (as mesmas regras
-- de seasonal_action_valid: o filme continua avaliado etc.), as marcadas à mão
-- e, na Watchlist, também o que já está guardado (como no evento de verdade).
create or replace function director.trial_counted(p_uid uuid, p_event text, p_edition integer, p_start timestamptz)
returns table (kind text, movie_id integer, at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.kind, a.movie_id, min(a.created_at)
    from director.event_trial_actions a
   where a.user_id = p_uid and a.event_id = p_event and a.edition = p_edition
     and a.created_at >= p_start and a.movie_id is not null
     and public.seasonal_action_valid(p_uid, a.kind, a.movie_id)
   group by a.kind, a.movie_id
  union all
  select a.kind, null::integer, a.created_at
    from director.event_trial_actions a
   where a.user_id = p_uid and a.event_id = p_event and a.edition = p_edition
     and a.created_at >= p_start and a.movie_id is null
  union all
  select 'watchlist'::text, um.movie_id, p_start
    from public.user_movies um
   where um.user_id = p_uid and coalesce(um.media_type, 'movie') = 'movie' and um.rating is null
     and public.seasonal_event_list(p_event, p_edition) @> to_jsonb(um.movie_id)
     and not exists (select 1 from director.event_trial_actions a
                      where a.user_id = p_uid and a.event_id = p_event and a.edition = p_edition
                        and a.kind = 'watchlist' and a.movie_id = um.movie_id and a.created_at >= p_start);
$$;

-- Os filmes da lista que o diretor já tinha avaliado antes do ensaio (as missões de presente).
create or replace function director.trial_pre_rated(p_uid uuid, p_event text, p_edition integer, p_start timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(distinct um.movie_id)::int
  from jsonb_array_elements(public.seasonal_event_list(p_event, p_edition)) v
  join public.user_movies um
    on um.user_id = p_uid
   and um.movie_id = (v #>> '{}')::int
   and coalesce(um.media_type, 'movie') = 'movie'
   and um.rating is not null
  where not exists (
    select 1 from director.event_trial_actions a
    where a.user_id = p_uid and a.event_id = p_event and a.edition = p_edition
      and a.kind = 'rate' and a.movie_id = um.movie_id and a.created_at >= p_start);
$$;

-- As missões no ensaio, no mesmo formato de seasonal_step_states. Em vez da
-- tag gravada, owned_at é a hora em que a missão ficou feita, em ordem: uma
-- missão só vale com a anterior valendo (como grant_seasonal_tags).
create or replace function director.trial_step_states(p_uid uuid, p_event text, p_edition integer)
returns table (idx integer, tag text, kind text, cnt integer, progress integer, credited boolean, owned_at timestamptz, done boolean)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  e public.seasonal_events%rowtype;
  v_start timestamptz;
  list_size int;
  n int;
  lvl int;
  pre int;
  credit int;
  st jsonb;
  i int := 0;
  offsets jsonb := '{}'::jsonb;
  k text;
  c int;
  raw int;
  off int;
  need int;
  v_done_at timestamptz;
  prev_at timestamptz;
  prev_ok boolean := true;
begin
  select * into e from public.seasonal_events se where se.id = p_event;
  if not found or p_uid is null then
    return;
  end if;
  select r.started_at into v_start
    from director.event_trial_runs r
   where r.user_id = p_uid and r.event_id = p_event and r.edition = p_edition;
  v_start := coalesce(v_start, now());
  list_size := jsonb_array_length(public.seasonal_event_list(p_event, p_edition));
  n := jsonb_array_length(e.steps);
  lvl := greatest(1, p_edition - e.first_edition + 1);
  pre := director.trial_pre_rated(p_uid, p_event, p_edition, v_start);
  credit := greatest(0, least(n, pre - (list_size - n)));
  prev_at := v_start;

  for st in select value from jsonb_array_elements(e.steps) loop
    i := i + 1;
    k := st->>'kind';
    c := (st->>'count')::int;
    idx := i;
    tag := public.seasonal_edition_tag(st->>'tag', lvl);
    kind := k;
    cnt := c;
    credited := i <= credit;
    if credited then
      offsets := offsets || jsonb_build_object(k, greatest(coalesce((offsets->>k)::int, 0), c));
    end if;
    off := coalesce((offsets->>k)::int, 0);
    select count(*)::int into raw from director.trial_counted(p_uid, p_event, p_edition, v_start) t where t.kind = k;
    progress := least(c, raw + off);
    done := credited or progress >= c;
    v_done_at := null;
    if done then
      need := c - off;
      if credited or need <= 0 then
        v_done_at := v_start;
      else
        select t.at into v_done_at
          from director.trial_counted(p_uid, p_event, p_edition, v_start) t
         where t.kind = k
         order by t.at
        offset need - 1 limit 1;
      end if;
    end if;
    if done and prev_ok then
      owned_at := greatest(prev_at, coalesce(v_done_at, v_start));
      prev_at := owned_at;
    else
      owned_at := null;
      prev_ok := false;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function director.trial_started_at(uuid, text, integer) from public;
revoke all on function director.trial_record(uuid, text, integer, text, integer) from public;
revoke all on function director.trial_counted(uuid, text, integer, timestamptz) from public;
revoke all on function director.trial_pre_rated(uuid, text, integer, timestamptz) from public;
revoke all on function director.trial_step_states(uuid, text, integer) from public;

-- Os gatilhos das notas, resenhas e sussurros: além do evento no ar (como
-- sempre), o que o diretor faz fora da época vai para o ensaio de cada evento
-- cuja lista conta o filme (também rascunhos, que a prévia do diretor mostra).
create or replace function public.record_seasonal_action(p_user_id uuid, p_kind text, p_movie_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  ev record;
  w record;
begin
  for ev in select se.id from public.seasonal_events se where se.enabled loop
    select * into w from public.seasonal_event_window(ev.id);
    if w.is_active and public.seasonal_event_counts_movie(ev.id, w.edition, p_movie_id) then
      insert into public.seasonal_event_actions (user_id, event_id, edition, kind, movie_id)
      values (p_user_id, ev.id, w.edition, p_kind, p_movie_id)
      on conflict do nothing;
      perform public.grant_seasonal_tags(p_user_id, ev.id, w.edition);
    end if;
  end loop;

  -- Conta Diretor (17/11/2026): o ensaio dos eventos que não estão no ar.
  if public.is_director_user(p_user_id) then
    for ev in select se.id from public.seasonal_events se loop
      select * into w from public.seasonal_event_window(ev.id);
      if not w.is_active and public.seasonal_event_counts_movie(ev.id, w.edition, p_movie_id) then
        perform director.trial_record(p_user_id, ev.id, w.edition, p_kind, p_movie_id);
      end if;
    end loop;
  end if;
end;
$function$;

-- O estado do evento: na prévia do diretor de um evento fora do ar, as missões,
-- os filmes que contaram e as missões de presente vêm do ensaio ('is_trial').
create or replace function public.get_seasonal_event_state(p_preview text default null::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  e public.seasonal_events%rowtype;
  w record;
  chosen boolean := false;
  lst jsonb;
  steps_out jsonb;
  items jsonb;
  actions jsonb;
  pre int := 0;
  lvl int;
  deco text;
  -- 17/11/2026: o ensaio do diretor
  trial boolean := false;
  trial_at timestamptz;
begin
  perform public.finalize_seasonal_tags();

  -- Conta Diretor (16/11/2026): a prévia de um evento fora da época passa a ser só
  -- dela (antes qualquer um via com ?evento=natal) e mostra também rascunhos
  -- (enabled = false). Para os outros, p_preview é ignorado.
  if p_preview is not null and public.is_director(1) then
    select * into e from public.seasonal_events se where se.id = p_preview;
    if found then
      chosen := true;
      select * into w from public.seasonal_event_window(e.id);
      -- 17/11/2026: fora do ar, a prévia do diretor é um ensaio
      trial := uid is not null and not (w.is_active and e.enabled);
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

  lvl := greatest(1, w.edition - e.first_edition + 1);
  deco := case when e.decoration_tag is null then null else public.seasonal_edition_tag(e.decoration_tag, lvl) end;

  -- rascunho (16/11/2026): mesmo na época, a prévia de um evento desligado é só visual
  if w.is_active and e.enabled then
    perform public.ensure_seasonal_edition_tags(e.id, w.edition);
    if uid is not null then
      perform public.grant_seasonal_tags(uid, e.id, w.edition);
    end if;
    update public.special_tags t
    set starts_at = w.starts_at, ends_at = w.ends_at
    where t.id in (select public.seasonal_edition_tag(s.value->>'tag', lvl) from jsonb_array_elements(e.steps) s)
      and (t.starts_at is distinct from w.starts_at or t.ends_at is distinct from w.ends_at);
  end if;

  if trial then
    trial_at := director.trial_started_at(uid, e.id, w.edition);
  end if;

  lst := public.seasonal_event_list(e.id, w.edition);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.mid,
           'oracle', (select rp.card_type from public.recommendation_pools rp
                      where rp.mood_key <> 'random-surprise' and rp.movie_ids @> to_jsonb(x.mid)
                      order by rp.card_type limit 1)
         ) order by x.ord), '[]'::jsonb)
  into items
  from (
    select (v #>> '{}')::int mid, ord
    from jsonb_array_elements(lst) with ordinality as t(v, ord)
  ) x;

  if trial then
    select coalesce(jsonb_object_agg(k.kind, k.ids), '{}'::jsonb)
    into actions
    from (
      select c.kind, jsonb_agg(c.movie_id order by c.at) ids
      from director.trial_counted(uid, e.id, w.edition, trial_at) c
      where c.movie_id is not null
      group by c.kind
    ) k;
  else
    select coalesce(jsonb_object_agg(k.kind, k.ids), '{}'::jsonb)
    into actions
    from (
      select a.kind, jsonb_agg(a.movie_id order by a.created_at) ids
      from public.seasonal_event_actions a
      where uid is not null and a.user_id = uid and a.event_id = e.id and a.edition = w.edition
        and public.seasonal_action_valid(uid, a.kind, a.movie_id)
      group by a.kind
    ) k;
  end if;

  if trial then
    pre := director.trial_pre_rated(uid, e.id, w.edition, trial_at);
  elsif uid is not null then
    pre := public.seasonal_pre_rated(uid, e.id, w.edition);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'index', z.idx,
           'tag', z.tag,
           'base_tag', z.base_tag,
           'name', coalesce(z.tag_name, z.base_name || case when lvl > 1 then ' ' || public.roman_numeral(lvl) else '' end),
           'emoji', coalesce(z.tag_emoji, z.base_emoji),
           'kind', z.kind,
           'count', z.cnt,
           'progress', z.progress,
           'credited', z.credited,
           'unlocked', z.owned_at is not null,
           'unlocked_at', z.owned_at,
           'available', coalesce(z.prev_owned, true)
         ) order by z.idx), '[]'::jsonb)
  into steps_out
  from (
    select s.*, sb.base_tag, t.name tag_name, t.emoji tag_emoji, b.name base_name, b.emoji base_emoji,
           bool_and(s.owned_at is not null) over (order by s.idx rows between unbounded preceding and 1 preceding) prev_owned
    from (
      select * from public.seasonal_step_states(uid, e.id, w.edition) where not trial
      union all
      select * from director.trial_step_states(uid, e.id, w.edition) where trial
    ) s
    cross join lateral (select e.steps -> (s.idx - 1) ->> 'tag' as base_tag) sb
    left join public.special_tags t on t.id = s.tag
    left join public.special_tags b on b.id = sb.base_tag
  ) z;

  return jsonb_build_object(
    'id', e.id,
    'edition', w.edition,
    'level', lvl,
    'starts_at', w.starts_at,
    'ends_at', w.ends_at,
    'is_active', w.is_active and e.enabled,
    'is_preview', not (w.is_active and e.enabled),
    'is_trial', trial,
    'trial_started_at', trial_at,
    'now', now(),
    'items', items,
    'actions', actions,
    'steps', steps_out,
    'pre_rated', pre,
    'list_size', jsonb_array_length(lst),
    'bonus_moods', to_jsonb(coalesce(e.bonus_moods, '{}'::text[])),
    'decoration_tag', deco,
    'decoration_unlocked', case
      when trial then coalesce((steps_out -> -1 ->> 'unlocked')::boolean, false)
      else uid is not null and deco is not null and exists (
        select 1 from public.user_special_tags ust where ust.user_id = uid and ust.tag_id = deco)
    end
  );
end;
$function$;

-- O painel do ensaio: marcar missões à mão (até a escolhida) e recomeçar.
create or replace function public.director_event_trial(p_action text, p_event text, p_step integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  w record;
  r record;
  v_steps int;
  i int;
begin
  if not public.is_director(1) then
    raise exception 'not_director' using errcode = '42501';
  end if;
  select * into w from public.seasonal_event_window(p_event);
  if not found then
    raise exception 'not_found';
  end if;
  -- com o evento no ar vale o evento de verdade: nada de missão marcada à mão
  if w.is_active then
    raise exception 'event_live';
  end if;

  if p_action = 'reset' then
    insert into director.event_trial_runs (user_id, event_id, edition, started_at)
    values (v_uid, p_event, w.edition, now())
    on conflict (user_id, event_id, edition) do update set started_at = now();
  elsif p_action = 'mark' then
    select jsonb_array_length(se.steps) into v_steps from public.seasonal_events se where se.id = p_event;
    if p_step is null or p_step < 1 or p_step > v_steps then
      raise exception 'bad_step';
    end if;
    perform director.trial_started_at(v_uid, p_event, w.edition);
    -- uma a uma: cada consulta já vê o que a anterior marcou
    for i in 1 .. p_step loop
      select * into r from director.trial_step_states(v_uid, p_event, w.edition) s where s.idx = i;
      if r.done then
        continue;
      end if;
      insert into director.event_trial_actions (user_id, event_id, edition, kind, movie_id)
      select v_uid, p_event, w.edition, r.kind, null from generate_series(1, greatest(1, r.cnt - r.progress));
    end loop;
  else
    raise exception 'bad_action';
  end if;
  return jsonb_build_object('ok', true, 'edition', w.edition);
end;
$$;
revoke all on function public.director_event_trial(text, text, integer) from public, anon;
grant execute on function public.director_event_trial(text, text, integer) to authenticated;
