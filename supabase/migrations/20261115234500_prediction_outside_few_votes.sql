-- Previsão de fora das prateleiras também para filmes com poucos votos (15/11/2026, noite).
--
-- Pedido do Bruno (15/11/2026, 20h17): "De fato a previsão foi adicionada
-- para alguns filmes fora das prateleiras, porém alguns títulos aparentemente
-- mais recentes como 'The Beast' e 'Sem desistir' ambos em popular agora não
-- apresentam. Investigue e corrija".
--
-- A causa: a fórmula paralela (20261115233000_prediction_outside_shelves.sql)
-- só valia para filmes com 20+ votos no TMDB, porque abaixo disso o erro subia
-- (bots: erro quadrático 1,90 contra ~1,73). Lançamentos estão quase sempre
-- abaixo disso nos primeiros dias: Sem Desistir (Never Surrender, 12/11/2026)
-- tinha 4 votos no banco; The Beast (Renny Harlin, 08/10/2026), 15. O menu do
-- título também barrava pelo mesmo número (o vote_count da lista do TMDB).
--
-- O problema dos poucos votos é a nota do público, que com 4 votos é quase
-- sorteio (nos filmes do catálogo com 1 a 19 votos o desvio das notas é 1,48;
-- com 100+, 0,77). Em vez de jogar fora, a nota é puxada para a média do
-- catálogo (6,63) como se tivesse 3 votos a mais nela:
--     nota usada = (votos × nota do TMDB + 3 × 6,63) / (votos + 3)
-- Com 4 votos, um 7,8 vira 7,3; com 15 votos, 5,8 vira 5,9; com 300 votos,
-- quase nada muda. O resto da fórmula paralela fica igual.
--
-- Testado com "deixa um de fora" nas notas de filmes de fora (as pessoas de
-- verdade não têm nenhuma nota em filme de fora com menos de 20 votos; os
-- bots têm 467). Acerto exato / erro médio / erro quadrático:
--                         bots, < 20 votos     bots, 20–99        bots, 100+       pessoas, 100+
--   sem puxar (o corte)   24,8 / 1,38 / 1,90   31,3 / 1,22 / 1,74  30,0 / 1,20 / 1,67  33,0 / 1,25 / 1,74
--   puxando (3 votos)     29,6 / 1,26 / 1,75   31,5 / 1,22 / 1,73  30,2 / 1,20 / 1,67  33,0 / 1,25 / 1,74
-- Puxando, os filmes com poucos votos ficam quase tão bem previstos quanto os
-- de 20 a 99, e nenhuma faixa piora. Outras combinações (6, 10 e 20 votos;
-- média 5,8 e 6,2) ficaram parecidas ou piores; 3 votos com a média do
-- catálogo é a escolha que não foi ajustada aos bots (a média 5,8 dos filmes
-- obscuros dos bots não vale para um lançamento popular).
--
-- Continua sem previsão o filme sem nenhum voto (ainda não lançado): sem nota
-- do público não há com o que começar.
--
-- Esta migração reescreve, a partir das versões do banco (iguais às do
-- arquivo 20261115233000): predict_ratings_outside (candidatos com 1+ voto e
-- a nota puxada), get_title_prediction (sem o corte de 20) e o gatilho do
-- placar (sem o corte de 20).

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

revoke all on function public.predict_ratings_outside(uuid, integer[], integer) from public, anon, authenticated;
grant execute on function public.predict_ratings_outside(uuid, integer[], integer) to service_role;

