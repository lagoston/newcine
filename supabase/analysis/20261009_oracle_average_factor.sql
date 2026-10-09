-- Teste: um fator a mais na nota prevista — a média do usuário com cada
-- oráculo (09/10/2026). Só leitura: não grava nada.
--
-- Ideia (do Bruno): somar à previsão a nota média que a pessoa dá aos
-- títulos de cada oráculo (Bogart, Fincher, Cypher), considerando neutro
-- quem tem menos de 5 filmes daquele oráculo.
--
-- Como foi testado: "deixa um de fora" nas 963 notas de filmes das
-- prateleiras (22 usuários). Para cada nota, a previsão atual
-- (predict_ratings com p_exclude_movie) é somada a uma de duas versões do
-- fator, calculadas sem a própria nota:
--   A — o desvio médio da pessoa naquele oráculo em relação ao esperado
--       (nota − TMDB − viés pessoal), encolhido com k (como o termo de
--       humor): w × soma / (quantidade + k);
--   B — a ideia literal: média crua da pessoa no oráculo − média geral
--       dela, só com 5+ filmes no oráculo (senão 0), vezes w.
-- O usuário entra em uma de duas metades (hash do id) para ver se o ganho
-- se repete nas duas.
--
-- Resultado (previsão atual, sem o corte de 9/10: erro médio 1,043,
-- RMSE 1,448, nota exata 33,4%, ±1 75,6%):
--   B (literal), w 0,25 a 1,0: piora o erro (RMSE 1,443 a 1,487; erro médio
--     1,046 a 1,062). A média crua repete o que a nota do TMDB e o viés
--     já dizem: os filmes do Fincher têm nota pública mais alta, então
--     "a média do Fincher é alta" não é informação nova.
--   A, w 0,25 e k 5–10: erro médio 1,032–1,033 (−1%), RMSE 1,441
--     (−0,5%), melhora nas duas metades. w 0,5 a 0,75 e k 10–20: RMSE
--     1,437–1,438 (−0,7%), mas o erro médio volta a 1,04 numa das metades.
--   Correlação do fator A (k 10) com o que a previsão atual erra: 0,12
--     (0,08 e 0,17 nas metades; Fincher 0,19, Cypher 0,13, Bogart 0,10).
-- Conclusão: a versão literal é ruído; a versão "desvio por oráculo" é
-- sinal real, mas fraco (explica ~1,4% do erro que sobra). Não entrou na
-- fórmula; vale refazer com mais usuários.
--
-- Cada bloco abaixo roda um quarto das notas (≈45 s; a API corta perto de
-- 1 minuto) e devolve somas por variante; some os 4 resultados.
-- Troque __LO__ e __HI__ por 1/240, 241/480, 481/720 e 721/1000.

with
pm as (
  select distinct on ((x)::int) (x)::int m, rp.mood_key, rp.card_type o
  from recommendation_pools rp cross join lateral jsonb_array_elements_text(rp.movie_ids) x
  where rp.mood_key <> 'random-surprise'
),
allr as (
  select um.user_id u, um.movie_id m, um.rating::float r, mc.vote_average::float va, pm.o
  from user_movies um
  join movie_cache mc on mc.tmdb_id = um.movie_id and mc.media_type = 'movie'
  left join pm on pm.m = um.movie_id
  where um.media_type = 'movie' and um.rating is not null and mc.vote_average > 0
),
g as (select avg(r - va) g from allr),
us as (select u, count(*) n, sum(r - va) sres, sum(r) sr from allr group by u),
uo as (select u, o, count(*) n, sum(r - va) sres, sum(r) sr from allr where o is not null group by u, o),
s as (select a.*, row_number() over (order by a.u, a.m) rn from allr a where a.o is not null),
base as (
  select s.u, s.m, s.r, s.va, s.o, p.mu,
    (us.sres - (s.r - s.va) + 3 * g.g) / (us.n - 1 + 3) bias_loo,
    us.n - 1 n_all, us.sr - s.r sr_all,
    uo.n - 1 n_o, uo.sres - (s.r - s.va) sres_o, uo.sr - s.r sr_o
  from s
  join us on us.u = s.u
  join uo on uo.u = s.u and uo.o = s.o
  cross join g
  cross join lateral predict_ratings(s.u, 'movie', array[s.m], s.m) p
  where s.rn between __LO__ and __HI__
),
feat as (
  select b.*,
    (b.sres_o - b.n_o * b.bias_loo) sum_e_o,
    case when b.n_o >= 5 then b.sr_o / b.n_o - b.sr_all / nullif(b.n_all, 0) else 0 end raw_dev,
    abs(hashtext(b.u::text)) % 2 half
  from base b where b.mu is not null
),
grid as (
  select 'A' v, w, k from unnest(array[0.0, 0.25, 0.5, 0.75, 1.0]) w cross join unnest(array[5.0, 10.0, 20.0]) k
  union all select 'B', w, 0 from unnest(array[0.25, 0.5, 0.75, 1.0]) w
),
ev as (
  select grid.v, grid.w, grid.k, f.half, f.r,
    f.mu + case when grid.v = 'A' then grid.w * f.sum_e_o / (f.n_o + grid.k) else grid.w * f.raw_dev end mu2
  from feat f cross join grid
),
agg as (
  select v || ':' || w || ':' || k || ':' || half key,
    count(*) n,
    sum(abs(r - greatest(0, least(10, round(mu2))))) sae,
    round(sum((r - mu2) ^ 2)::numeric, 3) sse,
    sum((r = greatest(0, least(10, round(mu2))))::int) ex,
    sum((abs(r - greatest(0, least(10, round(mu2)))) <= 1)::int) p1
  from ev group by 1
),
diag as (
  select 'D:' || o || ':' || half key, count(*) n,
    round(sum(r - mu)::numeric, 3) sae,
    round(sum(sum_e_o / (n_o + 10))::numeric, 3) sse,
    round(sum((r - mu) * sum_e_o / (n_o + 10))::numeric, 3) ex,
    round(sum((sum_e_o / (n_o + 10)) ^ 2)::numeric, 3) p1
  from feat group by o, half
  union all
  select 'R:' || o || ':' || half, count(*),
    round(sum(raw_dev)::numeric, 3), round(sum((r - mu) ^ 2)::numeric, 3),
    round(sum((r - mu) * raw_dev)::numeric, 3), round(sum(raw_dev ^ 2)::numeric, 3)
  from feat group by o, half
)
select string_agg(key || '|' || n || '|' || sae || '|' || sse || '|' || ex || '|' || p1, ';' order by key) out
from (select * from agg union all select * from diag) z;
