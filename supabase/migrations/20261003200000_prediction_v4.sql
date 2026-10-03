-- Nota prevista v4 (03/10/2026) — a fórmula mora AQUI, num lugar só.
--
-- Todas as previsões do site chamam esta função: prateleiras dos oráculos
-- (predict-oracle-shelf), menu do título (predict-single-movie), Filtro do
-- Oráculo na Watchlist (predict-watchlist-ratings), Match com amigos
-- (match-movie) e o placar de acertos (log-prediction-accuracy).
--
-- A ideia (princípios de "O Sinal e o Ruído", do Nate Silver):
--
--   1. Ponto de partida (o "prior"): a nota do TMDB + o seu viés pessoal
--      (o quanto você costuma dar acima ou abaixo do TMDB), puxado de leve
--      pro viés médio da comunidade enquanto você tem poucas notas.
--
--   2. Atualização pelas evidências, cada uma pesada pela QUANTIDADE de
--      provas (encolhimento bayesiano): o desvio médio das suas notas nos
--      filmes do mesmo diretor, do mesmo humor (prateleira) e com as mesmas
--      palavras-chave — somado e dividido por (quantidade + k). Um diretor
--      que você avaliou 4 vezes pesa muito mais que um avaliado 1 vez;
--      palavras-chave raras pesam mais que genéricas (idf).
--      Também entra o desvio da comunidade do CineOracle naquele título
--      (como os outros usuários avaliaram em relação ao próprio viés).
--      Sinais que o teste mostrou ser ruído saíram: país (correlação 0,01)
--      e gênero (repetia o que as palavras-chave já diziam).
--
--   3. A nota é a expectativa arredondada pro inteiro mais próximo.
--
--   4. Previsão é probabilidade: junto vem a CHANCE de o título virar um 9
--      ou 10 seu, usando o seu "ruído" pessoal (o quanto suas notas variam
--      em torno do que o modelo esperava, medido deixando cada filme de
--      fora). É isso que permite apontar obras-primas com confiança sem
--      inflar a nota: um 8 com 60% de chance de 9+ diz mais que um 9 chutado.
--
-- Pesos e encolhimentos escolhidos no teste "deixa um de fora" (1.293 notas,
-- 24 usuários) com validação cruzada em duas metades de usuários. Nas 951
-- notas de filmes das prateleiras: erro médio 1,05 (v3: 1,10; TMDB: 1,21);
-- nota exata 33,8% (v3: 30,9%); ±1 ponto 75,1% (v3: 73,8%).
--
-- Constantes:
--   viés:        k = 3 (puxa pro viés médio da comunidade)
--   diretor:     peso 0,70, k = 1
--   humor:       peso 0,60, k = 8
--   palavras:    peso 0,75, k = 20 (soma ponderada por idf)
--   comunidade:  peso 0,80, k = 4
--   ruído:       k = 10 em torno de 2,2 (variância geral dos resíduos)
--
-- p_exclude_movie: deixa um filme fora do histórico (o placar de acertos
-- recalcula a previsão de um filme que o usuário acabou de avaliar).

