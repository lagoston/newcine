-- A Mesa dos Oráculos · correções do QA (WP-DB-FIX, 05/11/2026)
--
-- Defeitos de oracle/build/QA_REPORT.md §1 que não precisam apagar nada:
--   B1  mesa_draw_create: a regra "no máximo uma série" só vale na mídia 'all'
--       (com "Só séries" a Mesa dava 1 carta e dois oráculos passavam a vez).
--   M1  plano genérico em mesa_slot_candidates e mesa_recon_candidates (as
--       primeiras perguntas de cada conexão levavam de 1,2 a 3,3 s).
--   M4  mesa_promote: a reserva que entra recalcula o porquê na hora (não diz
--       mais "nenhuma nota sua nos anos 60" logo depois de um 10 nos anos 60).
--   m4  "Não vi" no reconhecimento prefere um humor que ainda não está na mesa.
--   m5  mesa_promote: a reserva também respeita "no máximo uma série" (mídia 'all').
--   m6  reforço curado do reconhecimento (recog_rank = 0) leva a razão "casa",
--       não "um dos mais vistos" (pode ter poucos votos).
--   M2  "Tenho 90 minutos" vai até 90 minutos (era 100).
--   M5  Five Nights at Freddy's sai de "Domingo em família" (−1; o +1 de "susto" fica).
--   M3  "Clima de Natal" sem títulos pesados, Sombrios ou Psicodélicos, com
--       exceções curadas (+1) e vetos (−1) lidos à mão nos 103 candidatos.
-- A parte do M3/M5/m9 que mexe na construção do catálogo (mesa_build_titles)
-- fica em 20261105145000_mesa_upkeep_fixes.sql, porque a construção apaga linhas
-- e passa pela aprovação à parte. Os dados abaixo valem já na próxima construção.
-- Nada de Premium, nada de IA: só regras.

-- ---------------------------------------------------------------------------
-- M1 (05/11/2026): plano genérico. No PL/pgSQL, as 5 primeiras execuções de
-- cada conexão usam plano sob medida, e planejar a consulta grande (CTEs sobre
-- ~6.500 títulos) custava de 1 a 3 s por pergunta numa conexão nova. Com o
-- plano genérico, o QA mediu 85–153 ms frio. O ALTER só acrescenta a opção:
-- search_path e enable_nestloop = off continuam como estavam.
alter function public.mesa_slot_candidates(uuid, uuid, text, int) set plan_cache_mode = force_generic_plan;
alter function public.mesa_recon_candidates(uuid, uuid, text, int) set plan_cache_mode = force_generic_plan;

-- ---------------------------------------------------------------------------
-- m6 (05/11/2026): a razão de uma carta do reconhecimento. Os títulos do
-- reforço curado (mesa_recognition_boost, recog_rank = 0) entram por escolha
-- da casa, não por serem dos mais vistos: Ainda Estou Aqui tem 1.187 votos e
-- as falas podiam dizer "pouca gente viu" ao lado de "um dos mais vistos".
create or replace function public.mesa_recon_reason(p_item jsonb)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select case
           when (p_item->>'recog_rank')::int = 0 then
             jsonb_build_object('type', 'house', 'facts', jsonb_build_object('public',
               (select round(t.vote_avg::numeric, 1) from public.mesa_titles t
                 where t.media_type = 'movie' and t.tmdb_id = (p_item->>'tmdb_id')::int)))
           else
             jsonb_build_object('type', 'recognition', 'facts', jsonb_build_object('mood', p_item->>'mood', 'votes', (p_item->>'votes')::int))
         end
$$;

-- ---------------------------------------------------------------------------
-- A tiragem (§5.4). Uma por pessoa × dia × pergunta × mídia, gravada; pedir
-- de novo devolve a mesma. Determinística pela semente.
-- 05/11/2026 (WP-DB-FIX): B1 — a trava de série só vale com mídia 'all';
-- m6 — razão do reconhecimento por mesa_recon_reason; M4 — as reservas levam
-- dir_sid/dir_smt/kw_sid/kw_smt, para o porquê poder ser recalculado na troca.
create or replace function public.mesa_draw_create(p_uid uuid, p_day date, p_ask text, p_media text)
returns uuid language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_id uuid; v_seed int; v_n int; v_mode text; v_kind text;
  r_occ public.mesa_occasions%rowtype;
  v_ctx jsonb; v_cands jsonb; v_seat text; v_c jsonb; v_main jsonb; v_res jsonb; v_tmp jsonb; v_rs jsonb;
  v_reserves jsonb := '{}'::jsonb; v_passed jsonb := '[]'::jsonb;
  v_moods text[] := '{}'; v_dirs text[] := '{}'; v_colls int[] := '{}';
  v_wl_taken boolean := false; v_series_taken boolean := false;
  v_host text; v_order text[]; v_rot text[]; v_used text[] := '{}'; v_m text; v_i int;
  v_code text; v_counted int; v_mused int; v_rmood text; v_ws date; v_has_reveal boolean := false;
  v_seats text[] := array['bogart','fincher','cypher'];
