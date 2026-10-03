-- Piloto: humor secundário e terciário nos filmes das prateleiras (03/10/2026)
--
-- NÃO é uma migração — é o teste, guardado pra ser refeito quando houver
-- mais usuários e notas. Roda inteiro num execute_sql (só tabelas
-- temporárias, nada é gravado).
--
-- Amostra: os 200 filmes de prateleira com mais notas no site (cobrem 580
-- das 953 notas de prateleira) + Alien, o 8º Passageiro (o exemplo). Cada
-- um recebeu um humor secundário e, quando fazia sentido, um terciário
-- (180 secundários, 95 terciários). O principal é o da prateleira.
--
-- Pergunta: o desvio das notas de uma pessoa nos filmes que dividem o humor
-- secundário/terciário ajuda a prever a nota dela (além do humor principal)?
--
-- Resultado (teste "deixa um de fora", 580 notas):
--   correlação com o quanto a pessoa fugiu do esperado:
--     só humor principal ......................... 0,240
--     principal + secundário 0,3 + terciário 0,15 . 0,229
--     principal + secundário 0,5 + terciário 0,25 . 0,209
--     principal + secundário 1,0 + terciário 0,5 . 0,162
--     só o secundário (filmes com outro principal)  0,027  (ruído)
--     mesmo par principal+secundário, além do principal: −0,023
--   Com histórico em todas as prateleiras (secundário só na amostra) o
--   padrão é o mesmo: 0,204 só principal, caindo com qualquer peso.
-- Conclusão: com estes dados, os humores secundários diluem o sinal do
-- principal em vez de somar. Não entraram na previsão nem nas personas.

