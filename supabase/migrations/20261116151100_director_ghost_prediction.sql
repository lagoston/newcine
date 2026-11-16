-- Conta Diretor, etapa A: o fantasma na previsão (16/11/2026).
--
-- Continuação de 20261116151000_director_ghost_people.sql (o cabeçalho de lá explica
-- o todo). As notas de teste da conta escondida saem da média global e do termo de
-- comunidade da previsão dos outros, do placar de acerto e do laboratório. Ponto de
-- partida: as definições no ar (md5 conferido); só as linhas marcadas mudaram.

-- predict_ratings
CREATE OR REPLACE FUNCTION public.predict_ratings(p_user_id uuid, p_media_type text, p_ids integer[], p_exclude_movie integer DEFAULT NULL::integer)
 RETURNS TABLE(id integer, mu double precision, predicted_rating integer, chance_9plus double precision, chance_10 double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with
bad_kw as (
  select unnest(array['based on novel or book', 'based on comic', 'duringcreditsstinger', 'aftercreditsstinger']) name
),
allr as (
  select um.user_id u, um.movie_id m, um.media_type mt, um.rating::float r, mc.vote_average::float va
  from user_movies um
  join movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
  where um.rating is not null and mc.vote_average > 0
    and not (p_exclude_movie is not null and um.user_id = p_user_id and um.media_type = 'movie' and um.movie_id = p_exclude_movie)
    -- conta diretor escondida (16/11/2026): as notas de teste dela não mexem na média
    -- global nem no termo de comunidade de mais ninguém
    and (um.user_id = p_user_id or not exists (select 1 from director.accounts da where da.user_id = um.user_id and da.hidden))
),
g as (select coalesce(avg(r - va), 0) g from allr where mt = 'movie'),
ub as (
  select a.u, sum(a.r - a.va) sres, count(*) n, (sum(a.r - a.va) + 3 * max(g.g)) / (count(*) + 3) bias
  from allr a cross join g where a.mt = 'movie' group by a.u
),
me as (
  select coalesce(ub.bias, g.g) bias, coalesce(ub.n, 0) n, coalesce(ub.sres, 0) sres, g.g
  from g left join ub on ub.u = p_user_id
),
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
fd as (select dir v, count(*) cnt, sum(e) s from h where dir is not null group by dir),
fm as (select mood v, count(*) cnt, sum(e) s from h where mood is not null group by mood),
fk as (
  select hk.k v, sum(h.e) * max(kdf.idf) sw, count(*) * max(kdf.idf) cw, max(kdf.idf) idf
  from h cross join lateral unnest(h.kws) hk(k) join kdf on kdf.v = hk.k
  group by hk.k
),
comm as (
  select a.m, a.mt, count(*) cnt, sum(a.r - a.va - coalesce(ub.bias, g.g)) s
  from allr a cross join g left join ub on ub.u = a.u
  where a.u <> p_user_id
    and not exists (select 1 from bot_accounts b where b.user_id = a.u)
  group by a.m, a.mt
),
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
),
chance as (
  select pred.cid, pred.mu,
    case when pred.mu is null then null else 1 / (1 + exp(-1.702 * (pred.mu - 8.5) / sig.sigma)) end p9,
    case when pred.mu is null then null else 1 / (1 + exp(-(1.702 * (pred.mu - 9.5) / sig.sigma - 0.4))) end p10
  from pred cross join sig
)
select chance.cid, chance.mu,
  case when chance.mu is null then null else
    greatest(0, least(10, greatest(round(chance.mu)::int,
      case when chance.p9 >= 0.70 then 10 when chance.p9 >= 0.40 then 9 else 0 end)))
  end,
  chance.p9,
  chance.p10
from chance;
$function$;

-- predict_ratings_outside
create or replace function public.predict_ratings_outside(p_user_id uuid, p_ids integer[], p_exclude_movie integer default null::integer)
 returns table(id integer, mu double precision, predicted_rating integer, chance_9plus double precision, chance_10 double precision, sigma double precision)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
