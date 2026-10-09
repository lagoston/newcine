-- Curadoria das séries nas 27 prateleiras dos oráculos (09/10/2026).
--
-- O que muda:
-- 1. tv_ids de cada prateleira (oráculo + humor) passa a ter de 15 a 49
--    séries: 823 no total (eram 298, várias fora do banco). Nenhuma série
--    se repete entre prateleiras.
-- 2. recommendation_pools ganha o gatilho que atualiza updated_at a cada
--    mudança. Sem ele, mexer nas prateleiras não mudava a "impressão
--    digital" de Filmes/Séries Para Você (for_you_cache) e a home só via a
--    mudança depois de 24 horas.
--
-- Regras de cada oráculo (as mesmas da migração 20261003100000, com a
-- régua de votos ajustada para séries, que recebem menos votos no TMDB):
--   Bogart  — estreou em 2000 ou depois e tem 300+ votos;
--   Fincher — estreou até 1999 e tem 100+ votos;
--   Cypher  — o resto (pouco conhecidas, independente da nota).
-- Todas as 823 foram conferidas com os dados do TMDB de 09/10/2026.
--
-- O humor seguiu a curadoria dos filmes: as palavras-chave campeãs de cada
-- prateleira de filmes (ex.: Adrenalina = artes marciais, tiroteio,
-- vingança, espionagem, assalto; Catarse = história real, biografia,
-- luto, família, esporte, tribunal; Mind-Blowing = thriller psicológico,
-- investigação, quem matou, IA, viagem no tempo, conspiração) viraram
-- uma pontuação por série, revista uma a uma.
--
-- Correções nas séries que já estavam nas prateleiras:
--   - oráculo trocado pela regra de data/votos: Baywatch, Storm of the
--     Century, The Young Indiana Jones Chronicles (→ Fincher); Ned's
--     Declassified, Bluey, Crash Landing on You, Frozen Planet (→ Bogart);
--     Seinfeld, Home Improvement, Dawson's Creek (Bogart → Fincher);
--     Jamestown, I'm a Virgo, American Housewife, Life in Pieces, The
--     Ranch, Younger, Grand Hotel (Bogart → Cypher); e as de Fincher com
--     menos de 100 votos (The Equalizer, Voyagers!, Tales of the Gold
--     Monkey, Dark Shadows, Kolchak, Monsters, Dark Season, Mr. Show,
--     Tales from the Darkside, Eerie Indiana, Max Headroom, Pee-wee's
--     Playhouse, O Guia do Mochileiro das Galáxias, Spitting Image, The
--     Goodies, The State, Liquid Television, SCTV, WKRP, Mary Tyler Moore,
--     American Gothic, Dark Skies, Nowhere Man, The Hitchhiker, VR.5) →
--     Cypher, no mesmo humor;
--   - repetidas: Twin Peaks (ficou só em Fincher · Mind-Blowing),
--     Westworld (só Mind-Blowing), The Umbrella Academy (só Aventuras);
--   - humor trocado: Chernobyl (Aventuras → Catarse), Arcane (Família →
--     Aventuras), M*A*S*H (Aventuras → Muitas Risadas), Yellowjackets
--     (Psicodélico → Sombrio), Lucifer, Watchmen, White Collar e The
--     Lincoln Lawyer (Catarse → Mind-Blowing);
--   - saíram dois números que não eram as séries pretendidas: 4671
--     (Nightline, telejornal, sem votos — Supernatural, 1622, entrou em
--     Bogart · Sombrio) e 31100 (Insides Out, sem votos nem data).
--
-- Os dados completos de cada série (títulos e sinopses em pt/en, pôsteres,
-- gêneros, elenco, criador, palavras-chave, onde assistir, classificação
-- indicativa e temporadas com episódios) foram gravados no movie_cache
-- (media_type = 'tv') no mesmo dia, direto do TMDB — as prateleiras só leem
-- do banco. Para pôr uma série nova numa prateleira, ela precisa estar no
-- movie_cache antes (ver claude/previsao-de-notas-e-series.md).