begin
  -- Passo 0: trava e semente.
  perform pg_advisory_xact_lock(hashtext(p_uid::text || p_day::text || p_ask || p_media));
  select dr.id into v_id from public.mesa_draws dr
   where dr.user_id = p_uid and dr.day = p_day and dr.ask = p_ask and dr.media = p_media;
  if found then return v_id; end if;

  v_seed := (hashtextextended(p_uid::text || '|' || p_day::text || '|' || p_ask || '|' || p_media, 42) & 2147483647)::int;
  select count(*) into v_n from public.user_movies um where um.user_id = p_uid and um.rating is not null;
  v_kind := case when p_ask = 'daily' then 'daily' when p_ask like 'occ:%' then 'occ'
                 when p_ask like 'mood:%' then 'mood' else 'season' end;
  v_mode := case when v_kind = 'daily' and v_n < 10 then 'recon' else 'normal' end;
  if v_kind = 'occ' then
    select * into r_occ from public.mesa_occasions o where o.key = substr(p_ask, 5);
  elsif v_kind = 'season' then
    select * into r_occ from public.mesa_occasions o where o.key = p_ask;
  end if;

  insert into public.mesa_draws (user_id, day, ask, media, mode, seed)
  values (p_uid, p_day, p_ask, p_media, v_mode, v_seed)
  returning id into v_id;

  -- Passo 2: vetores (política de frescor do §5.1).
  perform public.mesa_ensure_vec(p_uid, 'movie');
  if p_media in ('all','tv') then perform public.mesa_ensure_vec(p_uid, 'tv'); end if;
  v_ctx := public.mesa_ctx(p_uid, v_id);

  if v_mode = 'recon' then
    -- Modo reconhecimento: cada oráculo traz um dos mais vistos dele, num humor
    -- diferente, de preferência os que a pessoa ainda não avaliou.
    v_order := array(select cm.mood_key from public.cine_moods cm
                      order by coalesce((v_ctx->'moods'->cm.mood_key->>'n')::int, 0), hashtext(v_seed::text || cm.mood_key), cm.mood_key);
    foreach v_seat in array v_seats loop
      v_cands := public.mesa_recon_candidates(p_uid, v_id, v_seat, 8);
      v_main := null;
      foreach v_m in array v_order loop
        continue when v_m = any(v_used);
        select x.value into v_main from jsonb_array_elements(v_cands) x
         where x.value->>'mood' = v_m order by (x.value->>'key')::float desc, (x.value->>'tmdb_id')::int limit 1;
        exit when v_main is not null;
      end loop;
      if v_main is null then
        v_passed := v_passed || jsonb_build_array(jsonb_build_object('seat', v_seat, 'reason', 'empty'));
        continue;
      end if;
      v_used := v_used || (v_main->>'mood');
      v_i := array_position(v_order, v_main->>'mood');
      v_rot := v_order[v_i + 1:] || v_order[1:v_i];
      select coalesce(jsonb_agg(z.value order by z.rn, z.pos), '[]'::jsonb) into v_res
        from (
          select x.value,
                 row_number() over (partition by x.value->>'mood' order by (x.value->>'key')::float desc, (x.value->>'tmdb_id')::int) as rn,
                 array_position(v_rot, x.value->>'mood') as pos
            from jsonb_array_elements(v_cands) x
           where (x.value->>'tmdb_id')::int <> (v_main->>'tmdb_id')::int
           order by rn, pos limit 6
        ) z;
      -- m6 (05/11/2026): reforço curado (recog_rank = 0) leva "casa", não "um dos mais vistos".
      insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, media_type, tmdb_id, oracle, mood,
                                     pred, mu, p9, p10, reason, evidence)
      values (v_id, p_uid, p_day, v_seat, 'recon', 0, 'movie', (v_main->>'tmdb_id')::int, v_seat, v_main->>'mood',
              (v_main->>'pred')::smallint, (v_main->>'mu')::real, (v_main->>'p9')::real, (v_main->>'p10')::real,
              public.mesa_recon_reason(v_main),
              '[]'::jsonb);
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', (x.value->>'tmdb_id')::int, 'media_type', 'movie', 'mood', x.value->>'mood',
               'pred', x.value->'pred', 'mu', x.value->'mu', 'p9', x.value->'p9', 'p10', x.value->'p10',
               'reason', public.mesa_recon_reason(x.value),
               'evidence', '[]'::jsonb, 'director_key', x.value->'director_key', 'collection_id', x.value->'collection_id')
               order by x.ord), '[]'::jsonb)
        into v_tmp from jsonb_array_elements(v_res) with ordinality as x(value, ord);
      v_reserves := v_reserves || jsonb_build_object(v_seat, v_tmp);
    end loop;
  else
    -- Passos 3 a 7: candidatos, pontuação, sorteio e travas (Bogart → Fincher → Cypher).
    v_cands := public.mesa_slot_candidates(p_uid, v_id, null, 40);
    foreach v_seat in array v_seats loop
      if r_occ.key is not null and v_seat = any(r_occ.pass_oracles) then
        -- Em "colo", a Cypher passa a vez de propósito.
        v_passed := v_passed || jsonb_build_array(jsonb_build_object('seat', v_seat, 'reason', 'colo'));
        continue;
      end if;
      v_main := null;
      v_res := '[]'::jsonb;
      for v_c in
        select x.value from jsonb_array_elements(coalesce(v_cands->v_seat, '[]'::jsonb)) x
         order by ((x.value->>'s')::float
                   - case when v_kind <> 'mood' and (x.value->>'mood') = any(v_moods) then 0.15 else 0 end
                   - case when v_wl_taken then (x.value->>'wl')::float else 0 end) / (x.value->>'tau')::float
                  + (x.value->>'g')::float desc,
                  (x.value->>'tmdb_id')::int, x.value->>'media_type'
      loop
        continue when (v_c->>'director_key') is not null and (v_c->>'director_key') = any(v_dirs);
        continue when (v_c->>'collection_id') is not null and (v_c->>'collection_id')::int = any(v_colls);
        -- B1 (05/11/2026): "no máximo uma série" é só para a mídia 'all' (§5.4
        -- passo 7). Com "Só séries" todos os candidatos são séries, e a trava
        -- fazia Fincher e Cypher passarem a vez depois da série do Bogart.
        continue when v_series_taken and v_kind <> 'daily' and r_occ.media is null and p_media = 'all' and v_c->>'media_type' = 'tv';
        if v_main is null then
          v_main := v_c;
        else
          v_res := v_res || jsonb_build_array(v_c);
          exit when jsonb_array_length(v_res) >= 6;
        end if;
      end loop;
      if v_main is null then
        v_passed := v_passed || jsonb_build_array(jsonb_build_object('seat', v_seat, 'reason', 'empty'));
        continue;
      end if;
      v_rs := public.mesa_reasons(p_uid, v_ctx, v_seat, v_main);
      insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, media_type, tmdb_id, oracle, mood,
                                     pred, mu, p9, p10, reason, evidence)
      values (v_id, p_uid, p_day, v_seat, 'main', 0, v_main->>'media_type', (v_main->>'tmdb_id')::int, v_seat, v_main->>'mood',
              (v_main->>'pred')::smallint, (v_main->>'mu')::real, (v_main->>'p9')::real, (v_main->>'p10')::real,
              v_rs->'reason', coalesce(v_rs->'evidence', '[]'::jsonb));
      -- M4 (05/11/2026): a reserva guarda também as sementes da âncora
      -- (dir_sid/dir_smt/kw_sid/kw_smt), para mesa_promote recalcular o porquê
      -- com o retrato da pessoa no momento da troca.
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', (x.value->>'tmdb_id')::int, 'media_type', x.value->>'media_type', 'mood', x.value->>'mood',
               'pred', x.value->'pred', 'mu', x.value->'mu', 'p9', x.value->'p9', 'p10', x.value->'p10',
               'reason', rr.v->'reason', 'evidence', coalesce(rr.v->'evidence', '[]'::jsonb),
               'director_key', x.value->'director_key', 'collection_id', x.value->'collection_id',
               'dir_sid', x.value->'dir_sid', 'dir_smt', x.value->'dir_smt', 'kw_sid', x.value->'kw_sid', 'kw_smt', x.value->'kw_smt')
               order by x.ord), '[]'::jsonb)
        into v_tmp
        from jsonb_array_elements(v_res) with ordinality as x(value, ord)
        cross join lateral (select public.mesa_reasons(p_uid, v_ctx, v_seat, x.value) as v) rr;
      v_reserves := v_reserves || jsonb_build_object(v_seat, v_tmp);
      -- As travas para os assentos seguintes.
      v_moods := v_moods || (v_main->>'mood');
      if (v_main->>'director_key') is not null then v_dirs := v_dirs || (v_main->>'director_key'); end if;
      if (v_main->>'collection_id') is not null then v_colls := v_colls || (v_main->>'collection_id')::int; end if;
      if coalesce((v_main->>'in_wl')::boolean, false) then v_wl_taken := true; end if;
      if v_main->>'media_type' = 'tv' then v_series_taken := true; end if;
    end loop;
  end if;

  -- Passo 9: cartas extras, só na tiragem diária (§5.7). A da revelação vence.
  if v_kind = 'daily' then
    select p.personalidade_completa, coalesce(p.persona_counted, 0),
           (select count(*) from jsonb_array_elements(coalesce(p.persona_scores, '[]'::jsonb)) s where coalesce((s->>'films')::int, 0) > 0)
      into v_code, v_counted, v_mused
      from public.profiles p where p.id = p_uid;
    if v_code is null and (v_counted >= 7 or (v_counted >= 10 and v_mused < 3)) then
      select cm.mood_key into v_rmood from public.cine_moods cm
       where coalesce((v_ctx->'moods'->cm.mood_key->>'n')::int, 0) = 0
       order by cm.sort_order limit 1;
      if v_rmood is not null then
        insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, media_type, tmdb_id, oracle, mood,
                                       pred, mu, p9, p10, reason, evidence)
        select v_id, p_uid, p_day, 'espelho', 'reveal', 0, 'movie', x.tmdb_id, x.oracle, x.mood,
               uv.pr[array_position(uv.ids, x.tmdb_id)], uv.mu[array_position(uv.ids, x.tmdb_id)],
               uv.p9[array_position(uv.ids, x.tmdb_id)], uv.p10[array_position(uv.ids, x.tmdb_id)],
               jsonb_build_object('type', 'reveal', 'facts', jsonb_build_object('missing', greatest(1, 10 - v_counted), 'mood', v_rmood)),
               '[]'::jsonb
          from (
            select t.tmdb_id, t.oracle, t.mood from public.mesa_titles t
             where t.media_type = 'movie' and t.mood = v_rmood and t.recog_rank is not null
               and not exists (select 1 from public.user_movies um
                                where um.user_id = p_uid and um.movie_id = t.tmdb_id and um.media_type = 'movie' and um.rating is not null)
               and not exists (select 1 from public.mesa_feedback f
                                where f.user_id = p_uid and f.media_type = 'movie' and f.tmdb_id = t.tmdb_id and f.until >= p_day)
               and not exists (select 1 from public.mesa_cards c where c.draw_id = v_id and c.media_type = 'movie' and c.tmdb_id = t.tmdb_id)
             order by t.recog_rank, t.vote_count desc, t.tmdb_id
             limit 1
          ) x
          left join public.mesa_user_vec uv on uv.user_id = p_uid and uv.media_type = 'movie';
        v_has_reveal := found;
      end if;
    end if;

    if v_mode = 'normal' and not v_has_reveal then
      -- A quarta carta do Espelho: uma por semana de Brasília, depois de uma
      -- nota dada a uma carta da Mesa nesta semana. Nunca da Cypher, nunca com
      -- ressalva; sem sorteio (é a escolha do Espelho).
      v_ws := date_trunc('week', p_day::timestamp)::date;
      if not exists (select 1 from public.mesa_cards c
                      where c.user_id = p_uid and c.kind = 'espelho4' and c.day between v_ws and v_ws + 6)
         and exists (select 1 from public.mesa_cards c
                      where c.user_id = p_uid and c.rated_at >= (v_ws::timestamp at time zone 'America/Sao_Paulo') and c.rated_at <= now()) then
        insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, media_type, tmdb_id, oracle, mood,
                                       pred, mu, p9, p10, reason, evidence)
        select v_id, p_uid, p_day, 'espelho', 'espelho4', 0, x.media_type, x.tmdb_id, x.oracle, x.mood,
               x.pr, x.mu, x.p9, x.p10, jsonb_build_object('type', 'espelho_best', 'facts', '{}'::jsonb), '[]'::jsonb
          from (
            select t.media_type, t.tmdb_id, t.oracle, t.mood, u.pr, u.mu, u.p9, u.p10
              from public.mesa_user_vec uv
              cross join lateral unnest(uv.ids, uv.mu, uv.p9, uv.p10, uv.pr) as u(id, mu, p9, p10, pr)
              join public.mesa_titles t on t.media_type = uv.media_type and t.tmdb_id = u.id
             where uv.user_id = p_uid and uv.media_type = case when p_media = 'tv' then 'tv' else 'movie' end
               and t.oracle in ('bogart','fincher') and not t.ressalva and u.pr >= 7
               and not exists (select 1 from public.user_movies um
                                where um.user_id = p_uid and um.movie_id = t.tmdb_id and um.media_type = t.media_type and um.rating is not null)
               and not exists (select 1 from public.mesa_feedback f
                                where f.user_id = p_uid and f.media_type = t.media_type and f.tmdb_id = t.tmdb_id and f.until >= p_day)
               and not exists (select 1 from public.mesa_cards c
                                where c.user_id = p_uid and c.media_type = t.media_type and c.tmdb_id = t.tmdb_id
                                  and (c.draw_id = v_id or c.created_at >= now() - interval '60 days'))
             order by (u.pr >= 8) desc, u.p10 desc nulls last, u.mu desc nulls last, t.tmdb_id
             limit 1
          ) x;
      end if;
    end if;
  end if;

  -- Passo 8: o anfitrião é o oráculo com a carta de maior p9; empate pela semente.
  select c.oracle into v_host from public.mesa_cards c
   where c.draw_id = v_id and c.seat <> 'espelho'
   order by coalesce(c.p9, 0) desc, hashtext(v_seed::text || c.seat), c.seat
   limit 1;

  update public.mesa_draws
     set host = v_host, reserves = v_reserves, passed = v_passed, facts = public.mesa_facts(p_uid, v_id)
   where id = v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Trocas (§5.5): a primeira reserva ainda válida AGORA vira a carta nova do
