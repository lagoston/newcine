-- Troca de 13 personagens das personalidades (11/10/2026, pedido do Bruno).
-- O código, os humores e a ordem não mudam; só personagem, filme, pôster,
-- título e resumo. Quem já tinha a personalidade passa a ver o personagem
-- novo na próxima vez que abrir o Oráculo.
--
-- Motivo de cada troca (o Bruno apontou a letra que não encaixava):
--   ZRL Tony Stark      → John Smith (Sr. & Sra. Smith): R fraco no Stark
--   ZRF Bob Parr        → Mulan: o Sr. Incrível não é romântico
--   CZR Rocky Balboa    → Maverick (Top Gun): R fraco no Rocky
--   PZL Jordan Belfort  → Dale Denton (Segurando as Pontas): Belfort é catarse acima de tudo
--   PCR Jay Gatsby      → Tom Creo (Fonte da Vida): Gatsby não é psicodélico
--   PCZ Tony Montana    → Lola (Corra, Lola, Corra): Scarface não é psicodélico no visual
--   XZF Lee Abbott      → Alan Grant (Jurassic Park): Um Lugar Silencioso não é para a família
--   XCF Simba           → Conor O'Malley (Sete Minutos Depois da Meia-Noite): O Rei Leão não é sombrio
--   XAR Will Turner     → Rick O'Connell (A Múmia): Piratas do Caribe não é sombrio
--                         (Ichabod Crane seria o 5º papel do Johnny Depp nas personalidades)
--   MZL Bill Cage       → Agente J (MIB): o humor do Cage é pontual
--                         (Guy, de Free Guy, repetiria o Ryan Reynolds do Deadpool)
--   MXL Tyler Durden    → Marty Mikalski (O Segredo da Cabana): Tyler é catarse acima de tudo
--   MPR Christian       → Stéphane (Sonhando Acordado): M fraco em Moulin Rouge
--   MAR Sonmi-451       → Taki Tachibana (Your Name.): Sonmi era pouco conhecida
--
-- Com as trocas, saem também 3 repetições: Ewan McGregor (Renton e Christian),
-- Brad Pitt (Tyler e John Smith) e Tom Cruise (Cage e Maverick), e a franquia
-- Piratas do Caribe deixa de aparecer duas vezes (Jack Sparrow e Will Turner).

update public.cine_personas as c set
  title_pt = v.title_pt, title_en = v.title_en,
  character_pt = v.character_pt, character_en = v.character_en,
  film_title_pt = v.film_title_pt, film_title_en = v.film_title_en,
  film_year = v.film_year, tmdb_id = v.tmdb_id, poster_path = v.poster_path,
  blurb_pt = v.blurb_pt, blurb_en = v.blurb_en
