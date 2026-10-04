-- Eventos sazonais: as tags dependem dos filmes até o fim do evento.
--
-- Enquanto o evento está no ar, o que fez a pessoa ganhar uma tag precisa
-- continuar lá (como as tags comuns que liberam molduras e banners):
--
--   • uma nota só vale enquanto o filme continua avaliado na biblioteca;
--     uma resenha, enquanto ela existe (e o filme continua avaliado);
--   • tirar da biblioteca (ou tirar a nota de) um filme que contou desfaz a
--     missão: a tag sai — e as das missões seguintes também, porque elas são
--     em sequência —, o ✓ some do pôster no painel do evento, o story de
--     conclusão sai do feed e, se a pessoa estava usando a tag no perfil,
--     ela deixa de ser a tag em uso;
--   • para ganhar de novo basta cumprir a missão de novo (avaliar outro filme
--     da lista, ou o mesmo). Dessa vez não sai sussurro de "tag nova": o
--     registro de tags já conhece o nome;
--   • quando o evento acaba, todas as tags que a pessoa tem viram
--     definitivas (is_permanent) e o compromisso com os filmes acaba;
--   • as tags ganhas antes desta regra existir não mudam (já eram
--     definitivas).
--
-- Os sussurros de amigo secreto (Natal) não dependem da biblioteca: o
-- sussurro já foi enviado.

-- ---------------------------------------------------------------------------
-- Uma ação conta enquanto o filme continua lá
-- ---------------------------------------------------------------------------

