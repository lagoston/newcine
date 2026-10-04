-- Tags por edição: cada ano do mesmo evento dá a sua própria leva de tags,
-- numeradas em algarismos romanos.
--
--   1º Halloween (2026): Scary Clown · Deadly Sleeping · Headless Horseman
--   2º Halloween (2027): Scary Clown II · Deadly Sleeping II · Headless Horseman II
--   3º Halloween (2028): … III
--
-- O id segue a mesma ideia: 'scary-clown' no primeiro ano, 'scary-clown-2'
-- no segundo, 'scary-clown-3' no terceiro. As tags da edição nascem sozinhas
-- (ensure_seasonal_edition_tags), copiadas da tag-mãe, quando o evento entra
-- no ar ou quando alguém conquista a primeira. Quem tem a "Ho Ho Ho" de 2026
-- começa o Natal de 2027 do zero e ganha a "Ho Ho Ho II" — as antigas ficam
-- para sempre.
--
-- A janela das tags (starts_at/ends_at) passa a ser atualizada só nas tags
-- da edição no ar; as dos anos anteriores ficam com a janela do seu ano.

-- ---------------------------------------------------------------------------
-- Ajudantes
-- ---------------------------------------------------------------------------

create or replace function public.roman_numeral(p_n int)
returns text
language sql
immutable
as $$
  select trim(to_char(p_n, 'RN'));
$$;

-- Nível da edição: 1 no primeiro ano do evento, 2 no segundo…
create or replace function public.seasonal_edition_level(p_event_id text, p_edition int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, p_edition - se.first_edition + 1)
  from public.seasonal_events se
  where se.id = p_event_id;
$$;

create or replace function public.seasonal_edition_tag(p_base text, p_level int)
returns text
language sql
immutable
as $$
  select case when coalesce(p_level, 1) <= 1 then p_base else p_base || '-' || p_level end;
$$;