create temp table sm on commit drop as select * from (values
(22, 'adventures', 'laugh-out-loud'),
(155, 'mind-blowing', 'catharsis'),
(218, 'dark-and-scary', 'mind-blowing'),
(500, 'mind-blowing', 'catharsis'),
(949, 'catharsis', 'mind-blowing'),
(1271, 'adventures', 'drug-trip'),
(1726, 'adventures', 'laugh-out-loud'),
(7347, 'catharsis', null),
(8681, 'mind-blowing', null),
(9799, 'adventures', null),
(76341, 'adventures', 'drug-trip'),
(96721, 'catharsis', null),
(109424, 'catharsis', 'mind-blowing'),
(190859, 'catharsis', null),
(228150, 'catharsis', 'dark-and-scary'),
(245891, 'catharsis', null),
(293660, 'laugh-out-loud', null),
(312221, 'catharsis', 'romantic'),
(324786, 'catharsis', null),
(336882, 'mind-blowing', 'catharsis'),
(337170, 'laugh-out-loud', 'adventures'),
(359410, 'laugh-out-loud', null),
(361743, 'adventures', 'catharsis'),
(414906, 'mind-blowing', 'dark-and-scary'),
(449443, 'mind-blowing', null),
(458156, 'adventures', null),
(533535, 'laugh-out-loud', 'adventures'),
(541671, 'catharsis', null),
(882569, 'catharsis', null),
(911430, 'catharsis', null),
(98, 'catharsis', 'adrenaline'),
(120, 'adrenaline', 'catharsis'),
(329, 'dark-and-scary', 'family-time'),
(429, 'adrenaline', null),
(671, 'family-time', null),
(1250, 'adrenaline', 'dark-and-scary'),
(1593, 'family-time', 'laugh-out-loud'),
(1893, 'family-time', 'adrenaline'),
(4476, 'romantic', 'catharsis'),
(6479, 'dark-and-scary', 'catharsis'),
(6977, 'dark-and-scary', 'mind-blowing'),
(16869, 'adrenaline', 'laugh-out-loud'),
(61791, 'catharsis', 'adrenaline'),
(68718, 'adrenaline', 'laugh-out-loud'),
(87827, 'drug-trip', 'catharsis'),
(157336, 'mind-blowing', 'catharsis'),
(205775, 'catharsis', 'adrenaline'),
(259316, 'family-time', null),
(273248, 'mind-blowing', 'dark-and-scary'),
(335787, 'adrenaline', 'laugh-out-loud'),
(466272, 'laugh-out-loud', 'catharsis'),
(569094, 'family-time', 'drug-trip'),
(906126, 'catharsis', 'dark-and-scary'),
(1368337, 'adrenaline', null),
(13, 'romantic', 'laugh-out-loud'),
(73, 'dark-and-scary', null),
(101, 'adrenaline', null),
(103, 'dark-and-scary', 'drug-trip'),
(238, null, null),
(278, 'mind-blowing', null),
(322, 'mind-blowing', 'dark-and-scary'),
(334, 'drug-trip', 'romantic'),
(389, 'mind-blowing', null),
(423, null, null),
(424, null, null),
(497, null, null),
(598, 'adrenaline', null),
(680, 'laugh-out-loud', 'adrenaline'),
(769, 'adrenaline', 'laugh-out-loud'),
(1830, 'adrenaline', 'laugh-out-loud'),
(1955, 'dark-and-scary', null),
(5915, 'adventures', null),
(6145, 'mind-blowing', null),
(7445, null, null),
(10734, 'mind-blowing', 'adventures'),
(14574, null, null),
(44214, 'dark-and-scary', 'drug-trip'),
(45269, null, null),
(106646, 'laugh-out-loud', 'drug-trip'),
(116745, 'adventures', 'drug-trip'),
(244786, 'adrenaline', null),
(303991, 'laugh-out-loud', null),
(318846, 'laugh-out-loud', 'mind-blowing'),
(334533, 'family-time', 'laugh-out-loud'),
(466420, 'dark-and-scary', 'mind-blowing'),
(475557, 'dark-and-scary', 'drug-trip'),
(580175, 'laugh-out-loud', null),
(872585, 'mind-blowing', null),
(915935, 'mind-blowing', null),
(936075, null, null),
(965150, 'drug-trip', null),
(974576, 'mind-blowing', null),
(1000837, null, null),
(1064213, 'romantic', 'laugh-out-loud'),
(1106739, 'mind-blowing', null),
(176, 'mind-blowing', null),
(539, 'mind-blowing', null),
(578, 'adventures', 'adrenaline'),
(588, 'drug-trip', null),
(635, 'mind-blowing', 'drug-trip'),
(9003, 'drug-trip', null),
(9532, 'adrenaline', null),
(9552, null, null),
(49018, 'drug-trip', null),
(313922, 'adrenaline', null),
(447332, 'catharsis', 'adrenaline'),
(574475, 'adrenaline', 'laugh-out-loud'),
(882598, 'mind-blowing', null),
(913673, 'mind-blowing', null),
(938614, 'mind-blowing', null),
(1078605, 'mind-blowing', null),
(1083381, 'drug-trip', 'mind-blowing'),
(1339713, null, null),
(1423191, 'adrenaline', null),
(345, 'mind-blowing', 'dark-and-scary'),
(8066, 'mind-blowing', null),
(22538, 'laugh-out-loud', 'romantic'),
(51876, 'mind-blowing', 'adrenaline'),
(120467, 'laugh-out-loud', 'adventures'),
(240832, 'adrenaline', 'mind-blowing'),
(381283, 'dark-and-scary', 'mind-blowing'),
(396461, 'mind-blowing', null),
(530385, 'dark-and-scary', 'catharsis'),
(933260, 'dark-and-scary', null),
(12, 'adventures', 'laugh-out-loud'),
(425, 'laugh-out-loud', 'adventures'),
(585, 'laugh-out-loud', null),
(808, 'laugh-out-loud', 'romantic'),
(2062, 'laugh-out-loud', null),
(2300, 'laugh-out-loud', null),
(6477, 'laugh-out-loud', null),
(9806, 'adrenaline', 'laugh-out-loud'),
(10009, 'adventures', 'catharsis'),
(10681, 'romantic', 'adventures'),
(14160, 'adventures', 'catharsis'),
(49872, null, null),
(72984, null, null),
(116149, 'laugh-out-loud', null),
(354912, 'catharsis', null),
(950387, 'laugh-out-loud', 'adventures'),
(995133, 'catharsis', null),
(1087192, 'adventures', null),
(771, 'family-time', null),
(854, 'drug-trip', 'romantic'),
(4638, 'adrenaline', 'mind-blowing'),
(8363, null, null),
(9339, 'catharsis', null),
(9352, 'adventures', null),
(11918, null, null),
(12153, null, null),
(15373, null, null),
(18785, 'drug-trip', null),
(38365, 'family-time', null),
(38778, null, null),
(41630, 'romantic', null),
(77338, 'catharsis', null),
(87428, null, null),
(138697, 'romantic', null),
(290250, 'mind-blowing', 'adrenaline'),
(515001, 'catharsis', null),
(950028, null, null),
(105, 'adventures', 'laugh-out-loud'),
(274, 'dark-and-scary', null),
(388, 'adrenaline', null),
(550, 'drug-trip', null),
(567, 'romantic', null),
(603, 'adrenaline', 'drug-trip'),
(670, 'dark-and-scary', 'adrenaline'),
(807, 'dark-and-scary', null),
(1813, 'dark-and-scary', null),
(1954, 'catharsis', null),
(2118, 'adrenaline', null),
(2176, 'dark-and-scary', null),
(2649, 'drug-trip', null),
(2832, 'dark-and-scary', null),
(9481, 'dark-and-scary', null),
(11324, 'dark-and-scary', 'drug-trip'),
(13183, 'adrenaline', 'dark-and-scary'),
(22803, 'adrenaline', null),
(27205, 'adrenaline', 'drug-trip'),
(37165, 'laugh-out-loud', 'catharsis'),
(50646, 'romantic', 'laugh-out-loud'),
(65754, 'dark-and-scary', null),
(254320, 'drug-trip', 'romantic'),
(381288, 'dark-and-scary', null),
(419430, 'dark-and-scary', 'laugh-out-loud'),
(496243, 'laugh-out-loud', 'dark-and-scary'),
(529216, null, null),
(546554, 'laugh-out-loud', null),
(577922, 'adrenaline', null),
(593643, 'dark-and-scary', 'laugh-out-loud'),
(696506, 'laugh-out-loud', 'adventures'),
(597, 'catharsis', 'adventures'),
(1824, 'laugh-out-loud', null),
(6615, 'laugh-out-loud', 'catharsis'),
(11036, 'catharsis', null),
(19913, 'laugh-out-loud', 'catharsis'),
(587792, 'laugh-out-loud', 'mind-blowing'),
(950396, 'adrenaline', 'dark-and-scary'),
(1368166, 'mind-blowing', 'dark-and-scary'),
(348, 'adventures', 'drug-trip')) v(m, sec, ter);
create temp table pm on commit drop as
  select distinct on ((x)::int) (x)::int m, rp.mood_key from recommendation_pools rp, jsonb_array_elements_text(rp.movie_ids) x where rp.mood_key <> 'random-surprise';