-- A previsão do menu do título, para quem está vendo (auth.uid()).
--   status 'ok'             → predictedRating, mu, sigma, tenChance e scope
--                             ('shelf' = v4 da prateleira, 'outside' = fórmula
--                             paralela);
--   status 'rated'          → você já avaliou (o menu mostra a sua nota);
--   status 'no_persona'     → questionário de personalidade incompleto;
--   status 'outside_series' → série fora das prateleiras (sem previsão);
--   status 'few_votes'      → filme ainda sem nota do público (nenhum voto no
--                             TMDB; desde a noite de 15/11, poucos votos bastam);
--   status 'not_cached'     → o título ainda não está no banco de filmes (o
--                             menu guarda e pergunta de novo);
--   status 'anon'           → ninguém logado.
create or replace function public.get_title_prediction(p_id integer, p_media_type text default 'movie')
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_type text := case when p_media_type = 'tv' then 'tv' else 'movie' end;
  v_on_shelf boolean;
  v_found boolean;
  v_mu double precision;
  v_rating integer;
  v_p9 double precision;
  v_p10 double precision;
  v_sigma double precision;
  v_from9 double precision;
  v_from10 double precision;
  v_va numeric;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'anon');
  end if;

  if not exists (
    select 1 from profiles p
     where p.id = v_uid and p.personalidade_completa is not null and p.personalidade_completa <> ''
  ) then
    return jsonb_build_object('status', 'no_persona');
  end if;

  if exists (
    select 1 from user_movies um
     where um.user_id = v_uid and um.movie_id = p_id and coalesce(um.media_type, 'movie') = v_type and um.rating is not null
  ) then
    return jsonb_build_object('status', 'rated');
  end if;

  v_on_shelf := exists (
    select 1 from recommendation_pools rp
     where rp.mood_key <> 'random-surprise'
       and (case when v_type = 'tv' then rp.tv_ids else rp.movie_ids end) @> to_jsonb(p_id)
  );

  if v_on_shelf then
    select p.mu, p.predicted_rating, p.chance_9plus, p.chance_10
      into v_mu, v_rating, v_p9, v_p10
      from predict_ratings(v_uid, v_type, array[p_id]) p;
    v_found := found;
    if not v_found then
      return jsonb_build_object('status', 'not_cached', 'scope', 'shelf');
    end if;
    if v_mu is null then
      return jsonb_build_object('status', 'few_votes', 'scope', 'shelf');
    end if;
    -- a largura sai das chances que a v4 calculou (a mesma conta da
    -- predict-single-movie): vale a que estiver mais longe do próprio limiar
    v_from9 := case when v_p9 > 0 and v_p9 < 1 and v_p9 <> 0.5 then 1.702 * (v_mu - 8.5) / ln(v_p9 / (1 - v_p9)) end;
    v_from10 := case when v_p10 > 0 and v_p10 < 1 and ln(v_p10 / (1 - v_p10)) + 0.4 <> 0
                     then 1.702 * (v_mu - 9.5) / (ln(v_p10 / (1 - v_p10)) + 0.4) end;
    if abs(v_mu - 8.5) >= abs(v_mu - 9.5) then
      v_sigma := case when v_from9 > 0.2 and v_from9 < 6 then v_from9 when v_from10 > 0.2 and v_from10 < 6 then v_from10 end;
    else
      v_sigma := case when v_from10 > 0.2 and v_from10 < 6 then v_from10 when v_from9 > 0.2 and v_from9 < 6 then v_from9 end;
    end if;
    return jsonb_build_object(
      'status', 'ok',
      'scope', 'shelf',
      'predictedRating', v_rating,
      'mu', round(v_mu::numeric, 3),
      'sigma', round(v_sigma::numeric, 3),
      'tenChance', round(v_p10::numeric, 3)
    );
  end if;

  if v_type = 'tv' then
    return jsonb_build_object('status', 'outside_series');
  end if;

  select mc.vote_average into v_va
    from movie_cache mc
   where mc.tmdb_id = p_id and mc.media_type = 'movie';
  if not found then
    return jsonb_build_object('status', 'not_cached', 'scope', 'outside');
  end if;
  if coalesce(v_va, 0) <= 0 then
    return jsonb_build_object('status', 'few_votes', 'scope', 'outside');
  end if;

  select p.mu, p.predicted_rating, p.chance_10, p.sigma
    into v_mu, v_rating, v_p10, v_sigma
    from predict_ratings_outside(v_uid, array[p_id]) p;
  if not found or v_mu is null then
    return jsonb_build_object('status', 'few_votes', 'scope', 'outside');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'scope', 'outside',
    'predictedRating', v_rating,
    'mu', round(v_mu::numeric, 3),
    'sigma', round(v_sigma::numeric, 3),
    'tenChance', round(v_p10::numeric, 3)
  );
end;
$function$;

revoke all on function public.get_title_prediction(integer, text) from public, anon;
grant execute on function public.get_title_prediction(integer, text) to authenticated, service_role;

-- O placar de acertos: igual ao da migração 20261115233000, sem o corte de
-- 20 votos (basta o filme de fora ter nota do público). A linha nasce
-- 'pending' com model_version 'fora-v1', e a log-prediction-accuracy calcula
-- com predict_ratings_outside. was_in_pool continua dizendo se o título
-- está em alguma prateleira (a coringa conta, como sempre contou; ela é só uma
-- mistura das outras, então dá no mesmo).
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