from (values
  ('ZRL', 'Marido Infiltrado', 'Undercover Husband', 'John Smith', 'John Smith',
   'Sr. & Sra. Smith', 'Mr. & Mrs. Smith', 2005, 787, '/kjD700RtyhveN3ZbOnSvUSne0Qj.jpg',
   'Matador de aluguel que descobre que a esposa trabalha para o lado rival, e que o casamento é a missão mais perigosa.',
   'A hitman who finds out his wife works for the rival side, and that marriage is the most dangerous mission.'),
  ('ZRF', 'Guerreira da Família', 'Warrior for Her Family', 'Mulan', 'Mulan',
   'Mulan', 'Mulan', 1998, 10674, '/jAbexAtB0aSfP5Ay4TpWHARyVnG.jpg',
   'Filha que se disfarça de soldado para poupar o pai, salva a China e conquista o capitão.',
   'A daughter who disguises herself as a soldier to spare her father, saves China and wins over her captain.'),
  ('CZR', 'Ás Indomável', 'Untamed Ace', 'Maverick', 'Maverick',
   'Top Gun - Ases Indomáveis', 'Top Gun', 1986, 744, '/xUuHj3CgmZQ9P2cMaqQs4J0d4Zc.jpg',
   'Piloto de caça que voa no limite, se apaixona pela instrutora e precisa superar a perda do melhor amigo.',
   'A fighter pilot who flies at the edge, falls for his instructor and must get past losing his best friend.'),
  ('PZL', 'Maconheiro em Fuga', 'Stoner on the Run', 'Dale Denton', 'Dale Denton',
   'Segurando as Pontas', 'Pineapple Express', 2008, 10189, '/6E50WjeOYjDZg9HXgPjYdGtY2jG.jpg',
   'Oficial de justiça maconheiro que testemunha um assassinato e passa o resto do dia fugindo ao lado do seu traficante.',
   'A stoner process server who witnesses a murder and spends the rest of the day on the run with his dealer.'),
  ('PCR', 'Peregrino da Eternidade', 'Pilgrim of Eternity', 'Tom Creo', 'Tom Creo',
   'Fonte da Vida', 'The Fountain', 2006, 1381, '/4XTf8GuCVLWolubANaKkpk62YPq.jpg',
   'Cientista que corre contra a morte da esposa numa busca que atravessa mil anos, da Espanha dos conquistadores a uma nebulosa.',
   'A scientist racing against his wife''s death in a quest that spans a thousand years, from conquistador Spain to a dying nebula.'),
  ('PCZ', 'Corredora dos Destinos', 'Runner of Fates', 'Lola', 'Lola',
   'Corra, Lola, Corra', 'Run Lola Run', 1998, 104, '/v0giIi4bTILVhNhJajet3WWY3FA.jpg',
   'Tem 20 minutos para conseguir 100 mil marcos e salvar o namorado, e três chances de refazer a corrida.',
   'She has 20 minutes to find 100,000 marks and save her boyfriend, and three tries to run it again.'),
  ('XZF', 'Guardião Relutante', 'Reluctant Guardian', 'Alan Grant', 'Alan Grant',
   'Jurassic Park: O Parque dos Dinossauros', 'Jurassic Park', 1993, 329, '/bRKmwU9eXZI5dKT11Zx1KsayiLW.jpg',
   'Paleontólogo que não suporta crianças e precisa guiar duas delas por um parque cheio de dinossauros soltos.',
   'A paleontologist who can''t stand kids and has to lead two of them through a park full of loose dinosaurs.'),
  ('XCF', 'Filho da Meia-Noite', 'Child of Midnight', 'Conor O''Malley', 'Conor O''Malley',
   'Sete Minutos Depois da Meia-Noite', 'A Monster Calls', 2016, 258230, '/vNzWJwVqjszWwXrA7ZfsrJmhgV9.jpg',
   'Garoto que recebe a visita de um monstro-árvore enquanto a mãe adoece, e aprende a encarar a própria verdade.',
   'A boy visited by a tree monster while his mother falls ill, who learns to face his own truth.'),
  ('XAR', 'Aventureiro das Tumbas', 'Tomb Adventurer', 'Rick O''Connell', 'Rick O''Connell',
   'A Múmia', 'The Mummy', 1999, 564, '/yhIsVvcUm7QxzLfT6HW2wLf5ajY.jpg',
   'Legionário que guia uma bibliotecária até uma cidade perdida no Egito e, sem querer, desperta uma múmia amaldiçoada.',
   'A legionnaire who guides a librarian to a lost city in Egypt and accidentally awakens a cursed mummy.'),
  ('MZL', 'Novato das Galáxias', 'Rookie of the Galaxy', 'Agente J', 'Agent J',
   'MIB: Homens de Preto', 'Men in Black', 1997, 607, '/uLOmOF5IzWoyrgIF5MfUnh5pa1X.jpg',
   'Policial de Nova York recrutado por uma agência secreta que vigia os alienígenas escondidos entre nós.',
   'A New York cop recruited by a secret agency that polices the aliens hiding among us.'),
  ('MXL', 'Vidente da Cabana', 'Seer of the Cabin', 'Marty Mikalski', 'Marty Mikalski',
   'O Segredo da Cabana', 'The Cabin in the Woods', 2012, 22970, '/zZZe5wn0udlhMtdlDjN4NB72R6e.jpg',
   'O maconheiro da turma, o único que percebe que a cabana no meio do mato é um grande espetáculo armado.',
   'The group''s stoner, the only one who realizes the cabin in the woods is one big staged show.'),
  ('MPR', 'Artesão do Sono', 'Craftsman of Sleep', 'Stéphane', 'Stéphane',
   'Sonhando Acordado', 'The Science of Sleep', 2006, 300, '/8bummqwU6MV65ZJvNtKx8Y3NIEk.jpg',
   'Ilustrador tímido que confunde sonho e realidade enquanto tenta conquistar a vizinha.',
   'A shy illustrator who mixes up dreams and reality while trying to win over the girl next door.'),
  ('MAR', 'Alma Trocada', 'Swapped Soul', 'Taki Tachibana', 'Taki Tachibana',
   'Your Name.', 'Your Name.', 2016, 372058, '/vfJFJPepRKapMd5G2ro7klIRysq.jpg',
   'Estudante de Tóquio que acorda no corpo de uma garota do interior e atravessa o tempo para encontrá-la.',
   'A Tokyo student who wakes up in a country girl''s body and crosses time to find her.')
) as v(code, title_pt, title_en, character_pt, character_en, film_title_pt, film_title_en, film_year, tmdb_id, poster_path, blurb_pt, blurb_en)
where c.code = v.code;