-- assento, já virada. Sem reservas, calcula de novo só aquele assento. Quem
-- chama já desligou a carta anterior (active = false).
-- 05/11/2026 (WP-DB-FIX): m5 — a reserva respeita "no máximo uma série" nas
-- perguntas com mídia 'all'; m4 — no reconhecimento, prefere um humor que não
-- está na mesa; M4 — a reserva que entra recalcula o porquê; m6 — razão do
-- reconhecimento por mesa_recon_reason.
create or replace function public.mesa_promote(p_draw uuid, p_seat text)
returns uuid language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  r_draw public.mesa_draws%rowtype;
  v_kind text; v_gen int;
  v_list jsonb; v_item jsonb; v_ord bigint; v_rest jsonb := '[]'::jsonb;
  v_dirs text[]; v_colls int[]; v_moods text[]; v_has_tv boolean;
  v_ctx jsonb; v_cands jsonb; v_c jsonb; v_res jsonb := '[]'::jsonb; v_new uuid; v_rs jsonb;
  v_occ_media text; v_ask_kind text;
begin
  select * into r_draw from public.mesa_draws dr where dr.id = p_draw for update;
  if not found or p_seat not in ('bogart','fincher','cypher') then return null; end if;
  select c.kind, c.gen into v_kind, v_gen from public.mesa_cards c
   where c.draw_id = p_draw and c.seat = p_seat order by c.gen desc limit 1;
  if v_kind is null then
    v_kind := case when r_draw.mode = 'recon' then 'recon' else 'main' end;
    v_gen := -1;
  end if;
  v_ask_kind := case when r_draw.ask = 'daily' then 'daily' when r_draw.ask like 'occ:%' then 'occ'
                     when r_draw.ask like 'mood:%' then 'mood' else 'season' end;
  if v_ask_kind = 'occ' then
    select o.media into v_occ_media from public.mesa_occasions o where o.key = substr(r_draw.ask, 5);
  elsif v_ask_kind = 'season' then
    select o.media into v_occ_media from public.mesa_occasions o where o.key = r_draw.ask;
  end if;

  select coalesce(array_agg(distinct t.director_key) filter (where t.director_key is not null), '{}'),
         coalesce(array_agg(distinct t.collection_id) filter (where t.collection_id is not null), '{}'),
         coalesce(array_agg(distinct c.mood), '{}'),
         coalesce(bool_or(c.media_type = 'tv'), false)
    into v_dirs, v_colls, v_moods, v_has_tv
    from public.mesa_cards c
    left join public.mesa_titles t on t.media_type = c.media_type and t.tmdb_id = c.tmdb_id
   where c.draw_id = p_draw and c.active and c.seat <> p_seat;

  -- 1) A primeira reserva ainda válida; as inválidas antes dela saem da lista.
  --    m5 (05/11/2026): nas perguntas com mídia 'all', a reserva também não
  --    pode trazer uma 2ª série (antes só o recálculo do passo 2 olhava isso).
  --    m4 (05/11/2026): no reconhecimento, a primeira válida cujo humor ainda não
  --    está na mesa vence (Tonico: Up chegava ao lado de Toy Story, os dois
  --    Família); as válidas puladas por isso continuam na lista, na ordem.
  v_list := case when jsonb_typeof(r_draw.reserves->p_seat) = 'array' then r_draw.reserves->p_seat else '[]'::jsonb end;
  with lst as (
    select x.value, x.ord,
           (not exists (select 1 from public.user_movies um
                         where um.user_id = r_draw.user_id and um.movie_id = (x.value->>'tmdb_id')::int
                           and um.media_type = x.value->>'media_type' and um.rating is not null)
            and not exists (select 1 from public.mesa_feedback f
                             where f.user_id = r_draw.user_id and f.media_type = x.value->>'media_type'
                               and f.tmdb_id = (x.value->>'tmdb_id')::int and f.until >= r_draw.day)
            and not exists (select 1 from public.mesa_cards c
                             where c.draw_id = p_draw and c.media_type = x.value->>'media_type' and c.tmdb_id = (x.value->>'tmdb_id')::int)
            and ((x.value->>'director_key') is null or not ((x.value->>'director_key') = any(v_dirs)))
            and ((x.value->>'collection_id') is null or not ((x.value->>'collection_id')::int = any(v_colls)))
            and not (v_has_tv and v_ask_kind <> 'daily' and v_occ_media is null and r_draw.media = 'all' and x.value->>'media_type' = 'tv')
           ) as ok
      from jsonb_array_elements(v_list) with ordinality as x(value, ord)
  ),
  pick as (
    select lst.value, lst.ord from lst
     where lst.ok
     order by (v_kind = 'recon' and (lst.value->>'mood') = any(v_moods)), lst.ord
     limit 1
  )
  select pick.value, pick.ord,
         (select coalesce(jsonb_agg(lst.value order by lst.ord), '[]'::jsonb) from lst
           where lst.ord <> pick.ord and (lst.ord > pick.ord or lst.ok))
    into v_item, v_ord, v_rest
    from pick;
  if v_item is not null then
    if v_kind <> 'recon' then
      -- M4 (05/11/2026): o porquê guardado na reserva foi calculado na hora da
      -- tiragem e pode ter envelhecido (um 10 nos anos 60 e a carta nova dizendo
      -- "nenhuma nota sua nos anos 60"; dias de Watchlist; país novo). Recalcula
      -- com o retrato de agora. As reservas antigas não guardavam as sementes da
      -- âncora: elas saem do próprio porquê guardado (anchor_tmdb_id).
      select v_item
             || coalesce((select jsonb_build_object('dir_sid', (e.value->'facts'->>'anchor_tmdb_id')::int,
                                                    'dir_smt', e.value->'facts'->>'anchor_media_type')
                            from jsonb_array_elements(jsonb_build_array(v_item->'reason') || coalesce(v_item->'evidence', '[]'::jsonb)) e
                           where (v_item->>'dir_sid') is null and e.value->>'type' = 'anchor_director'
                           limit 1), '{}'::jsonb)
             || coalesce((select jsonb_build_object('kw_sid', (e.value->'facts'->>'anchor_tmdb_id')::int,
                                                    'kw_smt', e.value->'facts'->>'anchor_media_type')
                            from jsonb_array_elements(jsonb_build_array(v_item->'reason') || coalesce(v_item->'evidence', '[]'::jsonb)) e
                           where (v_item->>'kw_sid') is null and e.value->>'type' = 'anchor_kw'
                           limit 1), '{}'::jsonb)
        into v_item;
      v_rs := public.mesa_reasons(r_draw.user_id, public.mesa_ctx(r_draw.user_id, p_draw), p_seat, v_item);
      v_item := v_item || jsonb_build_object('reason', v_rs->'reason', 'evidence', coalesce(v_rs->'evidence', '[]'::jsonb));
    end if;
  else
    -- 2) Reservas acabaram: recalcula só este assento, excluindo tudo o que já
    --    passou pela tiragem, e anexa 6 reservas novas.
    v_ctx := public.mesa_ctx(r_draw.user_id, p_draw);
    if v_kind = 'recon' then
      v_cands := public.mesa_recon_candidates(r_draw.user_id, p_draw, p_seat, 30);
    else
      v_cands := coalesce(public.mesa_slot_candidates(r_draw.user_id, p_draw, p_seat, 40)->p_seat, '[]'::jsonb);
    end if;
    -- m4 (05/11/2026): no reconhecimento, humores que ainda não estão na mesa primeiro.
    for v_c in
      select x.value from jsonb_array_elements(v_cands) x
       order by (v_kind = 'recon' and (x.value->>'mood') = any(v_moods)),
                case when v_kind = 'recon' then (x.value->>'key')::float
                     else ((x.value->>'s')::float
                           - case when v_ask_kind <> 'mood' and (x.value->>'mood') = any(v_moods) then 0.15 else 0 end)
                          / (x.value->>'tau')::float + (x.value->>'g')::float end desc,
                (x.value->>'tmdb_id')::int
    loop
      continue when (v_c->>'director_key') is not null and (v_c->>'director_key') = any(v_dirs);
      continue when (v_c->>'collection_id') is not null and (v_c->>'collection_id')::int = any(v_colls);
      continue when v_has_tv and v_ask_kind <> 'daily' and v_occ_media is null and r_draw.media = 'all' and v_c->>'media_type' = 'tv';
      if v_item is null then
        v_item := v_c;
      else
        v_res := v_res || jsonb_build_array(v_c);
        exit when jsonb_array_length(v_res) >= 6;
      end if;
    end loop;
    if v_item is null then return null; end if;
    if v_kind = 'recon' then
      v_item := v_item || jsonb_build_object('reason', public.mesa_recon_reason(v_item), 'evidence', '[]'::jsonb);
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', (x.value->>'tmdb_id')::int, 'media_type', 'movie', 'mood', x.value->>'mood',
               'pred', x.value->'pred', 'mu', x.value->'mu', 'p9', x.value->'p9', 'p10', x.value->'p10',
               'reason', public.mesa_recon_reason(x.value),
               'evidence', '[]'::jsonb, 'director_key', x.value->'director_key', 'collection_id', x.value->'collection_id')
               order by x.ord), '[]'::jsonb)
        into v_rest from jsonb_array_elements(v_res) with ordinality as x(value, ord);
    else
      v_rs := public.mesa_reasons(r_draw.user_id, v_ctx, p_seat, v_item);
      v_item := v_item || jsonb_build_object('reason', v_rs->'reason', 'evidence', coalesce(v_rs->'evidence', '[]'::jsonb));
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', (x.value->>'tmdb_id')::int, 'media_type', x.value->>'media_type', 'mood', x.value->>'mood',
               'pred', x.value->'pred', 'mu', x.value->'mu', 'p9', x.value->'p9', 'p10', x.value->'p10',
               'reason', rr.v->'reason', 'evidence', coalesce(rr.v->'evidence', '[]'::jsonb),
               'director_key', x.value->'director_key', 'collection_id', x.value->'collection_id',
               'dir_sid', x.value->'dir_sid', 'dir_smt', x.value->'dir_smt', 'kw_sid', x.value->'kw_sid', 'kw_smt', x.value->'kw_smt')
               order by x.ord), '[]'::jsonb)
        into v_rest
        from jsonb_array_elements(v_res) with ordinality as x(value, ord)
        cross join lateral (select public.mesa_reasons(r_draw.user_id, v_ctx, p_seat, x.value) as v) rr;
    end if;
  end if;

  insert into public.mesa_cards (draw_id, user_id, day, seat, kind, gen, active, media_type, tmdb_id, oracle, mood,
                                 pred, mu, p9, p10, reason, evidence, state, flipped_at)
  values (p_draw, r_draw.user_id, r_draw.day, p_seat, v_kind, v_gen + 1, true, v_item->>'media_type', (v_item->>'tmdb_id')::int,
          p_seat, coalesce(v_item->>'mood', (select t.mood from public.mesa_titles t
                                               where t.media_type = v_item->>'media_type' and t.tmdb_id = (v_item->>'tmdb_id')::int), 'unknown'),
          (v_item->>'pred')::smallint, (v_item->>'mu')::real, (v_item->>'p9')::real, (v_item->>'p10')::real,
          coalesce(v_item->'reason', jsonb_build_object('type', 'house', 'facts', '{}'::jsonb)), coalesce(v_item->'evidence', '[]'::jsonb),
          'up', now())
  returning id into v_new;

  update public.mesa_draws set reserves = jsonb_set(coalesce(reserves, '{}'::jsonb), array[p_seat], v_rest, true)
   where id = p_draw;
  return v_new;
