-- A Mesa dos Oráculos · as 6 funções públicas (SPEC §5.10, §5.11) · 05/11/2026
--
-- Todas: SECURITY DEFINER, search_path fixo, auth.uid() (nenhuma recebe
-- user_id), revoke de public/anon e grant só para authenticated. Toda leitura
-- e escrita de carta usa "id = p_card and user_id = auth.uid()". Nada de
-- Premium, nada de IA. Bots não usam a Mesa (não geram vetor nem tiragem).

-- ---------------------------------------------------------------------------
-- A chamada principal: a tiragem do dia (p_ask null) ou uma pergunta.
create or replace function public.mesa_get(p_ask text default null, p_media text default 'all')
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_day date;
  v_ask text;
  v_media text := coalesce(nullif(p_media, ''), 'all');
  v_occ_media text;
  v_draw uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.bot_accounts b where b.user_id = v_uid) then
    return jsonb_build_object('error', 'bot');
  end if;
  if v_media not in ('all','movie','tv') then return jsonb_build_object('error', 'bad_media'); end if;
  v_day := public.mesa_day();

  -- Validação por regex, existência e atividade (a época só com o evento no ar).
  if p_ask is null or p_ask = '' then
    v_ask := 'daily';
  elsif p_ask !~ '^(occ:[a-z]+|mood:[a-z-]+|season:(halloween|christmas))$' then
    return jsonb_build_object('error', 'bad_ask');
  elsif p_ask like 'occ:%' then
    select o.media into v_occ_media from public.mesa_occasions o
     where o.key = substr(p_ask, 5) and o.is_active and o.grp <> 'season' and o.season_event is null;
    if not found then return jsonb_build_object('error', 'bad_ask'); end if;
    v_ask := p_ask;
  elsif p_ask like 'mood:%' then
    if not exists (select 1 from public.cine_moods cm where cm.mood_key = substr(p_ask, 6)) then
      return jsonb_build_object('error', 'bad_ask');
    end if;
    v_ask := p_ask;
  else
    select o.media into v_occ_media from public.mesa_occasions o where o.key = p_ask and o.is_active;
    if not found or public.mesa_live_event(v_day) is distinct from split_part(p_ask, ':', 2) then
      return jsonb_build_object('error', 'bad_ask');
    end if;
    v_ask := p_ask;
  end if;
  -- A mídia da ocasião vence o filtro da pessoa.
  if v_occ_media is not null then v_media := v_occ_media; end if;

  select dr.id into v_draw from public.mesa_draws dr
   where dr.user_id = v_uid and dr.day = v_day and dr.ask = v_ask and dr.media = v_media;
  if v_draw is null then
    v_draw := public.mesa_draw_create(v_uid, v_day, v_ask, v_media);
  end if;

  -- Estado leve (fatos do Espelho), depois da tiragem: os fatos dela olham a
  -- visita anterior.
  select p.personalidade_completa into v_code from public.profiles p where p.id = v_uid;
  insert into public.mesa_user_state as s (user_id, last_visit_day, prev_visit_day, last_code, updated_at)
  values (v_uid, v_day, null, v_code, now())
  on conflict (user_id) do update set
    prev_visit_day = case when s.last_visit_day is distinct from excluded.last_visit_day then s.last_visit_day else s.prev_visit_day end,
    last_visit_day = excluded.last_visit_day,
    last_code = excluded.last_code,
    updated_at = now();

  return public.mesa_payload(v_draw);
end $$;

