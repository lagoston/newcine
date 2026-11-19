-- 18/11/2026 — Protocolo Reborn, onda 2 do banco (achado A3 de
-- claude/otimizacao/banco.md, parte 2 de 2: o placar de acertos da previsão).
--
-- Antes: cada nota salva num título de prateleira (ou de fora, com nota do
-- público) fazia o gatilho trigger_log_prediction_accuracy disparar um
-- net.http_post para a edge function log-prediction-accuracy, que voltava ao
-- banco para rodar a previsão e gravar o resultado. Custo: carregar o pg_net
-- e varrer o JSON das 30 prateleiras dentro do INSERT da nota (87 ms com a
-- conexão fria), uma invocação de edge function por nota e a chave do site
-- escrita dentro da função.
--
-- Agora:
--   1. o gatilho só grava a linha 'pending' (a prateleira do título vem de
--      pool_titles, pelo índice) — sem HTTP;
--   2. process_prediction_accuracy_log(), pelo cron a cada 5 min, calcula as
--      pendentes dentro do banco, com as mesmas contas e arredondamentos da
--      edge function (que continua implantada, só deixa de ser chamada);
--   3. como o cálculo passa a acontecer minutos depois, a previsão precisa
--      ser a "de antes da nota" de verdade: em 57% das linhas do placar a
--      pessoa deu outra nota nos 60 s seguintes (e em 2% nos 5 s seguintes,
--      que já vazavam para a conta de hoje). predict_ratings e
--      predict_ratings_outside ganham um filtro que só existe quando a
--      variável de transação cineoracle.predict_asof está definida (só o
--      processador a define): as notas da PRÓPRIA pessoa mexidas depois
--      daquele instante ficam fora do histórico. Sem a variável — todas as
--      chamadas do site, do APK e das edge functions — o resultado é o mesmo
--      de antes, número por número (o ensaio compara).
--
-- Assinaturas e saídas não mudam.

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

-- 1. predict_ratings e predict_ratings_outside: o histórico "até o instante X"
do $do$
declare
  v_fn regprocedure;
  v_def text;
begin
  foreach v_fn in array array[
    'public.predict_ratings(uuid,text,integer[],integer)'::regprocedure,
    'public.predict_ratings_outside(uuid,integer[],integer)'::regprocedure]
  loop
    v_def := pg_get_functiondef(v_fn);
    if position('cineoracle.predict_asof' in v_def) > 0 then
      raise exception '%: já tem o filtro predict_asof', v_fn;
    end if;
    v_def := pg_temp.swap_n(v_def,
$s$    and not (p_exclude_movie is not null and um.user_id = p_user_id and um.media_type = 'movie' and um.movie_id = p_exclude_movie)
$s$,
$s$    and not (p_exclude_movie is not null and um.user_id = p_user_id and um.media_type = 'movie' and um.movie_id = p_exclude_movie)
    -- 18/11/2026 (Reborn): o placar de acertos calcula depois, em lote, a previsão
    -- "de antes da nota". Só quando cineoracle.predict_asof está definida (quem define
    -- é process_prediction_accuracy_log) as notas da própria pessoa mexidas depois
    -- daquele instante ficam de fora. Sem a variável, este filtro não tira nada.
    and ((select nullif(current_setting('cineoracle.predict_asof', true), '')::timestamptz) is null
         or um.user_id <> p_user_id
         or coalesce(um.updated_at, um.created_at) <= (select nullif(current_setting('cineoracle.predict_asof', true), '')::timestamptz))
$s$, 1, v_fn::text || ' allr');
    execute v_def;
  end loop;
end;
$do$;

-- 2. o gatilho da nota: só a linha pendente, sem HTTP
create or replace function public.trigger_log_prediction_accuracy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_library_size_before integer;
  v_pool_matches jsonb;
  v_was_in_pool boolean;
  v_outside boolean := false;
  v_should_fire boolean;
