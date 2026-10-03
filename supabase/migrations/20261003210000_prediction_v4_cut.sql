-- Nota prevista v4 — corte de 9 e 10 (03/10/2026).
--
-- Em vez de mostrar a chance de 9 ou 10 ao lado de um 8 (o selo dourado,
-- que saiu), a própria nota sobe quando a chance é alta:
--   • chance de virar 9 ou 10 a partir de 40%  → a nota exibida vira 9;
--   • a partir de 70%                          → vira 10.
-- Abaixo de 40% a nota é a expectativa arredondada, e o menu do título
-- mostra "X% de chance de ser um 9 ou 10 seu".
--
-- Por que 40% e 70% (teste "deixa um de fora", 951 notas de prateleira):
--   • com 40%, quando a nota exibida é 9, mais da metade (51%) vira mesmo
--     9 ou 10;
--   • com 70%, quando a nota exibida é 10, 73% viram 9 ou 10 e 37% viram
--     10 exato (a média geral de 10 é 8%). Com 60%, só 30% viravam 10 e a
--     média real desses filmes era 8,8.
--   • erro médio 1,07 e ±1 ponto 75,6% — ainda bem melhor que a v3 (1,10)
--     e que a nota do TMDB (1,21).
-- O resto da fórmula é o mesmo da 20261003200000_prediction_v4.sql.

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
),
chance as (
  select pred.cid, pred.mu,
    case when pred.mu is null then null else 1 / (1 + exp(-1.702 * (pred.mu - 8.5) / sig.sigma)) end p9
  from pred cross join sig
)
-- Nota exibida: a expectativa arredondada, promovida a 9 quando a chance de
-- 9 ou 10 chega a 40% e a 10 quando chega a 70% (nunca rebaixa).
select chance.cid, chance.mu,
  case when chance.mu is null then null else
    greatest(0, least(10, greatest(round(chance.mu)::int,
      case when chance.p9 >= 0.70 then 10 when chance.p9 >= 0.40 then 9 else 0 end)))
  end,
  chance.p9
from chance;
$$;