-- ---------------------------------------------------------------------------
-- Os gestos numa carta. O servidor confere o selo da Cypher e nunca confia na
-- nota do cliente: no "Já vi" ele lê a nota gravada em user_movies.
create or replace function public.mesa_react(p_card uuid, p_action text, p_rating smallint default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  r_c public.mesa_cards%rowtype;
  r_d public.mesa_draws%rowtype;
  v_day date := public.mesa_day();
  v_rating int; v_wl boolean; v_cat text;
  v_new uuid; v_pass jsonb; v_verdict jsonb; v_me jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_action is null or p_action not in ('flip','want','seen','refuse','not_seen') then
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;

  select * into r_c from public.mesa_cards c where c.id = p_card and c.user_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r_c.day <> v_day then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if not r_c.active or r_c.state in ('seen','refused','not_seen') then
    return jsonb_build_object('ok', false, 'error', 'bad_state');
  end if;
  -- O selo: a carta da Cypher só abre com Bogart e Fincher virados (ou com o
  -- assento deles vazio por "passou a vez").
  if r_c.seat = 'cypher' and r_c.state = 'down' and exists (
       select 1 from public.mesa_cards b
        where b.draw_id = r_c.draw_id and b.active and b.seat in ('bogart','fincher') and b.state = 'down') then
    return jsonb_build_object('ok', false, 'error', 'sealed');
  end if;

  if p_action = 'flip' then
    if r_c.state = 'down' then
      update public.mesa_cards set state = 'up', flipped_at = now() where id = r_c.id;
    end if;

  elsif p_action = 'want' then
    select (um.rating is null) into v_wl from public.user_movies um
     where um.user_id = v_uid and um.movie_id = r_c.tmdb_id and um.media_type = r_c.media_type;
    if not coalesce(v_wl, false) then return jsonb_build_object('ok', false, 'error', 'not_in_list'); end if;
    update public.mesa_cards set state = 'want', flipped_at = coalesce(flipped_at, now()), reacted_at = now()
     where id = r_c.id;

  elsif p_action = 'seen' then
    select um.rating into v_rating from public.user_movies um
     where um.user_id = v_uid and um.movie_id = r_c.tmdb_id and um.media_type = r_c.media_type and um.rating is not null;
    if v_rating is null then return jsonb_build_object('ok', false, 'error', 'not_rated'); end if;
    v_cat := public.mesa_category(v_rating, r_c.pred);
    -- A reação é instantânea, então o veredito já nasce ouvido.
    update public.mesa_cards
       set state = 'seen', flipped_at = coalesce(flipped_at, now()), reacted_at = now(),
           rating = v_rating, rated_at = coalesce(rated_at, now()), verdict = v_cat, verdict_ack = true,
           active = (seat = 'espelho')
     where id = r_c.id;
    v_verdict := jsonb_build_object('category', v_cat, 'rating', v_rating);
    if r_c.seat <> 'espelho' then
      v_new := public.mesa_promote(r_c.draw_id, r_c.seat);
      if v_new is null then
        v_pass := jsonb_build_object('seat', r_c.seat, 'reason', 'empty');
        update public.mesa_draws set passed = passed || jsonb_build_array(v_pass) where id = r_c.draw_id;
      end if;
    end if;

  elsif p_action = 'refuse' then
    insert into public.mesa_feedback as f (user_id, media_type, tmdb_id, kind, until)
    values (v_uid, r_c.media_type, r_c.tmdb_id, 'refused', v_day + 180)
    on conflict (user_id, media_type, tmdb_id) do update
      set kind = 'refused', until = greatest(f.until, excluded.until), created_at = now();
    update public.mesa_cards
       set state = 'refused', flipped_at = coalesce(flipped_at, now()), reacted_at = now(), active = (seat = 'espelho')
     where id = r_c.id;
    if r_c.seat <> 'espelho' then
      select * into r_d from public.mesa_draws dr where dr.id = r_c.draw_id for update;
      if r_c.seat = any(r_d.second_opinion) then
        -- 2ª recusa no mesmo assento: o oráculo passa a vez.
        v_pass := jsonb_build_object('seat', r_c.seat, 'reason', 'refused');
        update public.mesa_draws set passed = passed || jsonb_build_array(v_pass) where id = r_c.draw_id;
      else
        update public.mesa_draws set second_opinion = array_append(second_opinion, r_c.seat) where id = r_c.draw_id;
        v_new := public.mesa_promote(r_c.draw_id, r_c.seat);
        if v_new is null then
          v_pass := jsonb_build_object('seat', r_c.seat, 'reason', 'empty');
          update public.mesa_draws set passed = passed || jsonb_build_array(v_pass) where id = r_c.draw_id;
        end if;
      end if;
    end if;

  elsif p_action = 'not_seen' then
    -- "Não vi" é do reconhecimento: troca sem penalidade; o título volta em 30 dias.
    if r_c.kind not in ('recon','reveal') then return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
    insert into public.mesa_feedback as f (user_id, media_type, tmdb_id, kind, until)
    values (v_uid, r_c.media_type, r_c.tmdb_id, 'not_seen', v_day + 30)
    on conflict (user_id, media_type, tmdb_id) do update
      set kind = case when f.until >= excluded.until then f.kind else excluded.kind end,
          until = greatest(f.until, excluded.until);
    update public.mesa_cards
       set state = 'not_seen', flipped_at = coalesce(flipped_at, now()), reacted_at = now(), active = (seat = 'espelho')
     where id = r_c.id;
    if r_c.seat <> 'espelho' then
      v_new := public.mesa_promote(r_c.draw_id, r_c.seat);
      if v_new is null then
        v_pass := jsonb_build_object('seat', r_c.seat, 'reason', 'empty');
        update public.mesa_draws set passed = passed || jsonb_build_array(v_pass) where id = r_c.draw_id;
      end if;
    end if;
  end if;

  v_me := public.mesa_me(v_uid);
  return jsonb_build_object(
    'ok', true,
    'card', public.mesa_cards_json(v_uid, array[r_c.id])->0,
    'replacement', case when v_new is not null then public.mesa_cards_json(v_uid, array[v_new])->0 end,
    'pass', v_pass,
    'verdict', v_verdict,
    'persona', v_me->'persona',
    'me', jsonb_build_object('rated', v_me->'rated', 'pred_label', v_me->'pred_label', 'persona_progress', v_me->'persona_progress'));
end $$;

-- ---------------------------------------------------------------------------
-- Os vereditos foram ouvidos (só cartas da própria pessoa).
create or replace function public.mesa_ack(p_card_ids uuid[])
returns int language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.mesa_cards c set verdict_ack = true
   where c.user_id = v_uid and c.id = any(coalesce(p_card_ids, '{}'::uuid[])) and not c.verdict_ack;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- O Livro, paginado por dia: as cartas viradas, a pergunta, o oráculo, o
-- comentário selado, o estado e a nota DA PESSOA. Nunca a nota prevista.
create or replace function public.mesa_book(p_before date default null, p_days int default 10)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_days int := least(greatest(coalesce(p_days, 10), 1), 30);
  v_out jsonb; v_min date; v_next date;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  with dd as (
    select distinct c.day from public.mesa_cards c
     where c.user_id = v_uid and c.state <> 'down' and (p_before is null or c.day < p_before)
     order by c.day desc
     limit v_days
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', dd.day,
           'entries', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'card_id', c.id, 'seat', c.seat, 'oracle', c.oracle, 'kind', c.kind,
                      'ask', case when dr.ask = 'daily' then null else dr.ask end,
                      'title', jsonb_build_object(
                         'tmdb_id', c.tmdb_id, 'media_type', c.media_type, 'title_pt', mc.title_pt, 'title_en', mc.title_en,
                         'year', extract(year from mc.release_date)::int, 'poster_path', mc.poster_path, 'poster_path_pt', mc.poster_path_pt),
                      'comment', jsonb_build_object('pt', cm.pt, 'en', cm.en),
                      'state', c.state, 'rating', c.rating, 'verdict', c.verdict)
                    order by c.created_at, array_position(array['bogart','fincher','cypher','espelho'], c.seat), c.gen), '[]'::jsonb)
               from public.mesa_cards c
               join public.mesa_draws dr on dr.id = c.draw_id
               left join public.movie_cache mc on mc.tmdb_id = c.tmdb_id and mc.media_type = c.media_type
               left join lateral (
                 select toc.pt, toc.en from public.title_oracle_comments toc
                  where toc.card_type = c.oracle and toc.media_type = c.media_type and toc.tmdb_id = c.tmdb_id
                  order by (toc.mood_key = c.mood) desc, toc.mood_key limit 1
               ) cm on true
              where c.user_id = v_uid and c.day = dd.day and c.state <> 'down'))
           order by dd.day desc), '[]'::jsonb),
         min(dd.day)
    into v_out, v_min
    from dd;
  if v_min is not null and exists (select 1 from public.mesa_cards c
                                    where c.user_id = v_uid and c.state <> 'down' and c.day < v_min) then
    v_next := v_min;
  end if;
  return jsonb_build_object('who_knows_best', public.mesa_who_knows_best(v_uid), 'days', v_out, 'next_before', v_next);