create or replace function public.touch_recommendation_pools_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace trigger trigger_touch_recommendation_pools_updated_at
  before update on public.recommendation_pools
  for each row execute function public.touch_recommendation_pools_updated_at();

update public.recommendation_pools rp
   set tv_ids = v.ids
  from (values
  ('bogart', 'adrenaline', '[71446,76479,1412,2288,60797,88329,108978,67178,73375,1973,71789,41727,222766,129552,202555,60802,146176,32573,93405,61889,77169,88396,194764,113962,120911,95480,1436,1414,85021,72710,46533,61859,73544,198102,12598,80623,2919,1404,247718,31586,117023,104555,92137,111800]'::jsonb),
  ('cypher', 'adrenaline', '[221079,4297,69557,62476,4046,3764,41597,158141,2321,67896,2966,5829,71146,235759,219760,125909,3411,10929,31867,215072,119769,77939,252193]'::jsonb),
  ('fincher', 'adrenaline', '[2384,1516,1908,2119,734,397,1532,1486,2303,600,509,3318,4386,2098,4574,888,2328,160,2473,28136,167,4357,56387,4625,513,1472,40424,5031]'::jsonb),
  ('bogart', 'adventures', '[1399,60574,82856,75006,44217,100088,94997,71912,84773,60708,73586,56570,80752,125988,1639,68507,126308,93740,103768,85720,47665,82452,100757,224372,116135,45,47450,94605,1429,95557,246,4613,16997,106379,83867,1437,1972,63333,1891,46296,71914,31911,46298,63639,89456,85937,4194]'::jsonb),
  ('cypher', 'adventures', '[240456,11645,10393,71391,5391,2999,207484,196890,243881,11466,4488,2560,64414,99777,289219,79340,153411,61314,33189,40546,65166,128329,100565,60654,205050,962]'::jsonb),
  ('fincher', 'adventures', '[253,4616,2875,4615,3772,1663,4414,1026,2443,3051,39775,661,12971,12609,37854,60572,4629,655,1855,580,30991,42444,35935,9687,14141,121,4271,3137,1018,41692,13862,30669,26453,501]'::jsonb),
  ('bogart', 'catharsis', '[1396,1416,60059,87739,34307,63351,1409,1425,69740,65494,136315,76331,66292,67136,1274,91275,90972,241609,87108,1438,1408,71712,1621,1104,82883,249042,241259,81355,111141,37680,66788,1424,80968,250307,79525,100834,62455,136283,67070,75214]'::jsonb),
  ('cypher', 'catharsis', '[211039,286709,44856,88166,125949,114068,11245,110382,108664,72071,78074,33933,4344,18053,69851,74140,46434,14069,207333,60549,110534,76662,64010,6484,65336]'::jsonb),
  ('fincher', 'catharsis', '[1398,4588,3322,688,13555,2382,4396,19649,1101,2388,2243,194,33153,65170,512,751,156249,5487,11095]'::jsonb),
  ('bogart', 'dark-and-scary', '[1402,1413,1405,124364,90462,67744,40008,72844,46786,97400,75191,71116,1622,99966,79242,47640,62264,200875,96648,54671,70593,109958,157065,83659,86848,113988,64230,95479,61374,114410,42671,117488,62286,10545,112314,62046,131927]'::jsonb),
  ('cypher', 'dark-and-scary', '[3743,12272,10377,2883,5084,6323,3418,61746,126118,247518,224941,93693,33841,157004,288673,21728,4267,10424,75775,8974,19849,278196,43270,137720,92209]'::jsonb),
  ('fincher', 'dark-and-scary', '[95,5835,2913,1712,14009,2263,4346,4318,5028,19614,2426,16118,9045,21567,5273,13455,2085,1981,12925,2286]'::jsonb),
  ('bogart', 'drug-trip', '[60625,85552,86831,92749,61222,61664,58474,67195,1044,73411,96713,65495,69470,126506,204154,152483,86340,73925,8724,186,1215,94954,75208,105248,1126,79501,709,61593,72339,31132,15260,88236,71694]'::jsonb),
  ('cypher', 'drug-trip', '[93035,105169,610,1386,4045,4617,4612,2048,2040,3501,2841,948,23364,251,56590,206013,2418,44169,36243,42821,26867,56021,61174,204284,63535,116156,33827]'::jsonb),
  ('fincher', 'drug-trip', '[2391,849,1430,406,4483,1551,1087,890,504,13943,745,3611,4493,2423,3579,177,1567]'::jsonb),
  ('bogart', 'family-time', '[66732,119051,70785,2004,4586,1778,4605,63623,7869,49009,61381,1600,82728,40075,65334,71728,2038,39272,93741,63401,92685,4686,61617,37606,31356,61175,68267,4630,18123,1877,897,3854,5371,79732,81046,604]'::jsonb),
  ('cypher', 'family-time', '[4745,3817,67117,63398,892,82456,114466,32315,45013,68665,102321,80587,46698,108255,35254,67431,74606,76075,70540,35016,4602,21762,1950]'::jsonb),
  ('fincher', 'family-time', '[4313,4500,2140,1777,9957,1835,2685,4550,1558,387,1892,47,13023,4658,605,7842,1988,3763,3570,607,1996,537,4229,926,606,35790,82,3022,2228,720,57911,1615,1546,2362,1781,4035,1931,2005]'::jsonb),
  ('bogart', 'laugh-out-loud', '[1418,1100,2316,48891,1421,97546,18347,66573,60573,8592,4589,1420,2710,236235,1422,61662,247767,125935,58957,2691,2490,10283,83631,73107,154385,1433,2317,32726,2996,62649,76148,815,4546,4608,2947,7317,1447,74204,73021,97727,136311,100883,70796]'::jsonb),
  ('cypher', 'laugh-out-loud', '[65493,971,2962,35338,65150,4556,2282,92621,36189,60839,31497,63404,2187,61828,222023,1906,380,1915,436,91630,16183,20724,332,17174,44684]'::jsonb),
  ('fincher', 'laugh-out-loud', '[1668,4239,141,1759,1678,3845,634,1921,2730,2686,1922,2251,162,2132,1400,918,456,2190,1434,615,52,4327,2352,3452,2207,2122,2131,4238,155,7246,4454,6024,4482,72,2706,1813,4455,4345]'::jsonb),
  ('bogart', 'mind-blowing', '[70523,19885,42009,63247,62560,4607,46648,46952,69478,95396,79696,90669,69061,54344,225171,84977,81349,196322,1428,278178,63174,79788,21510,116799,13916,60622,1705,4057,5920,76669,110316,1407,96677,115004,66276,1411,64464,61056,70453,108545,56296,68421,65249,42509,1426,1427,43982,84661,30981]'::jsonb),
  ('cypher', 'mind-blowing', '[3797,39361,7235,318,164,10494,10370,1956,32368,44264,209167,64852,91520,4920,72748,6127,13865,37290,1475,86449,69763,116727,91997,64840,70626,116612,92926,113600]'::jsonb),
  ('fincher', 'mind-blowing', '[4087,1920,4018,1649,4330,1918,21561,894,6357,2734,549,873,790,484,30983,764,799,3476,1706,4464,21720,126,3572]'::jsonb),
  ('bogart', 'romantic', '[18165,81356,78191,91239,1395,82596,89905,194766,2673,61418,269,88324,91602,94796,69050,124834,33907,117581,96462,61663,125910,16420,112888,89641,67915,104877,12637,110070,83121,154825,79434,215720,128883,65320,82739,64254,250670]'::jsonb),
  ('cypher', 'romantic', '[242551,62117,47990,250923,81322,67419,61744,235635,216089,61118,111743,95612,4951,3215,56568,12539,135897,70649,74074,85991,27167,1043,76880]'::jsonb),
  ('fincher', 'romantic', '[105,13780,2327,2025,1457,9160,57706,2397,500,36837,32676,4624,3266,4324,1998]'::jsonb)
  ) as v(card_type, mood_key, ids)
 where rp.card_type = v.card_type and rp.mood_key = v.mood_key;