create temp table r on commit drop as
  select um.user_id u, um.movie_id m, um.rating::float r, mc.vote_average::float va
  from user_movies um join movie_cache mc on mc.tmdb_id=um.movie_id and mc.media_type='movie'
  where um.media_type='movie' and um.rating is not null and mc.vote_average > 0;
create temp table gg on commit drop as select avg(r - va) g from r;
create temp table us on commit drop as select u, count(*) n, sum(r - va) sres from r group by u;
create temp table e on commit drop as
  select r.*, r.r - r.va - (us.sres + 3*gg.g)/(us.n + 3) e, r.r - r.va - (us.sres - (r.r - r.va) + 3*gg.g)/(us.n - 1 + 3) y, us.n,
         pm.mood_key p, sm.sec s, sm.ter t, (sm.m is not null) ins
  from r join us using (u) join pm on pm.m = r.m left join sm on sm.m = r.m, gg;
-- pistas (alvo e histórico na amostra, deixando o próprio filme de fora):
--   prim:     mesmo humor principal
--   multi:    semelhança de humores (principal 1, secundário a, terciário b)
--   sec_only: o secundário do alvo aparece no outro filme, sem o principal bater
--   pair:     mesmo par {principal, secundário}
create temp table w on commit drop as select 0.5::float a, 0.25::float b;
create temp table mv on commit drop as
  select e.m, e.p mood, 1.0::float wt from e group by e.m, e.p
  union all select sm.m, sm.sec, (select a from w) from sm where sm.sec is not null
  union all select sm.m, sm.ter, (select b from w) from sm where sm.ter is not null;
create temp table x on commit drop as
select a.u, a.m, a.y,
  (select coalesce(sum(b.e),0) from e b where b.u=a.u and b.m<>a.m and b.ins and b.p=a.p)
    / ((select count(*) from e b where b.u=a.u and b.m<>a.m and b.ins and b.p=a.p) + 8) prim,
  (select coalesce(sum(s.sim * b.e),0) from e b join lateral (select sum(v1.wt * v2.wt) sim from mv v1 join mv v2 on v2.mood = v1.mood where v1.m = a.m and v2.m = b.m) s on true
     where b.u=a.u and b.m<>a.m and b.ins)
    / ((select coalesce(sum(s.sim),0) from e b join lateral (select sum(v1.wt * v2.wt) sim from mv v1 join mv v2 on v2.mood = v1.mood where v1.m = a.m and v2.m = b.m) s on true
     where b.u=a.u and b.m<>a.m and b.ins) + 8) multi,
  case when a.s is null then 0 else
    (select coalesce(sum(b.e),0) from e b where b.u=a.u and b.m<>a.m and b.ins and b.p<>a.p and (b.p=a.s or b.s=a.s))
    / ((select count(*) from e b where b.u=a.u and b.m<>a.m and b.ins and b.p<>a.p and (b.p=a.s or b.s=a.s)) + 8) end sec_only,
  case when a.s is null then 0 else
    (select coalesce(sum(b.e),0) from e b where b.u=a.u and b.m<>a.m and b.ins and least(b.p,coalesce(b.s,''))=least(a.p,a.s) and greatest(b.p,coalesce(b.s,''))=greatest(a.p,a.s))
    / ((select count(*) from e b where b.u=a.u and b.m<>a.m and b.ins and least(b.p,coalesce(b.s,''))=least(a.p,a.s) and greatest(b.p,coalesce(b.s,''))=greatest(a.p,a.s)) + 4) end pair
from e a where a.ins and a.n >= 5;
select count(*) n,
  round(corr(y, prim)::numeric,3) corr_prim,
  round(corr(y, multi)::numeric,3) corr_multi,
  round(corr(y, sec_only)::numeric,3) corr_sec_only,
  round(corr(y, pair)::numeric,3) corr_pair,
  round(corr(y - 1.2*prim, pair)::numeric,3) corr_pair_after_prim
from x;
