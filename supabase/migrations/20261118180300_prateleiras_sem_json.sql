-- 18/11/2026 — Protocolo Reborn, onda 2 do banco (achado A7 de
-- claude/otimizacao/banco.md, segunda leva).
--
-- A onda 1 criou pool_titles (uma linha por título de cada prateleira,
-- mantida por gatilho) e passou shelf_titles() e a previsão para ela. Ainda
-- havia funções abrindo o JSON de recommendation_pools a cada chamada: ou
-- desmontando as listas (jsonb_array_elements), ou perguntando "este título
-- está em alguma das 30 prateleiras?" com @>, o que lê e descomprime os 30
-- JSON (11.688 números) para responder sobre um título.
--
-- Esta migração troca, nas funções chamadas a toda hora, só o trecho que lia
-- o JSON por uma busca em pool_titles (índice por título ou por humor):
--   • ao abrir um título: get_title_prediction, get_pools_containing_title,
--     get_title_oracle_comments;
--   • evento sazonal (toda abertura do app e toda nota): get_seasonal_event_state,
--     seasonal_event_counts_movie;
--   • Jackpot (missões da semana): jackpot_mission_progress;
--   • Para Você (quando o cache do dia vence): get_for_you_titles__impl;
--   • Match (edge match-movie): get_rated_movies_matching_mood;
--   • salas secretas: secret_room_card, secret_room_mood_titles;
--   • APK antigo: get_pools_containing_movie, get_pools_for_movies,
--     get_movie_mood_keys, get_profile_mood_titles.
-- Mesmo nome, mesmos parâmetros, mesma saída (o ensaio compara as respostas
-- antes e depois, função por função). Onde a função devolvia as prateleiras
-- sem ORDER BY, a ordem era a das linhas de recommendation_pools; fica
-- escrita (ORDER BY rp.ctid) para continuar igual.
--
-- Ficam como estão, de propósito:
--   • get_movie_oracle_mood_sources, get_movie_oracle_sources e
--     get_title_oracle_mood_sources: rodam com a permissão de quem chama, e
--     pool_titles não é legível pelo app (visitante sem login recebe vazio
--     hoje; trocar isso mudaria a resposta);
--   • as que abrem uma prateleira só (get_oracle_pool_movies,
--     get_oracle_pool_movie_ids, daily_oracle_pool, as recomendações do dia);
--   • as de administração, cron e curadoria;
--   • get_oracle_hub_picks_v2: o peso dela é prever milhares de títulos, não
--     o JSON (ver o relatório).
--
-- Padrão: definição vinda do banco, troca de trechos conferidos; cada função
-- precisa ser SECURITY DEFINER (pool_titles não tem permissão para o app).

create or replace function pg_temp.swap_n(p_def text, p_old text, p_new text, p_times integer, p_label text)
returns text
language plpgsql
as $f$
begin
  if (length(p_def) - length(replace(p_def, p_old, ''))) / length(p_old) <> p_times then
    raise exception '%: o trecho não aparece % vez(es)', p_label, p_times;
  end if;
  return replace(p_def, p_old, p_new);
end;
$f$;

-- troca uma lista de trechos {antigo, novo, vezes} numa função e recria
create or replace function pg_temp.troca(p_fn regprocedure, p_swaps text[])
returns void
language plpgsql
as $f$
declare
  v_def text := pg_get_functiondef(p_fn);
  i integer;
begin
  if not (select p.prosecdef from pg_proc p where p.oid = p_fn) then
    raise exception '%: não é SECURITY DEFINER; não pode ler pool_titles', p_fn;
  end if;
  if position('pool_titles' in v_def) > 0 then
    raise exception '%: já lê pool_titles', p_fn;
  end if;
  for i in 1 .. array_length(p_swaps, 1) / 3 loop
    v_def := pg_temp.swap_n(v_def, p_swaps[3 * i - 2], p_swaps[3 * i - 1], p_swaps[3 * i]::integer, p_fn::text || ' #' || i);
  end loop;
  if position('pool_titles' in v_def) = 0 then
    raise exception '%: nenhuma troca aplicada', p_fn;
  end if;
  execute v_def;
end;
$f$;

-- ao abrir um título ---------------------------------------------------------