create or replace function public.predict_ratings_v4(
  p_user_id uuid,
  p_media_type text,
  p_ids integer[],
  p_exclude_movie integer default null
)
returns table(id integer, mu double precision, predicted_rating integer, chance_9plus double precision)
language sql
stable security definer
set search_path to 'public'
as $$
with
-- palavras-chave genéricas demais pra dizer algo sobre gosto
bad_kw as (
  select unnest(array['based on novel or book', 'based on comic', 'duringcreditsstinger', 'aftercreditsstinger']) name
),
-- notas com âncora do TMDB, de todo mundo (filmes e séries)
allr as (
  select um.user_id u, um.movie_id m, um.media_type mt, um.rating::float r, mc.vote_average::float va
  from user_movies um
  join movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
  where um.rating is not null and mc.vote_average > 0
    and not (p_exclude_movie is not null and um.user_id = p_user_id and um.media_type = 'movie' and um.movie_id = p_exclude_movie)
),
g as (select coalesce(avg(r - va), 0) g from allr where mt = 'movie'),
-- viés de cada usuário (só filmes), puxado pro viés médio com k = 3
ub as (
  select a.u, sum(a.r - a.va) sres, count(*) n, (sum(a.r - a.va) + 3 * max(g.g)) / (count(*) + 3) bias
  from allr a cross join g where a.mt = 'movie' group by a.u
),
me as (
  select coalesce(ub.bias, g.g) bias, coalesce(ub.n, 0) n, coalesce(ub.sres, 0) sres, g.g
  from g left join ub on ub.u = p_user_id
),
-- humor (prateleira) de cada título: filmes em movie_ids, séries em tv_ids
pool_movie as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.movie_ids) x
  where rp.mood_key <> 'random-surprise'
),
pool_tv as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.tv_ids) x
  where rp.mood_key <> 'random-surprise'
),
-- histórico do usuário (só filmes): resíduo = nota − TMDB − viés
h as (
  select a.m, a.r, a.va, a.r - a.va - me.bias e, nullif(mc.director, '') dir, pm.mood_key mood,
         coalesce((select array_agg(distinct (k->>'id')::int) from jsonb_array_elements(coalesce(mc.keywords, '[]'::jsonb)) k
                   where lower(k->>'name') not in (select name from bad_kw)), '{}') kws
  from allr a
  cross join me
  join movie_cache mc on mc.tmdb_id = a.m and mc.media_type = 'movie'
  left join pool_movie pm on pm.m = a.m
  where a.u = p_user_id and a.mt = 'movie'
),
-- títulos a prever
c as (
  select mc.tmdb_id cid, mc.vote_average::float va, nullif(mc.director, '') dir,
         case when p_media_type = 'tv' then pt.mood_key else pm.mood_key end mood,
         coalesce((select array_agg(distinct (k->>'id')::int) from jsonb_array_elements(coalesce(mc.keywords, '[]'::jsonb)) k
                   where lower(k->>'name') not in (select name from bad_kw)), '{}') kws
  from movie_cache mc
  left join pool_movie pm on pm.m = mc.tmdb_id and p_media_type = 'movie'
  left join pool_tv pt on pt.m = mc.tmdb_id and p_media_type = 'tv'
  where mc.media_type = p_media_type and mc.tmdb_id = any(p_ids)
),
-- raridade das palavras-chave (idf) no catálogo de filmes
kw_needed as (select distinct k from (select unnest(kws) k from h union all select unnest(kws) from c) z),
ndocs as (select greatest(count(*), 1)::float n from movie_cache where media_type = 'movie'),
kdf_raw as (
  select (kk->>'id')::int v, count(distinct mc2.tmdb_id) df
  from movie_cache mc2
  cross join lateral jsonb_array_elements(coalesce(mc2.keywords, '[]'::jsonb)) kk
  join kw_needed kn on kn.k = (kk->>'id')::int
  where mc2.media_type = 'movie'
  group by 1
),
kdf as (
  select kn.k v, ln(ndocs.n / greatest(coalesce(d.df, 0), 1)) idf
  from kw_needed kn cross join ndocs left join kdf_raw d on d.v = kn.k
),
-- evidências do usuário: soma dos resíduos e quantidade, por diretor / humor / palavra-chave
fd as (select dir v, count(*) cnt, sum(e) s from h where dir is not null group by dir),
fm as (select mood v, count(*) cnt, sum(e) s from h where mood is not null group by mood),
fk as (
  select hk.k v, sum(h.e) * max(kdf.idf) sw, count(*) * max(kdf.idf) cw, max(kdf.idf) idf
  from h cross join lateral unnest(h.kws) hk(k) join kdf on kdf.v = hk.k
  group by hk.k
),
-- comunidade: desvio dos OUTROS usuários em cada título, cada um em relação ao próprio viés
comm as (
  select a.m, a.mt, count(*) cnt, sum(a.r - a.va - coalesce(ub.bias, g.g)) s
  from allr a cross join g left join ub on ub.u = a.u
  where a.u <> p_user_id
  group by a.m, a.mt
),
-- ruído pessoal: previsão de cada filme do histórico deixando ele de fora
hk as (
  select h.m, sum(fk.sw - h.e * fk.idf) sw, sum(fk.cw - fk.idf) cw
  from h cross join lateral unnest(h.kws) k(k) join fk on fk.v = k.k
  group by h.m
),
hl as (
  select h.r,
    h.va + (me.sres - (h.r - h.va) + 3 * me.g) / (greatest(me.n - 1, 0) + 3)
    + 0.70 * coalesce(fd.s - h.e, 0) / (coalesce(fd.cnt - 1, 0) + 1)
    + 0.60 * coalesce(fm.s - h.e, 0) / (coalesce(fm.cnt - 1, 0) + 8)
    + 0.75 * coalesce(hk.sw, 0) / (coalesce(hk.cw, 0) + 20)
    + 0.80 * coalesce(cm.s / (cm.cnt + 4), 0) mu
  from h
  cross join me
  left join fd on fd.v = h.dir
  left join fm on fm.v = h.mood
  left join hk on hk.m = h.m
  left join comm cm on cm.m = h.m and cm.mt = 'movie'
),
sig as (
  select sqrt((coalesce(sum((hl.r - hl.mu) ^ 2), 0) + 10 * 2.2) / (count(*) + 10)) sigma from hl
),
ck as (
  select c.cid, sum(fk.sw) sw, sum(fk.cw) cw
  from c cross join lateral unnest(c.kws) k(k) join fk on fk.v = k.k
  group by c.cid
),
pred as (
  select c.cid,
    case when c.va is null or c.va <= 0 then null else
      c.va + me.bias
      + 0.70 * coalesce(fd.s, 0) / (coalesce(fd.cnt, 0) + 1)
      + 0.60 * coalesce(fm.s, 0) / (coalesce(fm.cnt, 0) + 8)
      + 0.75 * coalesce(ck.sw, 0) / (coalesce(ck.cw, 0) + 20)
      + 0.80 * coalesce(cm.s / (cm.cnt + 4), 0)
    end mu
  from c
  cross join me
  left join fd on fd.v = c.dir
  left join fm on fm.v = c.mood
  left join ck on ck.cid = c.cid
  left join comm cm on cm.m = c.cid and cm.mt = p_media_type
)
select pred.cid, pred.mu,
  case when pred.mu is null then null else greatest(0, least(10, round(pred.mu)))::int end,
  case when pred.mu is null then null else 1 / (1 + exp(-1.702 * (pred.mu - 8.5) / sig.sigma)) end