with
bad_kw as (
  select unnest(array['based on novel or book', 'based on comic', 'duringcreditsstinger', 'aftercreditsstinger']) name
),
allr as (
  select um.user_id u, um.movie_id m, um.media_type mt, um.rating::float r, mc.vote_average::float va
  from user_movies um
  join movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = um.media_type
  where um.rating is not null and mc.vote_average > 0
    and not (p_exclude_movie is not null and um.user_id = p_user_id and um.media_type = 'movie' and um.movie_id = p_exclude_movie)
    -- conta diretor escondida (16/11/2026): as notas de teste dela não mexem na média
    -- global nem no termo de comunidade de mais ninguém
    and (um.user_id = p_user_id or not exists (select 1 from director.accounts da where da.user_id = um.user_id and da.hidden))
),
g as (select coalesce(avg(r - va), 0) g from allr where mt = 'movie'),
ub as (
  select a.u, sum(a.r - a.va) sres, count(*) n, (sum(a.r - a.va) + 3 * max(g.g)) / (count(*) + 3) bias
  from allr a cross join g where a.mt = 'movie' group by a.u
),
me as (
  select coalesce(ub.bias, g.g) bias, coalesce(ub.n, 0) n, coalesce(ub.sres, 0) sres, g.g
  from g left join ub on ub.u = p_user_id
),
pool_movie as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.movie_ids) x
  where rp.mood_key <> 'random-surprise'
),
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
-- só filmes de fora das prateleiras, com nota do público (1 voto basta: a
-- nota de poucos votos é puxada para a média do catálogo, ver pred)
c as (
  select mc.tmdb_id cid, mc.vote_average::float va, coalesce(mc.vote_count, 0)::float vc, nullif(mc.director, '') dir,
         coalesce((select array_agg(distinct (k->>'id')::int) from jsonb_array_elements(coalesce(mc.keywords, '[]'::jsonb)) k
                   where lower(k->>'name') not in (select name from bad_kw)), '{}') kws
  from movie_cache mc
  where mc.media_type = 'movie' and mc.tmdb_id = any(p_ids)
    and mc.vote_average > 0
    and not exists (select 1 from pool_movie pm where pm.m = mc.tmdb_id)
),
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
fd as (select dir v, count(*) cnt, sum(e) s from h where dir is not null group by dir),
fm as (select mood v, count(*) cnt, sum(e) s from h where mood is not null group by mood),
-- o Arquivo: o seu desvio nos filmes de fora que você já avaliou
fa as (select count(*) cnt, coalesce(sum(e), 0) s from h where mood is null),
fk as (
  select hk.k v, sum(h.e) * max(kdf.idf) sw, count(*) * max(kdf.idf) cw, max(kdf.idf) idf
  from h cross join lateral unnest(h.kws) hk(k) join kdf on kdf.v = hk.k
  group by hk.k
),
comm as (
  select a.m, a.mt, count(*) cnt, sum(a.r - a.va - coalesce(ub.bias, g.g)) s
  from allr a cross join g left join ub on ub.u = a.u
  where a.u <> p_user_id
    and not exists (select 1 from bot_accounts b where b.user_id = a.u)
  group by a.m, a.mt
),
hk as (
  select h.m, sum(fk.sw - h.e * fk.idf) sw, sum(fk.cw - fk.idf) cw
  from h cross join lateral unnest(h.kws) k(k) join fk on fk.v = k.k
  group by h.m
),
-- o ruído pessoal é o da v4 (o mesmo histórico, a mesma conta)
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
    -- a nota do público, puxada para a média do catálogo (6,63) como se
    -- tivesse 3 votos a mais nela: some com centenas de votos, pesa com 4
    (c.vc * c.va + 3 * 6.63) / (c.vc + 3) + me.bias
    + 0.70 * coalesce(fd.s, 0) / (coalesce(fd.cnt, 0) + 1)
    + 0.75 * coalesce(ck.sw, 0) / (coalesce(ck.cw, 0) + 20)
    + 0.80 * coalesce(cm.s / (cm.cnt + 4), 0)
    + 0.60 * fa.s / (fa.cnt + 8) mu
  from c
  cross join me
  cross join fa
  left join fd on fd.v = c.dir
  left join ck on ck.cid = c.cid
  left join comm cm on cm.m = c.cid and cm.mt = 'movie'
),
-- fora das prateleiras a previsão é 25 % mais larga
width as (select 1.25 * sig.sigma sigma from sig),
chance as (
  select pred.cid, pred.mu, width.sigma,
    1 / (1 + exp(-1.702 * (pred.mu - 8.5) / width.sigma)) p9,
    1 / (1 + exp(-(1.702 * (pred.mu - 9.5) / width.sigma - 0.4))) p10
  from pred cross join width
)
-- sem o selo 9/10: a nota mostrada é o mu arredondado
select chance.cid, chance.mu, greatest(0, least(10, round(chance.mu)::int)), chance.p9, chance.p10, chance.sigma
from chance;
$function$;