-- Cria (se faltar) as tags da edição a partir das tags-mãe das etapas.
create or replace function public.ensure_seasonal_edition_tags(p_event_id text, p_edition int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.seasonal_events%rowtype;
  lvl int;
  w record;
begin
  select * into e from public.seasonal_events se where se.id = p_event_id;
  if not found then
    return;
  end if;
  lvl := greatest(1, p_edition - e.first_edition + 1);
  if lvl <= 1 then
    return;
  end if;

  -- janela da edição pedida (meio-dia do primeiro dia dela, em Brasília)
  select * into w
  from public.seasonal_event_window(
    p_event_id,
    make_timestamp(p_edition, e.start_month, e.start_day, 12, 0, 0) at time zone 'America/Sao_Paulo'
  );

  insert into public.special_tags (
    id, name, emoji, description, requirement_description, description_pt, requirement_description_pt,
    starts_at, ends_at, requirement_type, requirement_data
  )
  select public.seasonal_edition_tag(b.id, lvl),
         b.name || ' ' || public.roman_numeral(lvl),
         b.emoji,
         b.description || ' (' || p_edition || ')',
         b.requirement_description,
         case when b.description_pt is null then null else b.description_pt || ' (' || p_edition || ')' end,
         b.requirement_description_pt,
         w.starts_at,
         w.ends_at,
         b.requirement_type,
         coalesce(b.requirement_data, '{}'::jsonb)
           || jsonb_build_object('edition', p_edition, 'level', lvl, 'base_tag', b.id)
  from jsonb_array_elements(e.steps) s
  join public.special_tags b on b.id = s.value->>'tag'
  on conflict (id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estado das etapas: `tag` passa a ser a tag da edição (mesma assinatura de
-- antes; a tag-mãe de cada etapa é seasonal_events.steps[idx-1].tag)
-- ---------------------------------------------------------------------------

create or replace function public.seasonal_step_states(p_user_id uuid, p_event_id text, p_edition int)
returns table(idx int, tag text, kind text, cnt int, progress int, credited boolean, owned_at timestamptz, done boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  e public.seasonal_events%rowtype;
  list_size int;
  n int;
  lvl int;
  pre int := 0;
  credit int;
  st jsonb;
  i int := 0;
  offsets jsonb := '{}'::jsonb;
  k text;
  c int;
  raw int;
  v_tag text;
begin
  select * into e from public.seasonal_events se where se.id = p_event_id;
  if not found then
    return;
  end if;
  list_size := jsonb_array_length(public.seasonal_event_list(p_event_id, p_edition));
  n := jsonb_array_length(e.steps);
  lvl := greatest(1, p_edition - e.first_edition + 1);
  if p_user_id is not null then
    pre := public.seasonal_pre_rated(p_user_id, p_event_id, p_edition);
  end if;
  credit := greatest(0, least(n, pre - (list_size - n)));

  for st in select value from jsonb_array_elements(e.steps) loop
    i := i + 1;
    k := st->>'kind';
    c := (st->>'count')::int;
    v_tag := public.seasonal_edition_tag(st->>'tag', lvl);
    idx := i;
    tag := v_tag;
    kind := k;
    cnt := c;
    credited := i <= credit;
    if credited then
      offsets := offsets || jsonb_build_object(k, greatest(coalesce((offsets->>k)::int, 0), c));
    end if;
    raw := case when p_user_id is null then 0 else public.seasonal_step_progress(p_user_id, p_event_id, p_edition, k) end;
    progress := least(c, raw + coalesce((offsets->>k)::int, 0));
    owned_at := null;
    if p_user_id is not null then
      select ust.unlocked_at into owned_at
      from public.user_special_tags ust
      where ust.user_id = p_user_id and ust.tag_id = v_tag;
    end if;
    done := credited or progress >= c;
    return next;
  end loop;
end;
$$;

revoke all on function public.seasonal_step_states(uuid, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Concessão: garante as tags da edição antes de entregar
-- ---------------------------------------------------------------------------

create or replace function public.grant_seasonal_tags(p_user_id uuid, p_event_id text, p_edition int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_user_id is null then
    return;
  end if;
  perform public.ensure_seasonal_edition_tags(p_event_id, p_edition);
  for r in select * from public.seasonal_step_states(p_user_id, p_event_id, p_edition) s order by s.idx loop
    if r.owned_at is not null then
      continue;
    end if;
    if not r.done then
      exit;
    end if;
    insert into public.user_special_tags (user_id, tag_id, unlocked_at, is_permanent)
    values (p_user_id, r.tag, now(), true)
    on conflict (user_id, tag_id) do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estado para o site: tags da edição, base_tag e nível
-- ---------------------------------------------------------------------------

create or replace function public.get_seasonal_event_state(p_preview text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  lvl := greatest(1, w.edition - e.first_edition + 1);
  deco := case when e.decoration_tag is null then null else public.seasonal_edition_tag(e.decoration_tag, lvl) end;

  if w.is_active then
    perform public.ensure_seasonal_edition_tags(e.id, w.edition);
    if uid is not null then
      perform public.grant_seasonal_tags(uid, e.id, w.edition);
    end if;
    -- só as tags desta edição acompanham a janela do evento
    update public.special_tags t
    set starts_at = w.starts_at, ends_at = w.ends_at
    where t.id in (select public.seasonal_edition_tag(s.value->>'tag', lvl) from jsonb_array_elements(e.steps) s)
      and (t.starts_at is distinct from w.starts_at or t.ends_at is distinct from w.ends_at);
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

  select coalesce(jsonb_object_agg(k.kind, k.ids), '{}'::jsonb)
  into actions
  from (
    select a.kind, jsonb_agg(a.movie_id order by a.created_at) ids
    from public.seasonal_event_actions a
    where uid is not null and a.user_id = uid and a.event_id = e.id and a.edition = w.edition
    group by a.kind
  ) k;

  if uid is not null then
    pre := public.seasonal_pre_rated(uid, e.id, w.edition);
  end if;

  -- o nome sai da tag da edição; na prévia de uma edição que ainda não
  -- começou (tag ainda não criada), monta a partir da tag-mãe
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
    from public.seasonal_step_states(uid, e.id, w.edition) s
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
    'is_active', w.is_active,
    'is_preview', not w.is_active,
    'now', now(),
    'items', items,
    'actions', actions,
    'steps', steps_out,
    'pre_rated', pre,
    'list_size', jsonb_array_length(lst),
    'decoration_tag', deco,
    'decoration_unlocked', uid is not null and deco is not null and exists (
      select 1 from public.user_special_tags ust where ust.user_id = uid and ust.tag_id = deco)
  );
end;
$$;

revoke all on function public.ensure_seasonal_edition_tags(text, int) from public, anon, authenticated;
revoke all on function public.seasonal_edition_level(text, int) from public, anon, authenticated;
revoke all on function public.grant_seasonal_tags(uuid, text, int) from public, anon, authenticated;
revoke all on function public.get_seasonal_event_state(text) from public;
grant execute on function public.get_seasonal_event_state(text) to anon, authenticated;