select pg_temp.troca('public.get_title_prediction(integer,text)', array[
$s$    select 1 from recommendation_pools rp
     where rp.mood_key <> 'random-surprise'
       and (case when v_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(p_id)
$s$,
$s$    -- 18/11/2026 (Reborn): pool_titles (índice por título) no lugar do JSON
    select 1 from pool_titles rp
     where rp.mood_key <> 'random-surprise'
       and rp.media_type = (case when v_type = 'tv' then 'tv' else 'movie' end) and rp.tmdb_id = p_id
$s$, '1']);

select pg_temp.troca('public.get_pools_containing_title(integer,text)', array[
$s$  where (case when p_media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(p_id);
$s$,
$s$  -- 18/11/2026 (Reborn): pool_titles (índice por título) no lugar do JSON;
  -- a ordem é a das linhas de recommendation_pools, como antes
  where exists (select 1 from pool_titles pt
                 where pt.card_type = rp.card_type and pt.mood_key = rp.mood_key
                   and pt.media_type = (case when p_media_type = 'tv' then 'tv' else 'movie' end)
                   and pt.tmdb_id = p_id)
  order by rp.ctid;
$s$, '1']);

select pg_temp.troca('public.get_title_oracle_comments(integer,text)', array[
$s$     and (case when p_media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(array[p_id]);
$s$,
$s$     -- 18/11/2026 (Reborn): pool_titles (índice por título) no lugar do JSON
     and exists (select 1 from pool_titles pt
                  where pt.card_type = rp.card_type and pt.mood_key = rp.mood_key
                    and pt.media_type = (case when p_media_type = 'tv' then 'tv' else 'movie' end)
                    and pt.tmdb_id = p_id);
$s$, '1']);

-- evento sazonal -------------------------------------------------------------

select pg_temp.troca('public.get_seasonal_event_state(text)', array[
$s$           'oracle', (select rp.card_type from public.recommendation_pools rp
                      where rp.mood_key <> 'random-surprise' and rp.movie_ids @> to_jsonb(x.mid)
$s$,
$s$           -- 18/11/2026 (Reborn): pool_titles no lugar do JSON (era uma busca nas
           -- 30 prateleiras para cada filme da lista do evento)
           'oracle', (select rp.card_type from public.pool_titles rp
                      where rp.mood_key <> 'random-surprise' and rp.media_type = 'movie' and rp.tmdb_id = x.mid
$s$, '1']);

select pg_temp.troca('public.seasonal_event_counts_movie(text,integer,integer)', array[
$s$        join public.recommendation_pools rp on rp.mood_key = any (se.bonus_moods)
        where se.id = p_event_id
          and rp.movie_ids @> to_jsonb(p_movie_id));
$s$,
$s$        join public.pool_titles rp on rp.mood_key = any (se.bonus_moods)
        where se.id = p_event_id
          and rp.media_type = 'movie' and rp.tmdb_id = p_movie_id);
$s$, '1']);

-- Jackpot: missões da semana --------------------------------------------------

select pg_temp.troca('public.jackpot_mission_progress(uuid,date,text,text)', array[
$s$                and (case when a.media_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(a.tmdb_id))
$s$,
$s$                and exists (select 1 from pool_titles pt
                             where pt.card_type = rp.card_type and pt.mood_key = rp.mood_key
                               and pt.media_type = (case when a.media_type = 'tv' then 'tv' else 'movie' end)
                               and pt.tmdb_id = a.tmdb_id))
$s$, '2']);

-- Para Você ------------------------------------------------------------------

select pg_temp.troca('public.get_for_you_titles__impl(uuid,text,integer)', array[
$s$  from public.recommendation_pools rp
  cross join lateral (
    select (e)::integer as tid
    from jsonb_array_elements_text(
      case when p_media_type = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else coalesce(rp.movie_ids, '[]'::jsonb) end
    ) e
  ) x
  where rp.card_type in ('bogart', 'fincher', 'cypher')
$s$,
$s$  -- 18/11/2026 (Reborn): pool_titles no lugar do JSON
  from public.pool_titles rp
  cross join lateral (select rp.tmdb_id as tid) x
  where rp.media_type = (case when p_media_type = 'tv' then 'tv' else 'movie' end)
    and rp.card_type in ('bogart', 'fincher', 'cypher')
$s$, '1',
$s$    from public.recommendation_pools rp
    cross join lateral (
      select (e)::integer as tid
      from jsonb_array_elements_text(
        case when p_media_type = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else coalesce(rp.movie_ids, '[]'::jsonb) end
      ) e
    ) x
    where rp.card_type in ('bogart', 'fincher', 'cypher')
$s$,
$s$    from public.pool_titles rp
    cross join lateral (select rp.tmdb_id as tid) x
    where rp.media_type = (case when p_media_type = 'tv' then 'tv' else 'movie' end)
      and rp.card_type in ('bogart', 'fincher', 'cypher')
$s$, '1']);

-- Match ----------------------------------------------------------------------

select pg_temp.troca('public.get_rated_movies_matching_mood(uuid[],text[],text)', array[
$s$        SELECT 1 FROM recommendation_pools rp
$s$,
$s$        SELECT 1 FROM pool_titles rp
$s$, '2',
$s$          AND mc.tmdb_id::text IN (SELECT jsonb_array_elements_text(rp.movie_ids))
$s$,
$s$          AND rp.media_type = 'movie' AND rp.tmdb_id = mc.tmdb_id
$s$, '2']);

-- salas secretas -------------------------------------------------------------

select pg_temp.troca('public.secret_room_card(integer,text)', array[
$s$                 and (case when p_type = 'tv' then coalesce(rp.tv_ids, '[]'::jsonb) else rp.movie_ids end) @> to_jsonb(p_id)
$s$,
$s$                 and exists (select 1 from public.pool_titles pt
                              where pt.card_type = rp.card_type and pt.mood_key = rp.mood_key
                                and pt.media_type = (case when p_type = 'tv' then 'tv' else 'movie' end)
                                and pt.tmdb_id = p_id)
$s$, '1']);

select pg_temp.troca('public.secret_room_mood_titles(text)', array[
$s$  from public.recommendation_pools rp
  cross join lateral (
    select 'movie' mt, (e)::int id from jsonb_array_elements_text(rp.movie_ids) e
    union all
    select 'tv', (e)::int from jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)) e
  ) t
$s$,
$s$  from public.pool_titles rp
  cross join lateral (select rp.media_type mt, rp.tmdb_id id) t
$s$, '1']);