create or replace function public.seasonal_action_valid(p_user_id uuid, p_kind text, p_movie_id int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_kind
    when 'rate' then exists (
      select 1 from public.user_movies um
      where um.user_id = p_user_id and um.movie_id = p_movie_id
        and coalesce(um.media_type, 'movie') = 'movie' and um.rating is not null)
    when 'review' then exists (
      select 1 from public.reviews r
      where r.user_id = p_user_id and r.movie_id = p_movie_id and coalesce(r.media_type, 'movie') = 'movie')
      and exists (
      select 1 from public.user_movies um
      where um.user_id = p_user_id and um.movie_id = p_movie_id
        and coalesce(um.media_type, 'movie') = 'movie' and um.rating is not null)
    when 'watchlist' then exists (
      select 1 from public.user_movies um
      where um.user_id = p_user_id and um.movie_id = p_movie_id and coalesce(um.media_type, 'movie') = 'movie')
    else true
  end;
$$;

create or replace function public.seasonal_step_progress(p_user_id uuid, p_event_id text, p_edition integer, p_kind text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind = 'watchlist' then (
      select count(*)::int from (
        select a.movie_id
        from public.seasonal_event_actions a
        where a.user_id = p_user_id and a.event_id = p_event_id and a.edition = p_edition and a.kind = 'watchlist'
          and public.seasonal_action_valid(p_user_id, 'watchlist', a.movie_id)
        union
        select um.movie_id
        from public.user_movies um
        where um.user_id = p_user_id
          and coalesce(um.media_type, 'movie') = 'movie'
          and um.rating is null
          and public.seasonal_event_list(p_event_id, p_edition) @> to_jsonb(um.movie_id)
      ) z)
    else (
      select count(*)::int
      from public.seasonal_event_actions a
      where a.user_id = p_user_id and a.event_id = p_event_id and a.edition = p_edition and a.kind = p_kind
        and public.seasonal_action_valid(p_user_id, p_kind, a.movie_id))
  end;
$$;

-- ---------------------------------------------------------------------------
-- Concessão: durante o evento a tag é provisória (is_permanent = false)
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
    values (p_user_id, r.tag, now(), false)
    on conflict (user_id, tag_id) do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Desfazer: a missão que deixou de valer leva a tag (e as seguintes)
-- ---------------------------------------------------------------------------

create or replace function public.revalidate_seasonal_tags(p_user_id uuid, p_event_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  e public.seasonal_events%rowtype;
  r record;
  broken boolean := false;
  candidate_ids text[] := '{}';
  revoked_ids text[];
  revoked_names text[];
  lvl int;
  deco text;
begin
  if p_user_id is null then
    return;
  end if;
  select * into e from public.seasonal_events se where se.id = p_event_id;
  if not found then
    return;
  end if;
  select * into w from public.seasonal_event_window(p_event_id);
  -- fora do evento nada mais é desfeito: as tags já são definitivas
  if not w.is_active then
    return;
  end if;

  for r in select * from public.seasonal_step_states(p_user_id, p_event_id, w.edition) s order by s.idx loop
    -- a primeira missão que não vale mais derruba ela e as seguintes
    if not r.done then
      broken := true;
    end if;
    if broken and r.owned_at is not null then
      candidate_ids := candidate_ids || r.tag;
    end if;
  end loop;

  if array_length(candidate_ids, 1) is null then
    return;
  end if;

  -- só as provisórias saem (as definitivas — de edições encerradas, ou
  -- ganhas antes desta regra existir — ficam)
  with gone as (
    delete from public.user_special_tags ust
    where ust.user_id = p_user_id and ust.tag_id = any (candidate_ids) and not ust.is_permanent
    returning ust.tag_id
  )
  select array_agg(gone.tag_id) into revoked_ids from gone;

  if revoked_ids is null then
    return;
  end if;

  select array_agg(st.name) into revoked_names
  from public.special_tags st
  where st.id = any (revoked_ids);

  -- sem a última tag, sai o story de conclusão da edição
  lvl := greatest(1, w.edition - e.first_edition + 1);
  deco := public.seasonal_edition_tag(e.decoration_tag, lvl);
  if deco = any (revoked_ids) then
    delete from public.feed_achievement_stories a
    where a.owner_id = p_user_id and a.kind = 'event' and a.event_id = p_event_id and a.edition = w.edition;
  end if;

  -- a tag em uso que saiu deixa de estar em uso
  update public.profiles p
  set active_tag = null
  where p.id = p_user_id
    and p.active_tag->>'category' = 'special'
    and p.active_tag->>'name' = any (coalesce(revoked_names, '{}'));

  -- user_unlocked_tags fica como está: ao ganhar de novo, não sai sussurro
end;
$$;

-- Chamado pelos gatilhos: confere todos os eventos no ar em que o filme
-- está na lista da edição.
create or replace function public.revalidate_seasonal_tags_for_movie(p_user_id uuid, p_movie_id int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  w record;
begin
  for ev in select se.id from public.seasonal_events se where se.enabled loop
    select * into w from public.seasonal_event_window(ev.id);
    if w.is_active and public.seasonal_event_list(ev.id, w.edition) @> to_jsonb(p_movie_id) then
      perform public.revalidate_seasonal_tags(p_user_id, ev.id);
    end if;
  end loop;
end;
$$;

create or replace function public.trigger_seasonal_revalidate_on_movie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if coalesce(old.media_type, 'movie') = 'movie' then
      if tg_op = 'DELETE' or (old.rating is not null and new.rating is null) then
        perform public.revalidate_seasonal_tags_for_movie(old.user_id, old.movie_id);
      end if;
    end if;
  exception when others then
    raise warning 'seasonal revalidate (user_movies): %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.trigger_seasonal_revalidate_on_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if coalesce(old.media_type, 'movie') = 'movie' and old.user_id is not null then
      perform public.revalidate_seasonal_tags_for_movie(old.user_id, old.movie_id);
    end if;
  exception when others then
    raise warning 'seasonal revalidate (reviews): %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace trigger seasonal_revalidate_on_movie
  after delete or update of rating on public.user_movies
  for each row execute function public.trigger_seasonal_revalidate_on_movie();

create or replace trigger seasonal_revalidate_on_review
  after delete on public.reviews
  for each row execute function public.trigger_seasonal_revalidate_on_review();

-- ---------------------------------------------------------------------------
-- Fim do evento: tudo que a pessoa tem vira definitivo
-- ---------------------------------------------------------------------------

create or replace function public.finalize_seasonal_tags()
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_special_tags ust
  set is_permanent = true
  from public.special_tags st
  where st.id = ust.tag_id
    and not ust.is_permanent
    and st.requirement_data ? 'event'
    and st.ends_at is not null
    and st.ends_at <= now();
$$;

-- ---------------------------------------------------------------------------
-- Estado para o site: só as ações que ainda valem (o ✓ do pôster)
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
  -- edições encerradas: as tags viram definitivas
  perform public.finalize_seasonal_tags();

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
      and public.seasonal_action_valid(uid, a.kind, a.movie_id)
    group by a.kind
  ) k;

  if uid is not null then
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

-- ---------------------------------------------------------------------------
-- Tags já ganhas antes desta regra: continuam definitivas (is_permanent =
-- true, como foram concedidas). A regra vale para o que for ganho daqui em
-- diante.
--
-- Permissões
-- ---------------------------------------------------------------------------

revoke all on function public.seasonal_action_valid(uuid, text, int) from public, anon, authenticated;
revoke all on function public.seasonal_step_progress(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.grant_seasonal_tags(uuid, text, int) from public, anon, authenticated;
revoke all on function public.revalidate_seasonal_tags(uuid, text) from public, anon, authenticated;
revoke all on function public.revalidate_seasonal_tags_for_movie(uuid, int) from public, anon, authenticated;
revoke all on function public.trigger_seasonal_revalidate_on_movie() from public, anon, authenticated;
revoke all on function public.trigger_seasonal_revalidate_on_review() from public, anon, authenticated;
revoke all on function public.finalize_seasonal_tags() from public, anon, authenticated;
revoke all on function public.get_seasonal_event_state(text) from public;
grant execute on function public.get_seasonal_event_state(text) to anon, authenticated;