end $$;

revoke all on function public.mesa_recon_reason(jsonb) from public, anon, authenticated;
revoke all on function public.mesa_draw_create(uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.mesa_promote(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dados da curadoria (valem na próxima construção do catálogo; as planilhas em
-- scripts/mesa/cura/*.csv foram acertadas junto, para o seed gerado de novo
-- dar o mesmo resultado).

-- M2 (05/11/2026): a pílula diz 90 minutos; com 100 vinham filmes de 95–100 min
-- e a razão "Cabe em 1h40". Com 90 sobram 165/194/370 filmes (Bogart/Fincher/Cypher).
update public.mesa_occasions set rt_max = 90 where key = 'noventa';

-- M5 (05/11/2026): "Domingo em família" (do avô ao caçula) não pode cair em
-- Five Nights at Freddy's (terror, assassino de crianças, heavy_family). O +1
-- vinha de um comentário lido como "pra assistir com a molecada"; a leitura foi
-- recusada e vira veto da curadoria. O +1 em "susto" continua.
update public.mesa_occasion_overrides
   set sign = -1, source = 'curadoria',
       note = 'QA M5: terror com assassino de crianças, não é pra família (claude-0511)'
 where occasion_key = 'familia' and media_type = 'movie' and tmdb_id = 507089;
update public.mesa_comment_flags
   set signals = array_remove(signals, 'familia')
 where media_type = 'movie' and tmdb_id = 507089 and 'familia' = any(signals);

-- M3 (05/11/2026): "Clima de Natal" (pisca-pisca e chocolate quente) tirava
-- qualquer título com a palavra christmas, sem filtro de tom: A Caça, Elle,
-- Terrifier 3, Noite do Terror… A época passa a excluir títulos pesados e os
-- humores Sombrio e Psicodélico (a construção nova aplica isso na época).
update public.mesa_occasions
   set exclude_flags = array['heavy']::text[],
       exclude_moods = array['dark-and-scary','drug-trip']::text[]
 where key = 'season:christmas';

-- Leitura à mão dos 103 candidatos de Natal: +1 para o clássico aconchegante que
-- o filtro de humor tiraria (Gremlins é Sombrio, não é pesado) e −1 para o que
-- passa pelo filtro mas não é Natal de chocolate quente (o Natal é só cenário de
-- violência, presídio, abuso ou crise).
insert into public.mesa_occasion_overrides (occasion_key, media_type, tmdb_id, sign, source, note) values
  ('season:christmas', 'movie', 927, 1, 'curadoria', 'clássico de Natal: susto de brincadeira pra família (claude-0511)'),
  ('season:christmas', 'movie', 8321, -1, 'curadoria', 'matadores de aluguel e mortes; o Natal é só cenário (claude-0511)'),
  ('season:christmas', 'movie', 15983, -1, 'curadoria', 'ação violenta contra civis; o Natal é só cenário (claude-0511)'),
  ('season:christmas', 'movie', 16608, -1, 'curadoria', 'faroeste brutal; o Natal é só cenário (claude-0511)'),
  ('season:christmas', 'movie', 25338, -1, 'curadoria', 'assalto com violência gráfica; o Natal é só cenário (claude-0511)'),
  ('season:christmas', 'movie', 29381, -1, 'curadoria', 'drama de presídio feminino; nada de Natal (claude-0511)'),
  ('season:christmas', 'movie', 807196, -1, 'curadoria', 'crise numa cozinha e overdose; nada de aconchego (claude-0511)'),
  ('season:christmas', 'tv', 33153, -1, 'curadoria', 'abuso infantil e luto; o filme já sai por pesado (claude-0511)')
on conflict (occasion_key, media_type, tmdb_id) do update set sign = excluded.sign, source = excluded.source, note = excluded.note;
