-- A Mesa dos Oráculos · o Acervo: a ordem dos empates (13/11/2026)
--
-- Pedido do Bruno (13/11): "Mude a ordem com que filmes com a mesma nota
-- prevista aparecem para o usuário dentro da biblioteca dos oráculos, para
-- não ficar tudo sempre na mesma ordem."
--
-- Até aqui a prateleira saía pela esperança da nota (mu, um número com
-- casas): dois títulos com o mesmo selo "8" ficavam sempre na mesma ordem,
-- dia após dia. Agora a ordem é a do selo (pr) e, dentro de cada nota, um
-- sorteio por pessoa e por dia, estável entre as páginas do mesmo dia. Sem
-- vetor (ordem do público), nada muda. O site ainda embaralha, a cada visita,
-- os de mesma nota dentro de cada página (useAcervo.ts), então a tela muda
-- também de uma visita para a outra no mesmo dia.
--
-- Única mudança em relação a 20261109100000_mesa_acervo_v2.sql: o ORDER BY
-- do ranked. O resto da função é idêntico (mesma assinatura: o APK instalado
-- continua chamando a mesma função).

create or replace function public.mesa_acervo2(
  p_oracle text,
  p_mood text default null,
  p_media text default 'movie',
  p_occasion text default null,
  p_offset int default 0,
  p_limit int default 30)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
