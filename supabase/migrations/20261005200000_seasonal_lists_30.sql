-- Eventos sazonais: duas listas de 30 filmes por tema (em vez de três de 20).
--
-- A 3ª lista de cada tema foi diluída nas outras duas (10 filmes para cada),
-- intercalados de três em três para misturar os oráculos. As edições passam a
-- alternar entre as duas: 2026 → 1ª, 2027 → 2ª, 2028 → 1ª…
-- Os 20 filmes de cada lista continuam nela, então o Halloween 2026 (no ar)
-- não perde nada do que já contou.
--
-- Halloween, 1ª lista (+10): Hotel Transilvânia, Psicose, Bom Menino,
--   Zumbilândia, A Noite dos Mortos-Vivos, Cronos, Annabelle, E.T., Onibaba,
--   A Ponta de um Crime.
-- Halloween, 2ª lista (+10): A Freira, Os Garotos Perdidos, O Mal que Nos
--   Habita, Festa no Céu, Cemitério Maldito, Fome Animal, Abigail, O Jovem
--   Frankenstein, A Bolha Assassina, O Corvo.
-- Natal, 1ª lista (+10): Escrito nas Estrelas, Adoráveis Mulheres (1994),
--   A Condenação, Uma Babá Milagrosa, Mens@gem para Você, A Caça, Babe,
--   A Lenda do Cavaleiro Verde, Brazil, Vamos Nessa.
-- Natal, 2ª lista (+10): O Natal Maluco de Harold e Kumar, Sintonia de Amor,
--   Jack Frost, Sexo, Drogas e Jingle Bells, Feriados em Família, Prenda-Me se
--   For Capaz, Despertar de um Pesadelo, Elle, Harry & Sally, A Fantástica
--   Fábrica de Chocolate.

update public.seasonal_events
set movie_lists = '[[948, 23202, 76492, 9479, 938614, 539, 10439, 346364, 1422096, 4011, 396535, 19908, 14836, 2668, 10331, 241848, 246741, 11655, 4232, 359246, 250546, 141, 36685, 601, 11905, 426063, 3763, 297608, 9297, 9270], [424139, 694, 439079, 3933, 16871, 1547, 620, 420634, 744857, 13310, 8839, 228326, 138843, 377, 8913, 293670, 77174, 763, 814, 8408, 1111873, 747, 628, 3034, 16372, 517116, 9599, 609, 11838, 9495]]'::jsonb
where id = 'halloween';

update public.seasonal_events
set movie_lists = '[[771, 1585, 9778, 508965, 562, 9587, 10719, 11661, 45094, 10437, 840430, 50506, 48395, 927, 9489, 508, 549053, 103663, 5825, 755339, 9598, 284, 850, 559907, 8871, 16938, 68, 162, 5255, 9430], [9647, 11395, 55465, 10147, 17979, 858, 10510, 1581, 27318, 8321, 9745, 296100, 1621, 258480, 9089, 941, 406994, 640, 81182, 331482, 11412, 2064, 109445, 337674, 10426, 345, 639, 5236, 16608, 252]]'::jsonb
where id = 'christmas';