-- trigger_log_prediction_accuracy
CREATE OR REPLACE FUNCTION public.trigger_log_prediction_accuracy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_library_size_before integer;
  v_pool_matches jsonb;
  v_was_in_pool boolean;
  v_outside boolean := false;
  v_log_id uuid;
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

  SELECT jsonb_agg(jsonb_build_object('card_type', card_type, 'mood_key', mood_key))
  INTO v_pool_matches
  FROM recommendation_pools
  WHERE (CASE WHEN NEW.media_type = 'tv' THEN tv_ids ELSE movie_ids END) @> to_jsonb(NEW.movie_id);

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

  INSERT INTO prediction_accuracy_log (
    user_id, movie_id, media_type, actual_rating,
    library_size_before, was_in_pool, pool_matches, prediction_status, model_version
  ) VALUES (
    NEW.user_id, NEW.movie_id, NEW.media_type, NEW.rating,
    v_library_size_before, v_was_in_pool, v_pool_matches,
    CASE WHEN v_was_in_pool OR v_outside THEN 'pending' ELSE 'skipped_not_in_pool' END,
    CASE WHEN v_outside THEN 'fora-v1' END
  )
  RETURNING id INTO v_log_id;

  IF v_was_in_pool OR v_outside THEN
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

-- lab_export_text
create or replace function public.lab_export_text()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
with uidx as (
  select z.user_id, (row_number() over (order by z.is_bot, z.user_id))::int - 1 u, z.is_bot
  from (
    select distinct um.user_id, exists (select 1 from bot_accounts b where b.user_id = um.user_id) is_bot
    from user_movies um where um.rating is not null
      and not exists (select 1 from director.accounts da where da.user_id = um.user_id and da.hidden)  -- conta diretor escondida (16/11/2026)
  ) z
),
t as (select distinct um.movie_id id, um.media_type mt from user_movies um where um.rating is not null
       and not exists (select 1 from director.accounts da where da.user_id = um.user_id and da.hidden)),