-- Plano sob medida a cada chamada (medido em 09/11): com o plano genérico que
-- o PL/pgSQL adota depois da 5ª execução, a junção da prateleira com o vetor
-- (unnest de ~5.200 notas previstas) virava laço aninhado e a página ia de
-- 4–7 ms para 220–1.170 ms. Planejar estas consultas custa poucos ms.
set plan_cache_mode = force_custom_plan
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := public.mesa_day();
  v_media text := coalesce(nullif(p_media, ''), 'movie');
  v_lim int := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_live text := public.mesa_live_event(public.mesa_day());
  v_occ text;            -- a chave em mesa_occasions ('galera', 'season:christmas')
  v_occ_id text;         -- o id da ficha no site ('galera', 'christmas')
  v_occ_media text;
  v_passed boolean := false;
  v_mood text;
  v_top3 text[];
  v_n int;
  v_label text;
  v_has_vec boolean;
  v_ids int[];
  v_total int := 0;
  v_unrated int := 0;
  v_page jsonb := '[]'::jsonb;
  v_ctx jsonb;
  v_items jsonb := '[]'::jsonb;
  v_occasions jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.bot_accounts b where b.user_id = v_uid) then
    return jsonb_build_object('error', 'bot');
  end if;
  if p_oracle is null or p_oracle not in ('bogart','fincher','cypher') or v_media not in ('movie','tv') then
    return jsonb_build_object('error', 'bad_args');
  end if;

  -- A ocasião: aceita 'galera', 'occ:galera', 'christmas' ou 'season:christmas'.
  -- A da época só vale com o evento no ar. Uma ocasião que não existe (link
  -- velho) não vira erro: some, e a prateleira de humor aparece no lugar.
  if nullif(btrim(coalesce(p_occasion, '')), '') is not null then
    v_occ_id := regexp_replace(btrim(p_occasion), '^(occ|season):', '');
    select o.key, o.media, coalesce(p_oracle = any(o.pass_oracles), false)
      into v_occ, v_occ_media, v_passed
      from public.mesa_occasions o
     where o.is_active
       and ((o.grp <> 'season' and o.season_event is null and o.key = v_occ_id)
            or (o.grp = 'season' and o.season_event = v_occ_id and o.season_event = v_live))
     limit 1;
    if v_occ is null then
      v_occ_id := null;
      v_passed := false;
    end if;
  end if;
  -- Ocasião de um tipo só ("Só um episódio" é série) passa por cima da chave.
  if v_occ_media is not null then v_media := v_occ_media; end if;

  -- O humor: com ocasião, nenhum (todos os humores). Sem humor válido, o mais
  -- forte da pessoa (a 1ª letra da Persona), ou Mind-Blowing.
  if v_occ is null then
    if p_mood is not null and exists (select 1 from public.cine_moods cm where cm.mood_key = p_mood)
       and exists (select 1 from public.mesa_titles t where t.mood = p_mood limit 1) then
      v_mood := p_mood;
    else
      v_top3 := public.mesa_top3(v_uid);
      v_mood := coalesce((select m from unnest(v_top3) m
                           where exists (select 1 from public.mesa_titles t where t.mood = m limit 1) limit 1),
                         'mind-blowing');
    end if;
  end if;

  -- O vetor da pessoa (a nota prevista do acervo inteiro). Sem vetor, ele é
  -- calculado agora (0,3 a 2,3 s hoje; quem tem mais notas é o Bruno, 260). Acima
  -- de 400 notas, sem vetor, a página não espera (o cálculo chegaria perto dos
  -- 8 s do PostgREST): sai na ordem do público, e o aquecimento das 03:40 (quem
  -- avaliou nos últimos 7 dias) calcula o vetor.
  select count(*) into v_n from public.user_movies um where um.user_id = v_uid and um.rating is not null;
  v_label := public.mesa_pred_label(v_n);
  if v_n < 400 or exists (select 1 from public.mesa_user_vec uv where uv.user_id = v_uid and uv.media_type = v_media) then
    perform public.mesa_ensure_vec(v_uid, v_media);
  end if;
  v_has_vec := exists (select 1 from public.mesa_user_vec uv where uv.user_id = v_uid and uv.media_type = v_media);

  -- A prateleira inteira (com os já avaliados): ids do catálogo.
  if v_occ is not null then
    select coalesce(array_agg(o.tmdb_id), '{}'::int[]) into v_ids
      from public.mesa_title_occasions o
      join public.mesa_titles t on t.media_type = o.media_type and t.tmdb_id = o.tmdb_id
     where o.occasion_key = v_occ and o.media_type = v_media and t.oracle = p_oracle;
  else
    select coalesce(array_agg(t.tmdb_id), '{}'::int[]) into v_ids
      from public.mesa_titles t
     where t.oracle = p_oracle and t.mood = v_mood and t.media_type = v_media;
  end if;
  v_total := coalesce(cardinality(v_ids), 0);
  -- O oráculo que passa a vez nesta ocasião (a Cypher no "Quero colo"): a
  -- prateleira vem vazia, com passed = true, e a tela diz isso numa linha.
  if v_passed then v_ids := '{}'::int[]; end if;

  -- A página: os que faltam avaliar, pela nota prevista (pr, a do selo; até
  -- 13/11/2026 era mu, a esperança do vetor); sem vetor, pela nota do
  -- público. Os da Watchlist ficam, marcados.
  with mine as (
    select um.movie_id as id, um.rating
      from public.user_movies um
     where um.user_id = v_uid and um.media_type = v_media
  ),
  vec as (
    select u.id, u.mu, u.pr
      from public.mesa_user_vec uv
      cross join lateral unnest(uv.ids, uv.mu, uv.pr) as u(id, mu, pr)
     where uv.user_id = v_uid and uv.media_type = v_media
  ),
  pool as (
    select s.id, v.mu, v.pr, (m.id is not null) as in_wl, t.vote_avg, t.vote_count, coalesce(o.fit, 0) as fit
      from unnest(v_ids) as s(id)
      join public.mesa_titles t on t.media_type = v_media and t.tmdb_id = s.id
      left join vec v on v.id = s.id
      left join mine m on m.id = s.id
      left join public.mesa_title_occasions o
        on v_occ is not null and o.occasion_key = v_occ and o.media_type = v_media and o.tmdb_id = s.id
     where m.rating is null
  ),
  ranked as (
    select pool.*,
           row_number() over (
             -- 13/11/2026: pela nota prevista que a tela mostra (pr, o número
             -- inteiro do selo), e não mais pela esperança (mu): entre os de
             -- mesma nota, a ordem é sorteada por pessoa e por dia (md5 de
             -- pessoa + dia + título). Muda de um dia para o outro e fica
             -- igual entre as páginas do mesmo dia (a página 2 continua a 1).
             -- Numa ocasião, quem encaixa melhor nela vem antes dentro da
             -- mesma nota (fit em décimos), e o sorteio vale dentro disso.
             order by case when v_has_vec then pool.pr end desc nulls last,
                      case when v_has_vec and v_occ is not null then round(pool.fit::numeric, 1) end desc nulls last,
                      case when v_has_vec then md5(v_uid::text || ':' || v_day::text || ':' || pool.id::text) end,
                      pool.fit desc,
                      pool.vote_avg desc nulls last,
                      pool.vote_count desc,
                      pool.id) as ord,
           count(*) over () as n_all
      from pool
  )
  select coalesce(max(r.n_all), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'ord', r.ord, 'pr', r.pr, 'in_wl', r.in_wl) order by r.ord)
                    filter (where r.ord > v_off and r.ord <= v_off + v_lim), '[]'::jsonb)
    into v_unrated, v_page
    from ranked r;

  -- O retrato da pessoa que o porquê usa (o mesmo do mesa_ctx, sem tiragem):
  -- quantas notas, média, humores, países, décadas e as três prateleiras.
  if jsonb_array_length(v_page) > 0 then
    if v_top3 is null then v_top3 := public.mesa_top3(v_uid); end if;
    with r as (
      select um.rating::float as rating, t.mood,
             coalesce(mc.origin_country, '{}'::text[]) as oc, extract(year from mc.release_date)::int as yr
        from public.user_movies um
        left join public.mesa_titles t on t.media_type = um.media_type and t.tmdb_id = um.movie_id
        left join public.movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
       where um.user_id = v_uid and um.rating is not null
    ),
    agg as (select count(*)::int as n, coalesce(avg(r.rating), 7.24) as mean from r),
    md as (select r.mood, count(*)::int as n, avg(r.rating) as a from r where r.mood is not null group by r.mood)
    select jsonb_build_object(
             'day', v_day, 'kind', 'daily',
             'n_rated', agg.n,
             'user_mean', round(agg.mean::numeric, 4),
             'moods', coalesce((select jsonb_object_agg(md.mood, jsonb_build_object('n', md.n, 'avg', round(md.a::numeric, 3))) from md), '{}'::jsonb),
             'countries', coalesce((select jsonb_agg(distinct c) from r cross join lateral unnest(r.oc) c), '[]'::jsonb),
             'decades', coalesce((select jsonb_agg(distinct (r.yr / 10) * 10) from r where r.yr is not null), '[]'::jsonb),
             'top3', to_jsonb(coalesce(v_top3, '{}'::text[])))
      into v_ctx
      from agg;

    -- As âncoras, só para os títulos da página (a mesma regra da tiragem):
    -- sementes são as notas 9 e 10 (ou 2 pontos acima do público); liga pelo
    -- mesmo diretor ou por 2+ palavras-chave raras em comum (df 2 a 400),
    -- pesando as notas recentes. Depois, o porquê de cada título.
    with rated as (
      select um.movie_id as id, um.media_type as mt, um.rating, coalesce(um.updated_at, um.created_at) as ts
        from public.user_movies um
       where um.user_id = v_uid and um.rating is not null and um.rating > 4
    ),
    seeds as (
      select rated.id, rated.mt,
             greatest(0.35, power(0.5, extract(epoch from (now() - rated.ts)) / 86400.0 / 180.0)) as w,
             m1.dir, m1.keywords
        from rated
        cross join lateral (
          select nullif(lower(btrim(coalesce(mc.director, ''))), '') as dir, mc.keywords, mc.vote_average
            from public.movie_cache mc
           where mc.tmdb_id = rated.id and mc.media_type = rated.mt
           limit 1
        ) m1
       where rated.rating >= 9 or (coalesce(m1.vote_average, 0) > 0 and rated.rating - m1.vote_average >= 2)
    ),
    skw as (
      select distinct s.id as sid, s.mt as smt, s.w, mk.kw_id, mk.idf
        from seeds s
        cross join lateral jsonb_array_elements(case when jsonb_typeof(s.keywords) = 'array' then s.keywords else '[]'::jsonb end) e
        join public.mesa_kw mk on mk.kw_id = case when (e->>'id') ~ '^[0-9]+$' then (e->>'id')::int end
       where mk.df between 2 and 400
    ),
    page as (
      select (x->>'id')::int as id, (x->>'ord')::int as ord, (x->>'pr')::int as pr, (x->>'in_wl')::boolean as in_wl
        from jsonb_array_elements(v_page) x
    ),
    pkw as (
      select tk.tmdb_id, tk.kw_id
        from public.mesa_title_kw tk
        join page on page.id = tk.tmdb_id
       where tk.media_type = v_media
    ),
    kp as (
      select pkw.tmdb_id, skw.sid, skw.smt, max(skw.w) * sum(skw.idf) as sc
        from pkw
        join skw on skw.kw_id = pkw.kw_id
       group by pkw.tmdb_id, skw.sid, skw.smt
      having count(*) >= 2
    ),
    kbest as (
      select distinct on (kp.tmdb_id) kp.tmdb_id, kp.sid, kp.smt
        from kp
       order by kp.tmdb_id, kp.sc desc, kp.sid
    ),
    dbest as (
      select distinct on (t.tmdb_id) t.tmdb_id, s.id as sid, s.mt as smt
        from page
        join public.mesa_titles t on t.media_type = v_media and t.tmdb_id = page.id
        join seeds s on s.dir = t.director_key
       where t.director_key is not null
       order by t.tmdb_id, s.w desc, s.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'tmdb_id', page.id,
             'media_type', v_media,
             'title_pt', mc.title_pt,
             'title_en', mc.title_en,
             'year', extract(year from mc.release_date)::int,
             'poster_path', mc.poster_path,
             'poster_path_pt', mc.poster_path_pt,
             'pred', case when v_label = 'hidden' then null else page.pr end,
             'in_watchlist', page.in_wl,
             -- O porquê principal e as duas provas (até 3, na ordem do oráculo):
             -- a tela mostra UMA linha, a primeira que diz algo deste título.
             'reasons', jsonb_build_array(rs.r->'reason') || coalesce(rs.r->'evidence', '[]'::jsonb))
           order by page.ord), '[]'::jsonb)
      into v_items
      from page
      left join public.movie_cache mc on mc.tmdb_id = page.id and mc.media_type = v_media
      left join kbest kb on kb.tmdb_id = page.id
      left join dbest db on db.tmdb_id = page.id
      cross join lateral (
        select public.mesa_reasons(v_uid, v_ctx, p_oracle, jsonb_build_object(
                 'media_type', v_media, 'tmdb_id', page.id,
                 'dir_sid', db.sid, 'dir_smt', db.smt, 'kw_sid', kb.sid, 'kw_smt', kb.smt)) as r
      ) rs;
  end if;

  -- As fichas das ocasiões (só na primeira página): as 12 e a da época quando
  -- o evento está no ar. O nome curto de cada uma mora no site (pt e en).
  if v_off = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', case when o.grp = 'season' then o.season_event else o.key end,
             'grp', o.grp, 'sort', o.sort, 'media', o.media, 'pass', to_jsonb(o.pass_oracles))
           order by o.sort), '[]'::jsonb)
      into v_occasions
      from public.mesa_occasions o
     where o.is_active
       and ((o.grp <> 'season' and o.season_event is null) or (o.grp = 'season' and o.season_event = v_live));

    -- A visita do dia: mantém o vetor da pessoa vivo (mesa_cleanup só apaga
    -- vetor de quem não aparece há 30 dias) agora que a Mesa é o Acervo.
    -- Uma escrita por dia, no máximo.
    insert into public.mesa_user_state as s (user_id, last_visit_day, prev_visit_day, updated_at)
    values (v_uid, v_day, null, now())
    on conflict (user_id) do update set
      prev_visit_day = s.last_visit_day,
      last_visit_day = excluded.last_visit_day,
      updated_at = now()
    where s.last_visit_day is distinct from excluded.last_visit_day;
  end if;

  return jsonb_build_object(
    'v', 2,
    'oracle', p_oracle,
    'mood', v_mood,
    'occasion', v_occ_id,
    'media', v_media,
    'total', v_total,
    'unrated_total', v_unrated,
    'offset', v_off,
    'next_offset', case when v_off + v_lim < v_unrated then v_off + v_lim end,
    'pred_label', v_label,
    'order', case when v_has_vec then 'pred' else 'public' end,
    'passed', v_passed,
    'live_event', v_live,
    'occasions', v_occasions,
    'items', v_items);
end $$;

revoke all on function public.mesa_acervo2(text, text, text, text, int, int) from public, anon;
grant execute on function public.mesa_acervo2(text, text, text, text, int, int) to authenticated;
