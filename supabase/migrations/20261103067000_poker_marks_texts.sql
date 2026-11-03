-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: os textos finais das 5 tags
-- dos marcos, escritos pelo pacote B (scripts/poker/marks.sql.txt). As linhas
-- já existiam (20261103064000_poker_seed, textos provisórios), então aqui é
-- UPDATE. Nome, emoji e regra não mudam; starts_at continua no futuro (as tags
-- ficam escondidas de quem não as tem até a abertura do pôquer).

update public.special_tags set
  description = 'First place with a prize on the line. I gave it a 10. Don''t tell anyone.',
  description_pt = 'Primeiro lugar valendo prêmio. Dei nota 10. Não conta pra ninguém.',
  requirement_description = 'Finish 1st in a prize match for the first time',
  requirement_description_pt = 'Fique em 1º lugar numa partida valendo prêmio pela primeira vez'
where id = 'poker-first-win';

update public.special_tags set
  description = 'Took me off the table with a prize on the line. Few can say that. Say it.',
  description_pt = 'Me tirou da mesa numa partida valendo. Poucos podem dizer isso. Diga.',
  requirement_description = 'Knock out the Fox in a prize match',
  requirement_description_pt = 'Elimine o Raposo numa partida valendo prêmio'
where id = 'poker-fox-hunter';

update public.special_tags set
  description = 'Knocked out all three in one match. A gorgeous massacre. I''m jealous.',
  description_pt = 'Eliminou os três na mesma partida. Que massacre lindo. Fiquei com inveja.',
  requirement_description = 'Knock out all three oracles in the same prize match',
  requirement_description_pt = 'Elimine os três oráculos na mesma partida valendo prêmio'
where id = 'poker-clean-sweep';

update public.special_tags set
  description = 'Took a big pot with the worse hand, and nobody saw. I did. Bravo.',
  description_pt = 'Levou um pote grande com a pior mão, e ninguém viu. Eu vi. Aplaudo.',
  requirement_description = 'Win a pot of 20+ big blinds without showdown while someone who folded had the better hand',
  requirement_description_pt = 'Leve um pote de 20 BB ou mais sem showdown, com alguém que desistiu tendo mão melhor'
where id = 'poker-oscar-bluff';

update public.special_tags set
  description = 'Seven straight days at the prize table. I don''t watch that many films a week.',
  description_pt = 'Sete dias seguidos na mesa valendo. Nem eu vejo tanto filme numa semana.',
  requirement_description = 'Finish a prize match on 7 days in a row',
  requirement_description_pt = 'Termine uma partida valendo prêmio em 7 dias seguidos'
where id = 'poker-seven-nights';