tc as materialized (
  select mc.tmdb_id, mc.media_type, mc.vote_average, mc.vote_count, mc.release_date, mc.runtime, mc.episode_run_time,
         mc.number_of_seasons, nullif(mc.director, '') director, mc.genres_en, mc.keywords, mc.cast_members, mc.origin_country,
         row_number() over (order by mc.media_type, mc.tmdb_id) tn
  from movie_cache mc join t on t.id = mc.tmdb_id and t.mt = mc.media_type
),
tkw as materialized (
  select tc.tn, (k->>'id')::int kid, max(lower(k->>'name')) kname
  from tc cross join lateral jsonb_array_elements(coalesce(tc.keywords, '[]')) k
  group by tc.tn, (k->>'id')::int
),
kwidx as materialized (
  select kid, nt, (row_number() over (order by nt desc, kid))::int - 1 ki
  from (select kid, max(kname) kname, count(distinct tn) nt from tkw group by kid) z
  where nt >= 2 and kname not in ('based on novel or book', 'based on comic', 'duringcreditsstinger', 'aftercreditsstinger')
),
kwdf as (
  select (kk->>'id')::int kid, count(distinct mc2.tmdb_id) df
  from movie_cache mc2 cross join lateral jsonb_array_elements(coalesce(mc2.keywords, '[]')) kk
  where mc2.media_type = 'movie' group by 1
),
tkw_s as (
  select tkw.tn, string_agg(kwidx.ki::text, '/' order by kwidx.ki) s
  from tkw join kwidx using (kid) group by tkw.tn
),
dirs as (
  select director, (dense_rank() over (order by director))::int - 1 di
  from (select distinct director from tc where director is not null) z
),
tcast as materialized (
  select tc.tn, (c->>'id')::int cid, o
  from tc cross join lateral jsonb_array_elements(coalesce(tc.cast_members, '[]')) with ordinality cc(c, o) where o <= 5
),
castidx as (
  select cid, (row_number() over (order by nt desc, cid))::int - 1 ci
  from (select cid, count(distinct tn) nt from tcast group by cid) z where nt >= 2
),
tcast_s as (
  select tcast.tn, string_agg(castidx.ci::text, '/' order by tcast.o) s
  from tcast join castidx using (cid) group by tcast.tn
),
tgen_s as (
  select tc.tn, string_agg(g->>'id', '/' order by o) s
  from tc cross join lateral jsonb_array_elements(coalesce(tc.genres_en, '[]')) with ordinality gg(g, o) group by tc.tn
),
pm as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key, rp.card_type
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.movie_ids) x where rp.mood_key <> 'random-surprise'
),
pt as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key, rp.card_type
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.tv_ids) x where rp.mood_key <> 'random-surprise'
),
s_users as (
  select string_agg(concat_ws(E'\t', x.u, coalesce(p.subcategoria_id, ''),
           coalesce(round(p.pontos_e, 2)::text, ''), coalesce(round(p.pontos_i, 2)::text, ''), coalesce(round(p.pontos_c, 2)::text, ''),
           coalesce(round(p.pontos_s, 2)::text, ''), coalesce(round(p.pontos_r, 2)::text, ''), case when x.is_bot then 1 else 0 end),
         E'\n' order by x.u) s
  from uidx x left join profiles p on p.id = x.user_id
),
s_ratings as (
  select string_agg(concat_ws(E'\t', x.u, um.movie_id, case when um.media_type = 'tv' then 't' else 'm' end, um.rating,
           um.created_at::date - date '2024-01-01', coalesce(um.updated_at, um.created_at)::date - date '2024-01-01'),
         E'\n' order by x.u, um.media_type, um.movie_id) s
  from user_movies um join uidx x on x.user_id = um.user_id where um.rating is not null
),
s_watch as (
  select string_agg(concat_ws(E'\t', x.u, um.movie_id, case when um.media_type = 'tv' then 't' else 'm' end,
           um.created_at::date - date '2024-01-01'), E'\n' order by x.u, um.media_type, um.movie_id) s
  from user_movies um join uidx x on x.user_id = um.user_id where um.rating is null
),
s_titles as (
  select string_agg(concat_ws(E'\t',
    tc.tmdb_id, case when tc.media_type = 'tv' then 't' else 'm' end,
    coalesce(round(tc.vote_average, 3)::text, ''), coalesce(tc.vote_count::text, ''),
    coalesce(extract(year from tc.release_date)::int::text, ''), coalesce(tc.runtime::text, ''),
    coalesce(tc.episode_run_time::text, ''), coalesce(tc.number_of_seasons::text, ''),
    coalesce(dirs.di::text, ''),
    coalesce(case coalesce(case when tc.media_type = 'tv' then pt.mood_key else pm.mood_key end, '')
      when 'adrenaline' then 'A' when 'adventures' then 'V' when 'catharsis' then 'C' when 'dark-and-scary' then 'D'
      when 'drug-trip' then 'P' when 'family-time' then 'F' when 'laugh-out-loud' then 'L' when 'mind-blowing' then 'M'
      when 'romantic' then 'R' when '' then '' else '?' end, ''),
    coalesce(left(case when tc.media_type = 'tv' then pt.card_type else pm.card_type end, 1), ''),
    coalesce(tgen_s.s, ''),
    coalesce(tkw_s.s, ''),
    coalesce(tcast_s.s, ''),
    coalesce(array_to_string(tc.origin_country, '/'), '')
  ), E'\n' order by tc.tn) s
  from tc
  left join dirs on dirs.director = tc.director
  left join tgen_s on tgen_s.tn = tc.tn
  left join tkw_s on tkw_s.tn = tc.tn
  left join tcast_s on tcast_s.tn = tc.tn
  left join pm on pm.m = tc.tmdb_id and tc.media_type = 'movie'
  left join pt on pt.m = tc.tmdb_id and tc.media_type = 'tv'
),
s_kw as (
  select string_agg(concat_ws(E'\t', ki, coalesce(kwdf.df, 0), nt), E'\n' order by ki) s
  from kwidx left join kwdf using (kid)
)
select '##users' || E'\n' || coalesce((select s from s_users), '') || E'\n'
    || '##ratings' || E'\n' || coalesce((select s from s_ratings), '') || E'\n'
    || '##watchlist' || E'\n' || coalesce((select s from s_watch), '') || E'\n'
    || '##titles' || E'\n' || coalesce((select s from s_titles), '') || E'\n'
    || '##keywords' || E'\n' || '#ndocs' || E'\t' || (select count(*) from movie_cache where media_type = 'movie') || E'\n'
    || coalesce((select s from s_kw), '') || E'\n';
$$;