BEGIN
  v_should_fire := (TG_OP = 'INSERT' AND NEW.rating IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND OLD.rating IS NULL AND NEW.rating IS NOT NULL);

  IF NOT v_should_fire THEN
    RETURN NEW;
  END IF;

  -- bots: a biblioteca entra de uma vez, não há previsão "antes" a medir
  IF EXISTS (SELECT 1 FROM bot_accounts b WHERE b.user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  -- conta diretor escondida (16/11/2026): nota de teste não entra no placar da previsão
  IF EXISTS (SELECT 1 FROM director.accounts d WHERE d.user_id = NEW.user_id AND d.hidden) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_library_size_before
  FROM user_movies
  WHERE user_id = NEW.user_id
    AND rating IS NOT NULL
    AND NOT (movie_id = NEW.movie_id AND media_type = NEW.media_type);

  -- 18/11/2026 (Reborn): as prateleiras do título vêm de pool_titles (índice
  -- por título) em vez de abrir o JSON das 30 prateleiras a cada nota. A ordem
  -- (a das linhas de recommendation_pools) é a mesma de antes.
  SELECT jsonb_agg(jsonb_build_object('card_type', rp.card_type, 'mood_key', rp.mood_key) ORDER BY rp.ctid)
  INTO v_pool_matches
  FROM recommendation_pools rp
  WHERE EXISTS (
    SELECT 1 FROM pool_titles pt
    WHERE pt.card_type = rp.card_type AND pt.mood_key = rp.mood_key
      AND pt.media_type = CASE WHEN NEW.media_type = 'tv' THEN 'tv' ELSE 'movie' END
      AND pt.tmdb_id = NEW.movie_id);

  v_was_in_pool := v_pool_matches IS NOT NULL AND jsonb_array_length(v_pool_matches) > 0;
  v_pool_matches := COALESCE(v_pool_matches, '[]'::jsonb);

  -- filme de fora com previsão possível (a fórmula paralela, 15/11/2026)
  IF NOT v_was_in_pool AND COALESCE(NEW.media_type, 'movie') = 'movie' THEN
    v_outside := EXISTS (
      SELECT 1 FROM movie_cache mc
      WHERE mc.tmdb_id = NEW.movie_id AND mc.media_type = 'movie'
        AND mc.vote_average > 0
    );
  END IF;

  -- 18/11/2026 (Reborn): a linha fica 'pending' e quem calcula a previsão é
  -- process_prediction_accuracy_log (cron), não mais um HTTP por nota.
  INSERT INTO prediction_accuracy_log (
    user_id, movie_id, media_type, actual_rating,
    library_size_before, was_in_pool, pool_matches, prediction_status, model_version
  ) VALUES (
    NEW.user_id, NEW.movie_id, NEW.media_type, NEW.rating,
    v_library_size_before, v_was_in_pool, v_pool_matches,
    CASE WHEN v_was_in_pool OR v_outside THEN 'pending' ELSE 'skipped_not_in_pool' END,
    CASE WHEN v_outside THEN 'fora-v1' END
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in trigger_log_prediction_accuracy: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- 3. quem calcula as pendentes (as contas da edge function log-prediction-accuracy)
create or replace function public.process_prediction_accuracy_log(
  p_limit integer default 40,
  p_min_age interval default '20 seconds'
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  p record;
  v_outside boolean;
  v_version text;
  v_va double precision;
  v_err double precision;
  v_naive double precision;
  v_done integer := 0;
begin
  -- uma passada por vez
  if not pg_try_advisory_xact_lock(hashtext('process_prediction_accuracy_log')) then
    return 0;
  end if;

  for r in
    select l.id, l.user_id, l.movie_id, l.media_type, l.actual_rating, l.model_version, l.created_at
      from prediction_accuracy_log l
     where l.prediction_status = 'pending'
       -- dá tempo de o título recém-adicionado entrar no movie_cache
       and l.created_at <= now() - coalesce(p_min_age, interval '0')
     order by l.created_at
     limit greatest(coalesce(p_limit, 40), 1)
  loop
    v_outside := coalesce(r.model_version = 'fora-v1', false) and r.media_type is distinct from 'tv';
    v_version := case when v_outside then 'fora-v1' else 'v4' end;
    begin
      -- o histórico da pessoa como estava quando ela deu a nota
      perform set_config('cineoracle.predict_asof', r.created_at::text, true);
      if v_outside then
        select o.mu, o.predicted_rating, o.chance_9plus into p
          from predict_ratings_outside(r.user_id, array[r.movie_id], r.movie_id) o
         limit 1;
      else
        select v.mu, v.predicted_rating, v.chance_9plus into p
          from predict_ratings_v4(r.user_id,
                                  case when r.media_type = 'tv' then 'tv' else 'movie' end,
                                  array[r.movie_id],
                                  case when r.media_type = 'tv' then null else r.movie_id end) v
         limit 1;
      end if;
      perform set_config('cineoracle.predict_asof', '', true);

      if p.predicted_rating is null or p.mu is null then
        update prediction_accuracy_log
           set prediction_status = 'error',
               error_message = case when v_outside
                 then 'Title not found in movie_cache, without TMDB score or on a shelf'
                 else 'Title not found in movie_cache or without TMDB score' end,
               model_version = v_version
         where id = r.id;
      else
        select mc.vote_average::double precision into v_va
          from movie_cache mc
         where mc.tmdb_id = r.movie_id and mc.media_type = r.media_type;
        v_va := coalesce(v_va, 0);
        v_err := abs(p.predicted_rating - r.actual_rating::double precision);
        v_naive := abs(v_va - r.actual_rating::double precision);
        -- floor(x + 0.5) em double precision = o Math.round da edge function
        update prediction_accuracy_log
           set vote_average = v_va::numeric,
               predicted_rating = p.predicted_rating,
               predicted_mu = (floor(p.mu * 100 + 0.5) / 100)::numeric,
               predicted_chance_9plus = case when p.chance_9plus is null then null
                 else (floor(p.chance_9plus * 1000 + 0.5) / 1000)::numeric end,
               predicted_error = (floor(v_err * 100 + 0.5) / 100)::numeric,
               naive_error = (floor(v_naive * 100 + 0.5) / 100)::numeric,
               beats_naive = v_err < v_naive,
               prediction_status = 'computed',
               model_version = v_version
         where id = r.id;
      end if;
    exception when others then
      perform set_config('cineoracle.predict_asof', '', true);
      update prediction_accuracy_log
         set prediction_status = 'error',
             error_message = left(sqlerrm, 500),
             model_version = v_version
       where id = r.id;
    end;
    v_done := v_done + 1;
  end loop;

  return v_done;
end;
$function$;

revoke all on function public.process_prediction_accuracy_log(integer, interval) from public, anon, authenticated;

comment on function public.process_prediction_accuracy_log(integer, interval) is
  '18/11/2026: calcula as linhas pending de prediction_accuracy_log (a previsão de antes da nota, com cineoracle.predict_asof). Roda pelo cron placar-da-previsao; substitui o HTTP por nota para a edge function log-prediction-accuracy.';

-- 4. a cada 5 min, fora dos minutos dos outros jobs (1, 3, 4, 6 e 8)
select cron.schedule('placar-da-previsao', '2-59/5 * * * *',
  $$select public.process_prediction_accuracy_log(40)$$);