end $$;

-- ---------------------------------------------------------------------------
-- O Acervo: uma prateleira inteira, para todos, sem corte de 20 (§5.15).
-- Os já avaliados saem; os da Watchlist ficam, com a marca. Ordem: mu desc.
create or replace function public.mesa_acervo(p_oracle text, p_mood text, p_media text default 'movie',
                                              p_offset int default 0, p_limit int default 30)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_media text := coalesce(nullif(p_media, ''), 'movie');
  v_lim int := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_n int; v_label text; v_total int; v_unrated int; v_items jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.bot_accounts b where b.user_id = v_uid) then
    return jsonb_build_object('error', 'bot');
  end if;
  if p_oracle is null or p_oracle not in ('bogart','fincher','cypher') or v_media not in ('movie','tv')
     or not exists (select 1 from public.cine_moods cm where cm.mood_key = p_mood) then
    return jsonb_build_object('error', 'bad_args');
  end if;
  perform public.mesa_ensure_vec(v_uid, v_media);
  select count(*) into v_n from public.user_movies um where um.user_id = v_uid and um.rating is not null;
  v_label := public.mesa_pred_label(v_n);

  with vec as (
    select u.id, u.mu, u.pr
      from public.mesa_user_vec uv
      cross join lateral unnest(uv.ids, uv.mu, uv.pr) as u(id, mu, pr)
     where uv.user_id = v_uid and uv.media_type = v_media
  ),
  shelf as (
    select t.tmdb_id from public.mesa_titles t
     where t.oracle = p_oracle and t.mood = p_mood and t.media_type = v_media
  ),
  mine as (
    select um.movie_id, um.rating from public.user_movies um where um.user_id = v_uid and um.media_type = v_media
  ),
  pool as (
    select s.tmdb_id, vec.mu, vec.pr, (mine.movie_id is not null and mine.rating is null) as in_wl
      from shelf s
      left join vec on vec.id = s.tmdb_id
      left join mine on mine.movie_id = s.tmdb_id
     where mine.rating is null
  )
  select (select count(*) from shelf)::int,
         (select count(*) from pool)::int,
         coalesce((
           select jsonb_agg(z.j order by z.ord)
             from (
               select row_number() over (order by p.mu desc nulls last, p.tmdb_id) as ord,
                      jsonb_build_object(
                        'tmdb_id', p.tmdb_id, 'media_type', v_media, 'title_pt', mc.title_pt, 'title_en', mc.title_en,
                        'year', extract(year from mc.release_date)::int, 'poster_path', mc.poster_path, 'poster_path_pt', mc.poster_path_pt,
                        'pred', case when v_label = 'hidden' then null else p.pr end, 'in_watchlist', p.in_wl) as j
                 from pool p
                 left join public.movie_cache mc on mc.tmdb_id = p.tmdb_id and mc.media_type = v_media
                order by p.mu desc nulls last, p.tmdb_id
               offset v_off limit v_lim
             ) z), '[]'::jsonb)
    into v_total, v_unrated, v_items;

  return jsonb_build_object(
    'oracle', p_oracle, 'mood', p_mood, 'media', v_media,
    'total', v_total, 'unrated_total', v_unrated,
    'offset', v_off, 'next_offset', case when v_off + v_lim < v_unrated then v_off + v_lim end,
    'pred_label', v_label, 'items', v_items);