-- APK antigo -----------------------------------------------------------------

select pg_temp.troca('public.get_pools_containing_movie(integer)', array[
$s$  WHERE rp.movie_ids @> to_jsonb(p_movie_id);
$s$,
$s$  WHERE EXISTS (SELECT 1 FROM pool_titles pt
                 WHERE pt.card_type = rp.card_type AND pt.mood_key = rp.mood_key
                   AND pt.media_type = 'movie' AND pt.tmdb_id = p_movie_id)
  ORDER BY rp.ctid;
$s$, '1']);

select pg_temp.troca('public.get_pools_for_movies(integer[])', array[
$s$  JOIN recommendation_pools rp ON rp.movie_ids @> to_jsonb(m.movie_id);
$s$,
$s$  JOIN recommendation_pools rp ON EXISTS (
         SELECT 1 FROM pool_titles pt
          WHERE pt.card_type = rp.card_type AND pt.mood_key = rp.mood_key
            AND pt.media_type = 'movie' AND pt.tmdb_id = m.movie_id);
$s$, '1']);

select pg_temp.troca('public.get_movie_mood_keys(integer[])', array[
$s$  SELECT DISTINCT (elem::text)::integer AS movie_id, rp.mood_key
  FROM recommendation_pools rp, jsonb_array_elements(rp.movie_ids) AS elem
  WHERE rp.mood_key != 'random-surprise'
    AND (elem::text)::integer = ANY(p_movie_ids);
$s$,
$s$  SELECT DISTINCT rp.tmdb_id AS movie_id, rp.mood_key
  FROM pool_titles rp
  WHERE rp.mood_key != 'random-surprise'
    AND rp.media_type = 'movie'
    AND rp.tmdb_id = ANY(p_movie_ids);
$s$, '1']);

select pg_temp.troca('public.get_profile_mood_titles(uuid)', array[
$s$    join public.recommendation_pools rp on rp.mood_key <> 'random-surprise'
   cross join lateral jsonb_array_elements(rp.movie_ids) e(value)
$s$,
$s$    join public.pool_titles rp on rp.mood_key <> 'random-surprise'
     and rp.media_type = 'movie' and rp.tmdb_id = um.movie_id
$s$, '1',
$s$     and (e.value #>> '{}')::integer = um.movie_id
$s$,
$s$$s$, '1']);