from pred cross join sig;
$$;

revoke all on function public.predict_ratings_v4(uuid, text, integer[], integer) from public, anon, authenticated;
grant execute on function public.predict_ratings_v4(uuid, text, integer[], integer) to service_role;

-- Placar de acertos: guarda também a expectativa e a chance de 9+ prevista,
-- e qual modelo previu — pra conferir a calibração ao longo do tempo.
alter table public.prediction_accuracy_log add column if not exists predicted_mu numeric;
alter table public.prediction_accuracy_log add column if not exists predicted_chance_9plus numeric;
alter table public.prediction_accuracy_log add column if not exists model_version text;

-- O gatilho do placar passa a olhar a lista certa (filme em movie_ids,
-- série em tv_ids) — antes uma série com o mesmo número de um filme da
-- prateleira contava como se fosse o filme.
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
  v_log_id uuid;
  v_should_fire boolean;
BEGIN
  v_should_fire := (TG_OP = 'INSERT' AND NEW.rating IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND OLD.rating IS NULL AND NEW.rating IS NOT NULL);

  IF NOT v_should_fire THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_library_size_before
  FROM user_movies
  WHERE user_id = NEW.user_id
    AND rating IS NOT NULL
    AND NOT (movie_id = NEW.movie_id AND media_type = NEW.media_type);

  SELECT jsonb_agg(jsonb_build_object('card_type', card_type, 'mood_key', mood_key))
  INTO v_pool_matches
  FROM recommendation_pools
  WHERE (CASE WHEN NEW.media_type = 'tv' THEN tv_ids ELSE movie_ids END) @> to_jsonb(NEW.movie_id);

  v_was_in_pool := v_pool_matches IS NOT NULL AND jsonb_array_length(v_pool_matches) > 0;
  v_pool_matches := COALESCE(v_pool_matches, '[]'::jsonb);

  INSERT INTO prediction_accuracy_log (
    user_id, movie_id, media_type, actual_rating,
    library_size_before, was_in_pool, pool_matches, prediction_status
  ) VALUES (
    NEW.user_id, NEW.movie_id, NEW.media_type, NEW.rating,
    v_library_size_before, v_was_in_pool, v_pool_matches,
    CASE WHEN v_was_in_pool THEN 'pending' ELSE 'skipped_not_in_pool' END
  )
  RETURNING id INTO v_log_id;

  IF v_was_in_pool THEN
    PERFORM net.http_post(
      url := 'https://hewixvcatnuqftalzmtg.supabase.co/functions/v1/log-prediction-accuracy',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhld2l4dmNhdG51cWZ0YWx6bXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MTY3NDMsImV4cCI6MjA2MDM5Mjc0M30.wK9jnuFFje_AtzqokWiuVYq2otYKW3rLPrIczw6ggFs'
      ),
      body := jsonb_build_object('logId', v_log_id),
      timeout_milliseconds := 15000
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in trigger_log_prediction_accuracy: %', SQLERRM;
  RETURN NEW;
END;
$function$;