end $$;

-- ---------------------------------------------------------------------------
-- Recalcula os vetores da pessoa se a impressão digital mudou. O cliente chama
-- em segundo plano, sem esperar. No máximo uma vez a cada 60 s.
create or replace function public.mesa_refresh()
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_t0 timestamptz := clock_timestamp();
  v_last timestamptz; v_fp text; v_mt text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.bot_accounts b where b.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'fresh', false, 'ms', 0);
  end if;
  if not pg_try_advisory_xact_lock(hashtext('mesa_refresh:' || v_uid::text)) then
    return jsonb_build_object('ok', true, 'fresh', false, 'ms', 0);
  end if;
  select s.last_refresh_at into v_last from public.mesa_user_state s where s.user_id = v_uid;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object('ok', true, 'fresh', false, 'ms', 0);
  end if;
  insert into public.mesa_user_state as s (user_id, last_refresh_at, updated_at) values (v_uid, now(), now())
  on conflict (user_id) do update set last_refresh_at = now(), updated_at = now();

  v_fp := public.mesa_fingerprint(v_uid);
  for v_mt in select uv.media_type from public.mesa_user_vec uv
               where uv.user_id = v_uid and uv.fingerprint is distinct from v_fp
  loop
    perform public.mesa_refresh_vec(v_uid, v_mt);
  end loop;
  return jsonb_build_object('ok', true, 'fresh', true, 'ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $$;

-- ---------------------------------------------------------------------------
-- As 6 públicas: fora de public/anon, só para authenticated.
revoke all on function public.mesa_get(text, text) from public, anon;
grant execute on function public.mesa_get(text, text) to authenticated;
revoke all on function public.mesa_react(uuid, text, smallint) from public, anon;
grant execute on function public.mesa_react(uuid, text, smallint) to authenticated;
revoke all on function public.mesa_ack(uuid[]) from public, anon;
grant execute on function public.mesa_ack(uuid[]) to authenticated;
revoke all on function public.mesa_book(date, int) from public, anon;
grant execute on function public.mesa_book(date, int) to authenticated;
revoke all on function public.mesa_acervo(text, text, text, int, int) from public, anon;
grant execute on function public.mesa_acervo(text, text, text, int, int) to authenticated;
revoke all on function public.mesa_refresh() from public, anon;
grant execute on function public.mesa_refresh() to authenticated;
