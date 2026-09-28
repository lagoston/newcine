-- =====================================================================
-- Novo sistema de personalidades (28/09/2026)
-- As 3 prateleiras (humores) que a pessoa mais usa formam um código de 3
-- letras — 84 combinações, cada uma com um personagem de cinema. Cada
-- filme avaliado que está numa prateleira soma a própria nota nela. A
-- personalidade aparece a partir de 10 filmes das prateleiras avaliados
-- (e em pelo menos 3 humores diferentes) e muda sozinha a cada avaliação.
-- Aposenta o sistema antigo (espectrograma E/I/C/S/R por gênero +
-- questionário de subcategoria): os gatilhos antigos são desligados, as
-- colunas e funções antigas ficam no banco (nada é apagado).
-- A coluna profiles.personalidade_completa passa a guardar o código novo
-- (ex.: MPC) — as funções predict-* continuam usando ela como "tem
-- personalidade?".
-- =====================================================================

-- 1. Os 9 humores e suas letras ------------------------------------------
create table if not exists public.cine_moods (
  mood_key text primary key,
  letter text not null unique check (letter ~ '^[A-Z]$'),
  sort_order smallint not null unique,
  name_pt text not null,
  name_en text not null
);
alter table public.cine_moods enable row level security;
drop policy if exists "cine_moods_select" on public.cine_moods;
create policy "cine_moods_select" on public.cine_moods for select to anon, authenticated using (true);

insert into public.cine_moods (mood_key, letter, sort_order, name_pt, name_en) values
  ('mind-blowing',   'M', 1, 'Mind-Blowing',         'Mind-Blowing'),
  ('dark-and-scary', 'D', 2, 'Sombrio e Assustador', 'Dark & Scary'),
  ('drug-trip',      'P', 3, 'Psychedelic',          'Psychedelic'),
  ('adventures',     'A', 4, 'Aventuras',            'Adventures'),
  ('catharsis',      'C', 5, 'Catarse',              'Catharsis'),
  ('adrenaline',     'X', 6, 'Adrenalina',           'Adrenaline'),
  ('romantic',       'R', 7, 'Romântico',            'Romantic'),
  ('family-time',    'F', 8, 'Família',              'Family Time'),
  ('laugh-out-loud', 'L', 9, 'Muitas Risadas',       'Laugh Out Loud')
on conflict (mood_key) do update set
  letter = excluded.letter, sort_order = excluded.sort_order,
  name_pt = excluded.name_pt, name_en = excluded.name_en;

-- 2. As 84 personalidades ------------------------------------------------
create table if not exists public.cine_personas (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  sort_order smallint not null unique,
  mood_keys text[] not null,
  title_pt text not null,
  title_en text not null,
  character_pt text not null,
  character_en text not null,
  film_title_pt text,
  film_title_en text,
  film_year smallint,
  tmdb_id integer,
  poster_path text,
  blurb_pt text not null,
  blurb_en text not null
);
alter table public.cine_personas enable row level security;
drop policy if exists "cine_personas_select" on public.cine_personas;
create policy "cine_personas_select" on public.cine_personas for select to anon, authenticated using (true);

insert into public.cine_personas
  (code, sort_order, mood_keys, title_pt, title_en, character_pt, character_en, film_title_pt, film_title_en, film_year, tmdb_id, poster_path, blurb_pt, blurb_en)
values
('MDP',1,array['mind-blowing','dark-and-scary','drug-trip']::text[],'Profeta do Abismo','Prophet of the Abyss','Donnie Darko','Donnie Darko',null,null,null,141,'/fhQoQfejY1hUcwyuLgpBrYs6uFt.jpg','Adolescente sonâmbulo guiado por um coelho sinistro que anuncia o fim do mundo em 28 dias.','A sleepwalking teenager guided by a sinister rabbit who announces the end of the world in 28 days.'),
('MDA',2,array['mind-blowing','dark-and-scary','adventures']::text[],'Navegador do Desconhecido','Navigator of the Unknown','Dave Bowman','Dave Bowman',null,null,null,62,'/ve72VxNqjGM69Uky4WTo2bK6rfq.jpg','Astronauta que enfrenta um computador rebelde e atravessa o infinito rumo ao próximo passo da humanidade.','An astronaut who faces a rogue computer and crosses the infinite toward humanity''s next step.'),
('MDC',3,array['mind-blowing','dark-and-scary','catharsis']::text[],'Investigador da Própria Ruína','Investigator of His Own Ruin','Teddy Daniels','Teddy Daniels',null,null,null,11324,'/nrmXQ0zcZUL8jFLrakWc90IR8z9.jpg','Agente federal que investiga um sumiço numa ilha-hospício e descobre que o mistério mora dentro dele.','A federal marshal investigating a disappearance on an asylum island who finds the mystery lives inside him.'),
('MDX',4,array['mind-blowing','dark-and-scary','adrenaline']::text[],'Arquivista da Vingança','Archivist of Revenge','Leonard Shelby','Leonard Shelby',null,null,null,77,'/fKTPH2WvH8nHTXeBYBVhawtRqtR.jpg','Homem sem memória recente que caça o assassino da esposa com tatuagens, fotos e anotações.','A man with no short-term memory hunting his wife''s killer through tattoos, photos and notes.'),
('MDR',5,array['mind-blowing','dark-and-scary','romantic']::text[],'Amante da Obsessão','Lover of Obsession','Scottie Ferguson','Scottie Ferguson',null,null,null,426,'/15uOEfqBNTVtDUT7hGBVCka0rZz.jpg','Detetive com medo de altura que se apaixona por uma mulher misteriosa até a obsessão.','A detective afraid of heights who falls for a mysterious woman to the point of obsession.'),
('MDF',6,array['mind-blowing','dark-and-scary','family-time']::text[],'Exploradora do Outro Lado','Explorer of the Other Side','Coraline','Coraline',null,null,null,14836,'/4jeFXQYytChdZYE9JYO7Un87IlW.jpg','Menina curiosa que encontra uma porta para uma versão perfeita — e perigosa — da própria casa.','A curious girl who finds a door to a perfect — and dangerous — version of her own home.'),
('MDL',7,array['mind-blowing','dark-and-scary','laugh-out-loud']::text[],'Anarquista Sarcástico','Sarcastic Anarchist','Tyler Durden','Tyler Durden',null,null,null,550,'/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg','Vendedor de sabão carismático que transforma o tédio da vida moderna em clube de luta e caos.','A charismatic soap salesman who turns the boredom of modern life into a fight club and chaos.'),
('MPA',8,array['mind-blowing','drug-trip','adventures']::text[],'Feiticeiro do Multiverso','Sorcerer of the Multiverse','Doutor Estranho','Doctor Strange','Doutor Estranho','Doctor Strange',2016,284052,'/uGBVj3bEbCoZbDjjl9wTxcygko1.jpg','Cirurgião arrogante que troca o bisturi pelas artes místicas e passa a dobrar a realidade.','An arrogant surgeon who trades the scalpel for the mystic arts and starts bending reality.'),
('MPC',9,array['mind-blowing','drug-trip','catharsis']::text[],'Viajante do Além','Traveler of the Beyond','Oscar (Enter the Void)','Oscar (Enter the Void)',null,null,null,34647,'/krKnsfvSJM1PL40tLicRhVQ6kuG.jpg','Jovem em Tóquio cuja consciência flutua sobre a cidade depois da morte, revendo a própria vida.','A young man in Tokyo whose consciousness drifts over the city after death, reliving his own life.'),
('MPX',10,array['mind-blowing','drug-trip','adrenaline']::text[],'Mente Acelerada','Accelerated Mind','Lucy','Lucy',null,null,null,240832,'/kRbpUTRNm6QbLQFPFWUcNC4czEm.jpg','Mulher comum que, depois de uma droga experimental, passa a usar 100% do cérebro.','An ordinary woman who, after an experimental drug, starts using 100% of her brain.'),
('MPR',11,array['mind-blowing','drug-trip','romantic']::text[],'Poeta Lisérgico','Lysergic Poet','Christian (Moulin Rouge!)','Christian (Moulin Rouge!)',null,null,null,824,'/2kjM5CUZRIU5yOANUowrbJcRL9L.jpg','Escritor boêmio que se apaixona pela estrela do cabaré mais delirante de Paris.','A bohemian writer who falls for the star of the most delirious cabaret in Paris.'),
('MPF',12,array['mind-blowing','drug-trip','family-time']::text[],'Mago do Doce Delírio','Wizard of Sweet Delirium','Willy Wonka','Willy Wonka',null,null,null,252,'/vmpsZkrs4Uvkp9r1atL8B3frA63.jpg','Chocolateiro excêntrico que abre sua fábrica de maravilhas — e armadilhas — para cinco crianças.','An eccentric chocolatier who opens his factory of wonders — and traps — to five children.'),
('MPL',13,array['mind-blowing','drug-trip','laugh-out-loud']::text[],'Lavadeira dos Universos','Laundress of Universes','Evelyn Wang','Evelyn Wang',null,null,null,545611,'/u68AjlvlutfEIcpmbYpKcdi09ut.jpg','Dona de lavanderia afogada em impostos que descobre versões de si mesma em infinitos universos.','A laundromat owner drowning in taxes who discovers versions of herself across infinite universes.'),
('MAC',14,array['mind-blowing','adventures','catharsis']::text[],'Astronauta do Amor','Astronaut of Love','Cooper','Cooper',null,null,null,157336,'/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg','Ex-piloto que deixa os filhos para trás numa missão além das estrelas para salvar a humanidade.','A former pilot who leaves his children behind on a mission beyond the stars to save humanity.'),
('MAX',15,array['mind-blowing','adventures','adrenaline']::text[],'Escolhido do Código','Chosen One of the Code','Neo','Neo',null,null,null,603,'/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg','Hacker que descobre que o mundo é uma simulação — e que talvez seja o único capaz de libertá-lo.','A hacker who learns the world is a simulation — and that he may be the only one able to free it.'),
('MAR',16,array['mind-blowing','adventures','romantic']::text[],'Viajante das Vidas','Traveler of Lives','Sonmi-451','Sonmi-451',null,null,null,83542,'/8naVv2Xu3rWI5JKHz0vCujx6GaJ.jpg','Clone de uma Seul futurista cujo despertar ecoa através de séculos de histórias entrelaçadas.','A clone in a futuristic Seoul whose awakening echoes across centuries of intertwined stories.'),
('MAF',17,array['mind-blowing','adventures','family-time']::text[],'Cronauta de Família','Family Time Traveler','Marty McFly','Marty McFly',null,null,null,105,'/vN5B5WgYscRGcQpVhHl6p9DDTP0.jpg','Adolescente que volta a 1955 num DeLorean e precisa garantir que os próprios pais se apaixonem.','A teenager sent back to 1955 in a DeLorean who must make sure his own parents fall in love.'),
('MAL',18,array['mind-blowing','adventures','laugh-out-loud']::text[],'Náufrago Cósmico','Cosmic Castaway','Arthur Dent','Arthur Dent','O Guia do Mochileiro das Galáxias','The Hitchhiker''s Guide to the Galaxy',2005,7453,'/4fOFbNMjq708CQ7ou71by6rI6wZ.jpg','Inglês comum que perde a Terra numa quinta-feira e sai pela galáxia de roupão e toalha.','An ordinary Englishman who loses Earth on a Thursday and roams the galaxy in a bathrobe, towel in hand.'),
('MCX',19,array['mind-blowing','catharsis','adrenaline']::text[],'Arquiteto de Sonhos','Architect of Dreams','Dom Cobb','Dom Cobb',null,null,null,27205,'/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg','Ladrão que invade sonhos alheios e aceita um último trabalho: plantar uma ideia.','A thief who breaks into other people''s dreams and takes one last job: planting an idea.'),
('MCR',20,array['mind-blowing','catharsis','romantic']::text[],'Apagador de Memórias','Memory Eraser','Joel Barish','Joel Barish',null,null,null,38,'/5MwkWH9tYHv3mV9OdYTMR5qreIz.jpg','Homem tímido que decide apagar a ex da memória e tenta salvá-la no meio do processo.','A shy man who decides to erase his ex from his memory and tries to save her halfway through.'),
('MCF',21,array['mind-blowing','catharsis','family-time']::text[],'Coração Cerebral','Heart in the Head','Riley Andersen','Riley Andersen',null,null,null,150540,'/2H1TmgdfNtsKlU9jKdeNyYL5y8T.jpg','Menina de 11 anos cuja mudança de cidade vira uma crise dentro da cabeça, onde as emoções comandam.','An 11-year-old whose move to a new city becomes a crisis inside her head, where the emotions run the show.'),
('MCL',22,array['mind-blowing','catharsis','laugh-out-loud']::text[],'Personagem de Si Mesmo','Character of Himself','Harold Crick','Harold Crick','Mais Estranho que a Ficção','Stranger Than Fiction',2006,1262,'/nCzcepubwShvZ4vbCsygQNgF2Z1.jpg','Auditor metódico que começa a ouvir uma narradora contando sua vida — e anunciando sua morte.','A methodical auditor who starts hearing a narrator telling his life — and announcing his death.'),
('MXR',23,array['mind-blowing','adrenaline','romantic']::text[],'Rebelde do Destino','Rebel of Fate','David Norris','David Norris','Os Agentes do Destino','The Adjustment Bureau',2011,38050,'/5ZzeR8iz1nEFLp94OBnbakLZawo.jpg','Político que desafia os agentes misteriosos que controlam o destino para ficar com a mulher que ama.','A politician who defies the mysterious agents controlling fate to be with the woman he loves.'),
('MXF',24,array['mind-blowing','adrenaline','family-time']::text[],'Herói Multiversal','Multiversal Hero','Miles Morales','Miles Morales',null,null,null,324857,'/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg','Adolescente do Brooklyn que ganha poderes de aranha e se junta a heróis de outras dimensões.','A Brooklyn teen who gets spider powers and teams up with heroes from other dimensions.'),
('MXL',25,array['mind-blowing','adrenaline','laugh-out-loud']::text[],'Soldado do Loop','Soldier of the Loop','Bill Cage','Bill Cage',null,null,null,137113,'/nBM9MMa2WCwvMG4IJ3eiGUdbPe6.jpg','Oficial covarde preso num dia que recomeça a cada morte, numa guerra contra alienígenas.','A cowardly officer trapped in a day that resets every time he dies in a war against aliens.'),
('MRF',26,array['mind-blowing','romantic','family-time']::text[],'Viajante Caseiro','Homebody Time Traveler','Tim Lake','Tim Lake',null,null,null,122906,'/ls6zswrOZVhCXQBh96DlbnLBajM.jpg','Jovem que herda o dom de voltar no tempo e o usa para o amor e para a família.','A young man who inherits the gift of time travel and uses it for love and family.'),
('MRL',27,array['mind-blowing','romantic','laugh-out-loud']::text[],'Preso no Amanhecer','Stuck at Dawn','Phil Connors','Phil Connors',null,null,null,137,'/gCgt1WARPZaXnq523ySQEUKinCs.jpg','Meteorologista ranzinza condenado a reviver o mesmo 2 de fevereiro até aprender a viver.','A grumpy weatherman doomed to relive the same February 2nd until he learns how to live.'),
('MFL',28,array['mind-blowing','family-time','laugh-out-loud']::text[],'Construtor de Realidades','Builder of Realities','Emmet Brickowski','Emmet Brickowski',null,null,null,137106,'/lbctonEnewCYZ4FYoTZhs8cidAl.jpg','Operário de Lego comum confundido com o Escolhido que vai salvar o universo das peças.','An ordinary Lego builder mistaken for the Special One who will save the brick universe.'),
('DPA',29,array['dark-and-scary','drug-trip','adventures']::text[],'Descida ao Coração das Trevas','Descent into the Heart of Darkness','Capitão Willard','Captain Willard',null,null,null,28,'/gQB8Y5RCMkv2zwzFHbUJX3kAhvA.jpg','Oficial enviado rio acima na selva do Vietnã para eliminar um coronel que enlouqueceu.','An officer sent upriver into the Vietnam jungle to terminate a colonel who has gone insane.'),
('DPC',30,array['dark-and-scary','drug-trip','catharsis']::text[],'Bailarina do Espelho','Ballerina in the Mirror','Nina Sayers','Nina Sayers',null,null,null,44214,'/viWheBd44bouiLCHgNMvahLThqx.jpg','Bailarina perfeccionista que se perde entre o Cisne Branco e o Cisne Negro.','A perfectionist ballerina who loses herself between the White Swan and the Black Swan.'),
('DPX',31,array['dark-and-scary','drug-trip','adrenaline']::text[],'Vingador Lisérgico','Lysergic Avenger','Red Miller (Mandy)','Red Miller (Mandy)',null,null,null,460885,'/m0yf7J7HsKeK6E81SMRcX8vx6mH.jpg','Lenhador pacato que parte numa vingança alucinada contra a seita que destruiu sua vida.','A quiet lumberjack who sets off on a hallucinatory revenge against the cult that destroyed his life.'),
('DPR',32,array['dark-and-scary','drug-trip','romantic']::text[],'Amante Imortal','Immortal Lover','Drácula','Dracula','Drácula de Bram Stoker','Bram Stoker''s Dracula',1992,6114,'/jSxCIZXudp5q8wQO8VERGX8hRAl.jpg','Conde amaldiçoado que atravessa séculos e oceanos atrás do amor que perdeu.','A cursed count who crosses centuries and oceans in search of the love he lost.'),
('DPF',33,array['dark-and-scary','drug-trip','family-time']::text[],'Menina do Coelho Branco','Girl of the White Rabbit','Alice (Tim Burton)','Alice (Tim Burton)','Alice no País das Maravilhas','Alice in Wonderland',2010,12155,'/o0kre9wRCZz3jjSjaru7QU0UtFz.jpg','Jovem que cai de novo na toca do coelho e volta a um País das Maravilhas sombrio e delirante.','A young woman who falls down the rabbit hole again into a dark, delirious Wonderland.'),
('DPL',34,array['dark-and-scary','drug-trip','laugh-out-loud']::text[],'Jornalista do Caos','Journalist of Chaos','Raoul Duke','Raoul Duke',null,null,null,1878,'/tisNLcMkxryU2zxhi0PiyDFqhm0.jpg','Jornalista que cruza o deserto até Las Vegas numa viagem de alucinações e paranoia.','A journalist crossing the desert to Las Vegas on a trip of hallucinations and paranoia.'),
('DAC',35,array['dark-and-scary','adventures','catharsis']::text[],'Guardiã do Labirinto','Guardian of the Labyrinth','Ofelia','Ofelia',null,null,null,1417,'/z7xXihu5wHuSMWymq5VAulPVuvg.jpg','Menina na Espanha do pós-guerra que foge da crueldade real para as provas de um fauno.','A girl in post-war Spain who escapes real-world cruelty into a faun''s trials.'),
('DAX',36,array['dark-and-scary','adventures','adrenaline']::text[],'Sobrevivente do Espaço','Space Survivor','Ellen Ripley','Ellen Ripley',null,null,null,348,'/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg','Oficial de uma nave cargueira que enfrenta sozinha a criatura mais letal do espaço.','A cargo ship officer who faces the deadliest creature in space on her own.'),
('DAR',37,array['dark-and-scary','adventures','romantic']::text[],'Pirata Amaldiçoado','Cursed Pirate','Will Turner','Will Turner',null,null,null,22,'/poHwCZeWzJCShH7tOjg8RIoyjcw.jpg','Ferreiro que vira pirata para resgatar a mulher que ama de uma tripulação amaldiçoada.','A blacksmith who turns pirate to rescue the woman he loves from a cursed crew.'),
('DAF',38,array['dark-and-scary','adventures','family-time']::text[],'Bruxo Órfão','Orphan Wizard','Harry Potter','Harry Potter',null,null,null,671,'/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg','Órfão que descobre ser bruxo e encontra em Hogwarts amigos, magia e um inimigo antigo.','An orphan who discovers he is a wizard and finds friends, magic and an old enemy at Hogwarts.'),
('DAL',39,array['dark-and-scary','adventures','laugh-out-loud']::text[],'Caçador de Deadites','Deadite Hunter','Ash Williams','Ash Williams',null,null,null,765,'/4zqCKJVHUolGs6C5AZwAZqLWixW.jpg','Balconista com uma motosserra no lugar da mão que enfrenta demônios numa cabana no meio do mato.','A store clerk with a chainsaw for a hand fighting demons in a cabin in the woods.'),
('DCX',40,array['dark-and-scary','catharsis','adrenaline']::text[],'Cavaleiro das Trevas','Dark Knight','Batman','Batman',null,null,null,155,'/qJ2tW6WMUDux911r6m7haRef0WH.jpg','Vigilante mascarado de Gotham levado ao limite pelo caos do Coringa.','Gotham''s masked vigilante pushed to the limit by the Joker''s chaos.'),
('DCR',41,array['dark-and-scary','catharsis','romantic']::text[],'Coração de Tesoura','Scissor Heart','Edward Mãos de Tesoura','Edward Scissorhands',null,null,null,162,'/e0FqKFvGPdQNWG8tF9cZBtev9Em.jpg','Criação inacabada com tesouras no lugar das mãos que tenta caber num subúrbio colorido.','An unfinished creation with scissors for hands trying to fit into a pastel suburb.'),
('DCF',42,array['dark-and-scary','catharsis','family-time']::text[],'Rei Enlutado','Grieving King','Simba','Simba',null,null,null,8587,'/sKCr78MXSLixwmZ8DyJLrpMsd15.jpg','Filhote que foge depois da morte do pai e precisa voltar para ocupar seu lugar.','A cub who runs away after his father''s death and must come back to take his place.'),
('DCL',43,array['dark-and-scary','catharsis','laugh-out-loud']::text[],'Menino da Guerra','War Boy','Jojo Betzler','Jojo Betzler',null,null,null,515001,'/1mqL7VG4Ix8wmxwypmCA1HTHBky.jpg','Garoto da Juventude Hitlerista com um amigo imaginário ridículo — até descobrir quem a mãe esconde em casa.','A Hitler Youth boy with a ridiculous imaginary friend — until he finds out who his mother is hiding at home.'),
('DXR',44,array['dark-and-scary','adrenaline','romantic']::text[],'Noiva Vingativa','Vengeful Bride','A Noiva (Beatrix Kiddo)','The Bride (Beatrix Kiddo)',null,null,null,24,'/v7TaX8kXMXs5yFFGR41guUDNcnB.jpg','Ex-assassina que acorda do coma e risca, um a um, os nomes da sua lista de vingança.','A former assassin who wakes from a coma and crosses off, one by one, the names on her revenge list.'),
('DXF',45,array['dark-and-scary','adrenaline','family-time']::text[],'Pai do Silêncio','Father of Silence','Lee Abbott','Lee Abbott',null,null,null,447332,'/nAU74GmpUk7t5iklEp3bufwDq4n.jpg','Pai que protege a família em silêncio absoluto num mundo caçado por criaturas cegas.','A father protecting his family in absolute silence in a world hunted by blind creatures.'),
('DXL',46,array['dark-and-scary','adrenaline','laugh-out-loud']::text[],'Mercenário Tagarela','Merc with a Mouth','Deadpool','Deadpool',null,null,null,293660,'/3E53WEZJqP6aM84D8CckXx4pIHw.jpg','Mercenário imortal e desbocado que quebra a quarta parede enquanto busca vingança.','An immortal, foul-mouthed mercenary who breaks the fourth wall while seeking revenge.'),
('DRF',47,array['dark-and-scary','romantic','family-time']::text[],'Rei do Halloween','Pumpkin King','Jack Skellington','Jack Skellington',null,null,null,9479,'/oQffRNjK8e19rF7xVYEN8ew0j7b.jpg','Rei da Cidade do Halloween que se encanta pelo Natal e decide tomá-lo para si.','The king of Halloween Town who falls for Christmas and decides to take it over.'),
('DRL',48,array['dark-and-scary','romantic','laugh-out-loud']::text[],'Herói Improvável','Unlikely Hero','Shaun','Shaun',null,null,null,747,'/dgXPhzNJH8HFTBjXPB177yNx6RI.jpg','Vendedor sem rumo que precisa salvar a mãe e a ex no meio de um apocalipse zumbi.','An aimless salesman who has to save his mum and his ex in the middle of a zombie apocalypse.'),
('DFL',49,array['dark-and-scary','family-time','laugh-out-loud']::text[],'Patriarca Macabro','Macabre Patriarch','Gomez Addams','Gomez Addams',null,null,null,2907,'/qFf8anju5f2epI0my8RdwwIXFIP.jpg','Chefe apaixonado e excêntrico da família mais sombria — e mais unida — do cinema.','The passionate, eccentric head of cinema''s darkest — and most loving — family.'),
('PAC',50,array['drug-trip','adventures','catharsis']::text[],'Náufrago Místico','Mystic Castaway','Pi Patel','Pi Patel',null,null,null,87827,'/iLgRu4hhSr6V1uManX6ukDriiSc.jpg','Jovem indiano que sobrevive a um naufrágio num bote dividido com um tigre-de-bengala.','An Indian boy who survives a shipwreck on a lifeboat shared with a Bengal tiger.'),
('PAX',51,array['drug-trip','adventures','adrenaline']::text[],'Rainha da Estrada','Queen of the Road','Furiosa','Furiosa',null,null,null,76341,'/ulcAi4dKpAjHwYGS08vNyx9H6I9.jpg','Guerreira que rouba um caminhão de guerra para libertar mulheres escravizadas no deserto.','A warrior who steals a war rig to free enslaved women across the desert.'),
('PAR',52,array['drug-trip','adventures','romantic']::text[],'Poeta da Estrada','Poet of the Road','Jude (Across the Universe)','Jude (Across the Universe)',null,null,null,4688,'/447c8Te3DXC46rQvDEixKGO4dS6.jpg','Jovem de Liverpool que vive um amor nos Estados Unidos dos anos 60 ao som dos Beatles.','A young man from Liverpool living a love story in 1960s America to the sound of the Beatles.'),
('PAF',53,array['drug-trip','adventures','family-time']::text[],'Viajante de Oz','Traveler of Oz','Dorothy','Dorothy',null,null,null,630,'/uCC3j4pV9eOZwzDUWp2ilbcTf1f.jpg','Menina do Kansas levada por um tornado para uma terra mágica, em busca do caminho de casa.','A Kansas girl swept by a tornado into a magical land, searching for the way home.'),
('PAL',54,array['drug-trip','adventures','laugh-out-loud']::text[],'Pirata Embriagado','Tipsy Pirate','Jack Sparrow','Jack Sparrow',null,null,null,285,'/jGWpG4YhpQwVmjyHEGkxEkeRf0S.jpg','Pirata imprevisível e cambaleante que sempre escapa com um plano que ninguém entende.','An unpredictable, swaying pirate who always escapes with a plan nobody understands.'),
('PCX',55,array['drug-trip','catharsis','adrenaline']::text[],'Rei da Ascensão','King of the Rise','Tony Montana','Tony Montana',null,null,null,111,'/iQ5ztdjvteGeboxtmRdXEChJOHh.jpg','Imigrante cubano que sobe ao topo do tráfico de Miami — e despenca na mesma velocidade.','A Cuban immigrant who climbs to the top of Miami''s drug trade — and falls just as fast.'),
('PCR',56,array['drug-trip','catharsis','romantic']::text[],'Sonhador das Festas','Dreamer of the Parties','Jay Gatsby','Jay Gatsby',null,null,null,64682,'/nimh1rrDDLhgpG8XAYoUZXHYwb6.jpg','Milionário misterioso que dá festas extravagantes na esperança de reconquistar um amor do passado.','A mysterious millionaire who throws lavish parties hoping to win back a love from his past.'),
('PCF',57,array['drug-trip','catharsis','family-time']::text[],'Elefante Voador','Flying Elephant','Dumbo','Dumbo',null,null,null,11360,'/hKDdllslMtsU9JixAv5HR9biXlp.jpg','Filhote de elefante zombado pelas orelhas enormes que descobre que elas o fazem voar.','A baby elephant mocked for his huge ears who discovers they let him fly.'),
('PCL',58,array['drug-trip','catharsis','laugh-out-loud']::text[],'Escolha a Vida','Choose Life','Mark Renton','Mark Renton',null,null,null,627,'/1jUC02qsqS2NxBMFarbIhcQtazV.jpg','Jovem de Edimburgo tentando largar a heroína e os amigos que sempre o puxam de volta.','A young man in Edinburgh trying to quit heroin and the friends who keep dragging him back.'),
('PXR',59,array['drug-trip','adrenaline','romantic']::text[],'Romântico Fugitivo','Runaway Romantic','Clarence Worley','Clarence Worley',null,null,null,319,'/39lXk6ud6KiJgGbbWI2PUKS7y2.jpg','Balconista fã de kung fu que foge com o amor da sua vida e uma mala de cocaína.','A kung fu–loving store clerk on the run with the love of his life and a suitcase of cocaine.'),
('PXF',60,array['drug-trip','adrenaline','family-time']::text[],'Piloto Colorido','Technicolor Racer','Speed Racer','Speed Racer',null,null,null,7459,'/fxRIpx9Op9h71q3tvuabx4GryyP.jpg','Piloto prodígio que enfrenta um campeonato corrupto em pistas que parecem videogame.','A prodigy driver who takes on a corrupt championship on tracks that look like a video game.'),
('PXL',61,array['drug-trip','adrenaline','laugh-out-loud']::text[],'Lobo Eufórico','Euphoric Wolf','Jordan Belfort','Jordan Belfort',null,null,null,106646,'/kW9LmvYHAaS9iA0tHmZVq8hQYoq.jpg','Corretor que enriquece com fraudes e vive uma farra sem limites em Wall Street.','A stockbroker who gets rich on fraud and lives a limitless binge on Wall Street.'),
('PRF',62,array['drug-trip','romantic','family-time']::text[],'Princesa Encantada','Enchanted Princess','Giselle (Encantada)','Giselle (Enchanted)',null,null,null,4523,'/8KCNzCArLlvLdQoHx6npua2VSVc.jpg','Princesa de desenho animado jogada na Nova York de verdade, ainda cantando para os bichos.','A cartoon princess thrown into real-life New York, still singing to the animals.'),
('PRL',63,array['drug-trip','romantic','laugh-out-loud']::text[],'Namorado de Fases','Level-Up Boyfriend','Scott Pilgrim','Scott Pilgrim',null,null,null,22538,'/g5IoYeudx9XBEfwNL0fHvSckLBz.jpg','Baixista preguiçoso que precisa derrotar os sete ex-namorados do mal da garota que ama.','A slacker bassist who must defeat the seven evil exes of the girl he loves.'),
('PFL',64,array['drug-trip','family-time','laugh-out-loud']::text[],'Camaleão Errante','Wandering Chameleon','Rango','Rango',null,null,null,44896,'/A5MP1guV8pbruieG0tnpPIbaJtt.jpg','Camaleão de estimação perdido no deserto que se inventa xerife de uma cidade sem água.','A pet chameleon lost in the desert who reinvents himself as sheriff of a town without water.'),
('ACX',65,array['adventures','catharsis','adrenaline']::text[],'General Vingador','Avenging General','Maximus','Maximus',null,null,null,98,'/wN2xWp1eIwCKOD0BHTcErTBv1Uq.jpg','General romano traído que vira gladiador para vingar a família diante do imperador.','A betrayed Roman general who becomes a gladiator to avenge his family before the emperor.'),
('ACR',66,array['adventures','catharsis','romantic']::text[],'Sonhador do Convés','Dreamer on Deck','Jack Dawson','Jack Dawson',null,null,null,597,'/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg','Artista sem dinheiro que ganha a passagem no pôquer e um amor no navio que não podia afundar.','A penniless artist who wins his ticket at poker and a love aboard the ship that couldn''t sink.'),
('ACF',67,array['adventures','catharsis','family-time']::text[],'Músico do Além','Musician of the Beyond','Miguel Rivera','Miguel Rivera',null,null,null,354912,'/6Ryitt95xrO8KXuqRGm1fUuNwqF.jpg','Garoto proibido de tocar música que vai parar na Terra dos Mortos no Dia de Finados.','A boy forbidden to play music who ends up in the Land of the Dead on the Day of the Dead.'),
('ACL',68,array['adventures','catharsis','laugh-out-loud']::text[],'Sonhador que Partiu','Dreamer Who Took Off','Walter Mitty','Walter Mitty',null,null,null,116745,'/iAo1hlzsPV9XpYcLQp6Ud065tGO.jpg','Funcionário que vivia de devaneios e larga tudo por uma aventura real ao redor do mundo.','A daydreaming employee who drops everything for a real adventure around the world.'),
('AXR',69,array['adventures','adrenaline','romantic']::text[],'Arqueólogo Aventureiro','Adventurer Archaeologist','Indiana Jones','Indiana Jones',null,null,null,85,'/ceG9VzoRAVGwivFU403Wc3AHRys.jpg','Professor de chapéu e chicote que corre o mundo atrás da Arca da Aliança.','A professor with a hat and a whip racing around the world for the Ark of the Covenant.'),
('AXF',70,array['adventures','adrenaline','family-time']::text[],'Domador de Dragões','Dragon Tamer','Soluço','Hiccup',null,null,null,10191,'/ygGmAO60t8GyqUo9xYeYxSZAR3b.jpg','Jovem viking desajeitado que faz amizade com o dragão que deveria matar.','A clumsy young Viking who befriends the dragon he was supposed to kill.'),
('AXL',71,array['adventures','adrenaline','laugh-out-loud']::text[],'Contrabandista Carismático','Charming Smuggler','Han Solo','Han Solo',null,null,null,11,'/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg','Contrabandista convencido da Millennium Falcon que entra na rebelião quase sem querer.','The cocky smuggler of the Millennium Falcon who joins the rebellion almost by accident.'),
('ARF',72,array['adventures','romantic','family-time']::text[],'Ladrão de Corações','Thief of Hearts','Aladdin','Aladdin',null,null,null,812,'/eLFfl7vS8dkeG1hKp5mwbm37V83.jpg','Ladrãozinho de Agrabah que encontra uma lâmpada mágica e se apaixona pela princesa.','A street thief from Agrabah who finds a magic lamp and falls for the princess.'),
('ARL',73,array['adventures','romantic','laugh-out-loud']::text[],'Pirata Romântico','Romantic Pirate','Westley','Westley',null,null,null,2493,'/2FC9L9MrjBoGHYjYZjdWQdopVYb.jpg','Rapaz da fazenda que volta como o temido Pirata Roberts para resgatar a amada. "Como quiser."','A farm boy who returns as the Dread Pirate Roberts to rescue his true love. "As you wish."'),
('AFL',74,array['adventures','family-time','laugh-out-loud']::text[],'Guerreiro Dragão','Dragon Warrior','Po','Po',null,null,null,9502,'/wWt4JYXTg5Wr3xBW2phBrMKgp3x.jpg','Panda comilão e desajeitado escolhido, contra todas as apostas, como o lendário Guerreiro Dragão.','A clumsy, hungry panda chosen, against all odds, as the legendary Dragon Warrior.'),
('CXR',75,array['catharsis','adrenaline','romantic']::text[],'Lutador do Coração','Fighter of the Heart','Rocky Balboa','Rocky Balboa',null,null,null,1366,'/hEjK9A9BkNXejFW4tfacVAEHtkn.jpg','Boxeador de bairro que ganha uma chance pelo título mundial e só quer aguentar até o fim.','A neighborhood boxer who gets a shot at the world title and just wants to go the distance.'),
('CXF',76,array['catharsis','adrenaline','family-time']::text[],'Aprendiz de Karatê','Karate Apprentice','Daniel LaRusso','Daniel LaRusso',null,null,null,1885,'/1mp4ViklKvA0WXXsNvNx0RBuiit.jpg','Garoto novo na cidade que aprende karatê — e a vida — com o Sr. Miyagi.','The new kid in town who learns karate — and life — from Mr. Miyagi.'),
('CXL',77,array['catharsis','adrenaline','laugh-out-loud']::text[],'Professor do Rock','Rock Teacher','Dewey Finn','Dewey Finn',null,null,null,1584,'/zXLXaepIBvFVLU25DH3wv4IPSbe.jpg','Roqueiro fracassado que se passa por professor e transforma uma turma certinha numa banda.','A washed-up rocker who poses as a teacher and turns a straight-laced class into a band.'),
('CRF',78,array['catharsis','romantic','family-time']::text[],'Escritora da Família','Family Writer','Jo March','Jo March',null,null,null,331482,'/yn5ihODtZ7ofn8pDYfxCmxh8AXI.jpg','Irmã rebelde que sonha em ser escritora enquanto a família atravessa os anos da guerra.','The rebellious sister who dreams of becoming a writer while her family weathers the war years.'),
('CRL',79,array['catharsis','romantic','laugh-out-loud']::text[],'Corredor do Destino','Runner of Destiny','Forrest Gump','Forrest Gump',null,null,null,13,'/Cw4hIUIAmSYfK9QfaUW5igp9La.jpg','Homem de coração puro que atravessa a história americana sem nunca largar o amor por Jenny.','A pure-hearted man who runs through American history without ever letting go of his love for Jenny.'),
('CFL',80,array['catharsis','family-time','laugh-out-loud']::text[],'Xerife de Brinquedo','Toy Sheriff','Woody','Woody',null,null,null,862,'/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg','Caubói de pano que teme ser trocado pelo brinquedo novo do quarto.','A pull-string cowboy afraid of being replaced by the new toy in the room.'),
('XRF',81,array['adrenaline','romantic','family-time']::text[],'Super-Pai','Super Dad','Bob Parr','Bob Parr',null,null,null,9806,'/2LqaLgk4Z226KkgPJuiOQ58wvrm.jpg','Ex-super-herói preso num emprego de escritório que volta à ação — com a família inteira.','A former superhero stuck in an office job who returns to action — with the whole family.'),
('XRL',82,array['adrenaline','romantic','laugh-out-loud']::text[],'Gênio Charmoso','Charming Genius','Tony Stark','Tony Stark',null,null,null,1726,'/78lPtwv72eTNqFW9COBYI0dWDJa.jpg','Bilionário, gênio e galanteador que constrói uma armadura para consertar os próprios erros.','A billionaire, genius and charmer who builds a suit of armor to fix his own mistakes.'),
('XFL',83,array['adrenaline','family-time','laugh-out-loud']::text[],'Defensor do Lar','Home Defender','Kevin McCallister','Kevin McCallister',null,null,null,771,'/onTSipZ8R3bliBdKfPtsDuHTdlL.jpg','Garoto de 8 anos esquecido em casa no Natal que defende o lar de dois ladrões.','An 8-year-old left home alone at Christmas who defends the house from two burglars.'),
('RFL',84,array['romantic','family-time','laugh-out-loud']::text[],'Princesa Desajeitada','Clumsy Princess','Mia Thermopolis','Mia Thermopolis',null,null,null,9880,'/7axhsbEzFan6HQQ1aMOy7w3CFRx.jpg','Adolescente desengonçada de São Francisco que descobre ser herdeira do trono de Genovia.','An awkward San Francisco teen who discovers she is heir to the throne of Genovia.')
on conflict (code) do update set
  sort_order = excluded.sort_order, mood_keys = excluded.mood_keys,
  title_pt = excluded.title_pt, title_en = excluded.title_en,
  character_pt = excluded.character_pt, character_en = excluded.character_en,
  film_title_pt = coalesce(excluded.film_title_pt, public.cine_personas.film_title_pt),
  film_title_en = coalesce(excluded.film_title_en, public.cine_personas.film_title_en),
  film_year = coalesce(excluded.film_year, public.cine_personas.film_year),
  tmdb_id = excluded.tmdb_id, poster_path = excluded.poster_path,
  blurb_pt = excluded.blurb_pt, blurb_en = excluded.blurb_en;

-- Título e ano do filme de cada personagem, a partir do cache de filmes.
update public.cine_personas cp
   set film_title_en = mc.title_en,
       film_title_pt = coalesce(nullif(mc.title_pt, ''), mc.title_en),
       film_year = extract(year from mc.release_date)::smallint
  from public.movie_cache mc
 where mc.tmdb_id = cp.tmdb_id and mc.media_type = 'movie' and cp.film_title_en is null;

-- 3. Onde a personalidade de cada perfil fica guardada --------------------
alter table public.profiles
  add column if not exists persona_scores jsonb,
  add column if not exists persona_counted integer not null default 0,
  add column if not exists persona_updated_at timestamptz;

-- 4. O cálculo ------------------------------------------------------------
create or replace function public.refresh_user_persona(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_scores jsonb;
  v_counted integer;
  v_moods_used integer;
  v_code text;
begin
  with rated as (
    select um.movie_id, um.rating::numeric as rating
      from user_movies um
     where um.user_id = p_user_id
       and um.rating is not null
       and um.media_type = 'movie'
  ),
  curated as (
    select distinct rp.mood_key, (e.value #>> '{}')::integer as movie_id
      from recommendation_pools rp
     cross join lateral jsonb_array_elements(rp.movie_ids) as e(value)
     where rp.mood_key <> 'random-surprise'
  ),
  per_mood as (
    select m.mood_key, m.letter, m.sort_order,
           coalesce(sum(r.rating), 0) as score,
           count(r.movie_id) as films
      from cine_moods m
      left join curated c on c.mood_key = m.mood_key
      left join rated r on r.movie_id = c.movie_id
     group by m.mood_key, m.letter, m.sort_order
  ),
  ranked as (
    select pm.*, row_number() over (order by pm.score desc, pm.films desc, pm.sort_order) as rk
      from per_mood pm
  )
  select jsonb_agg(jsonb_build_object('mood_key', mood_key, 'score', score, 'films', films) order by rk),
         coalesce(sum(films), 0)::integer,
         (count(*) filter (where films > 0))::integer,
         string_agg(letter, '' order by sort_order) filter (where rk <= 3 and films > 0)
    into v_scores, v_counted, v_moods_used, v_code
    from ranked;

  if v_counted < 10 or v_moods_used < 3 or length(coalesce(v_code, '')) <> 3 then
    v_code := null;
  end if;

  update profiles
     set personalidade_completa = v_code,
         persona_scores = v_scores,
         persona_counted = v_counted,
         persona_updated_at = now()
   where id = p_user_id
     and (personalidade_completa is distinct from v_code
          or persona_scores is distinct from v_scores
          or persona_counted is distinct from v_counted);

  return v_code;
end;
$$;

revoke all on function public.refresh_user_persona(uuid) from public, anon, authenticated;

create or replace function public.trigger_persona_refresh()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
begin
  if TG_OP = 'INSERT' then
    for v_user in select distinct n.user_id from new_rows n where n.rating is not null loop
      perform refresh_user_persona(v_user);
    end loop;
  elsif TG_OP = 'UPDATE' then
    for v_user in
      select distinct n.user_id
        from new_rows n join old_rows o on o.id = n.id
       where n.rating is distinct from o.rating
          or n.movie_id is distinct from o.movie_id
          or n.media_type is distinct from o.media_type
    loop
      perform refresh_user_persona(v_user);
    end loop;
  elsif TG_OP = 'DELETE' then
    for v_user in
      select distinct o.user_id from old_rows o
       where o.rating is not null and exists (select 1 from profiles p where p.id = o.user_id)
    loop
      perform refresh_user_persona(v_user);
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.trigger_persona_refresh() from public, anon, authenticated;

drop trigger if exists persona_refresh_ins on public.user_movies;
drop trigger if exists persona_refresh_upd on public.user_movies;
drop trigger if exists persona_refresh_del on public.user_movies;
create trigger persona_refresh_ins after insert on public.user_movies
  referencing new table as new_rows for each statement execute function public.trigger_persona_refresh();
create trigger persona_refresh_upd after update on public.user_movies
  referencing old table as old_rows new table as new_rows for each statement execute function public.trigger_persona_refresh();
create trigger persona_refresh_del after delete on public.user_movies
  referencing old table as old_rows for each statement execute function public.trigger_persona_refresh();

-- 5. Aposenta o sistema antigo (gatilhos desligados, não apagados) --------
alter table public.user_movies disable trigger spectrogram_recalc_ins;
alter table public.user_movies disable trigger spectrogram_recalc_upd;
alter table public.user_movies disable trigger spectrogram_recalc_del;
alter table public.profiles disable trigger trigger_profiles_personality;

-- 6. Colunas novas protegidas contra edição pelo próprio usuário ----------
create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.plan_type is distinct from old.plan_type
       or new.lifetime_premium is distinct from old.lifetime_premium
       or new.ai_review_daily_count is distinct from old.ai_review_daily_count
       or new.last_ai_review_at is distinct from old.last_ai_review_at
       or new.pontos_e is distinct from old.pontos_e
       or new.pontos_i is distinct from old.pontos_i
       or new.pontos_c is distinct from old.pontos_c
       or new.pontos_s is distinct from old.pontos_s
       or new.pontos_r is distinct from old.pontos_r
       or new.personalidade_completa is distinct from old.personalidade_completa
       or new.persona_scores is distinct from old.persona_scores
       or new.persona_counted is distinct from old.persona_counted
       or new.persona_updated_at is distinct from old.persona_updated_at
       or (new.subcategoria_id is distinct from old.subcategoria_id and new.subcategoria_id is not null)
       or new.avatar_frame is distinct from old.avatar_frame
       or new.banner is distinct from old.banner
       or new.text_effect is distinct from old.text_effect
       or new.card_style is distinct from old.card_style
    then
      raise exception 'Esta coluna do perfil só pode ser alterada pelo sistema'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- 7. Leitura --------------------------------------------------------------
-- Personalidade de um perfil: a sua, ou a de um perfil que você pode ver.
create or replace function public.get_user_persona(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_viewer uuid := auth.uid();
  v_prof record;
  v_persona jsonb;
begin
  select p.id, p.personalidade_completa, p.persona_scores, p.persona_counted, p.profile_visibility
    into v_prof
    from profiles p
   where p.id = p_user_id;
  if not found then
    return null;
  end if;

  if v_viewer is distinct from p_user_id
     and coalesce(v_prof.profile_visibility, 'public') <> 'public'
     and not (v_prof.profile_visibility = 'friends_only' and v_viewer is not null and are_friends(v_viewer, p_user_id)) then
    return null;
  end if;

  select to_jsonb(cp) into v_persona from cine_personas cp where cp.code = v_prof.personalidade_completa;

  return jsonb_build_object(
    'code', case when v_persona is not null then v_prof.personalidade_completa end,
    'counted', coalesce(v_prof.persona_counted, 0),
    'threshold', 10,
    'scores', coalesce(v_prof.persona_scores, '[]'::jsonb),
    'persona', v_persona
  );
end;
$$;

grant execute on function public.get_user_persona(uuid) to anon, authenticated;

-- As 84 personalidades com quantas pessoas vivem em cada uma.
drop function if exists public.get_personas_global_stats();
create function public.get_personas_global_stats()
returns table(
  code text, sort_order smallint, mood_keys text[],
  title_pt text, title_en text, character_pt text, character_en text,
  film_title_pt text, film_title_en text, film_year smallint,
  tmdb_id integer, poster_path text, blurb_pt text, blurb_en text,
  user_count bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select cp.code, cp.sort_order, cp.mood_keys,
         cp.title_pt, cp.title_en, cp.character_pt, cp.character_en,
         cp.film_title_pt, cp.film_title_en, cp.film_year,
         cp.tmdb_id, cp.poster_path, cp.blurb_pt, cp.blurb_en,
         coalesce(c.n, 0) as user_count
    from cine_personas cp
    left join (
      select p.personalidade_completa, count(*) as n
        from profiles p
       where p.personalidade_completa is not null
       group by p.personalidade_completa
    ) c on c.personalidade_completa = cp.code
   order by cp.sort_order;
$$;

grant execute on function public.get_personas_global_stats() to anon, authenticated;

-- Mesma assinatura de antes (usada pela generate-ai-review), agora com a
-- personalidade nova: nome = título, descrição = personagem + resumo,
-- "subcategoria" = as três prateleiras.
create or replace function public.get_user_complete_personality(p_user_id uuid, p_language text default 'pt')
returns table(
  user_id uuid, username text, personalidade_completa text,
  archetype_id text, archetype_name text, archetype_description text,
  subcategory_id text, subcategory_name text, subcategory_description text,
  personality_description text,
  pontos_e numeric, pontos_i numeric, pontos_c numeric, pontos_s numeric, pontos_r numeric
)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  return query
  with base as (
    select p.id, p.username, p.personalidade_completa, cp.*,
           (select string_agg(case when p_language = 'en' then m.name_en else m.name_pt end, ', ' order by m.sort_order)
              from cine_moods m where m.mood_key = any(cp.mood_keys)) as moods_label
      from profiles p
      left join cine_personas cp on cp.code = p.personalidade_completa
     where p.id = p_user_id
  )
  select b.id, b.username, b.personalidade_completa,
         b.code,
         case when p_language = 'en' then b.title_en else b.title_pt end,
         case when b.code is null then null
              when p_language = 'en' then b.character_en || ' — ' || b.blurb_en
              else b.character_pt || ' — ' || b.blurb_pt end,
         null::text,
         b.moods_label,
         case when b.code is null then null
              when p_language = 'en' then 'The three shelves this person uses most in the Oracles'' Library: ' || b.moods_label || '.'
              else 'As três prateleiras que essa pessoa mais usa na Biblioteca dos Oráculos: ' || b.moods_label || '.' end,
         case when b.code is null then null
              when p_language = 'en' then b.title_en || ' (' || b.character_en || ')'
              else b.title_pt || ' (' || b.character_pt || ')' end,
         null::numeric, null::numeric, null::numeric, null::numeric, null::numeric
    from base b;
end;
$$;

-- 8. "Do Oráculo para Você" passa a sair das 3 prateleiras da pessoa ------
--    posições 1-2: a prateleira mais usada; 3-4: a segunda; 5: a terceira
--    (com a Cobra entrando na roda). Sem personalidade: surpresa aleatória.
create or replace function public.get_or_create_user_oracle_recommendations(p_user_id uuid)
returns table(movie_id integer, pool_position smallint)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today      date    := (now() at time zone 'America/Sao_Paulo')::date;
  v_code       text;
  v_scores     jsonb;
  v_moods      text[]  := array[]::text[];
  v_library    integer[] := array[]::integer[];
  v_picked     integer[] := array[]::integer[];
  v_result     integer[] := array[]::integer[];
  v_slot_mood  text;
  v_slot_cards text[];
  v_avail      integer[];
  v_picked_id  integer;
  v_slot       integer;
begin
  perform public.assert_caller_is(p_user_id);

  if exists (
    select 1 from user_oracle_daily_recommendations uodr
     where uodr.user_id = p_user_id and uodr.recommendation_date = v_today
  ) then
    return query
      select uodr.movie_id, uodr.pool_position
        from user_oracle_daily_recommendations uodr
       where uodr.user_id = p_user_id and uodr.recommendation_date = v_today
       order by uodr.pool_position;
    return;
  end if;

  select array_agg(um.movie_id) into v_library from user_movies um where um.user_id = p_user_id;
  if v_library is null then v_library := array[]::integer[]; end if;

  select p.personalidade_completa, p.persona_scores into v_code, v_scores from profiles p where p.id = p_user_id;

  if v_code is not null and jsonb_typeof(v_scores) = 'array' then
    select array_agg(s.value ->> 'mood_key' order by s.ord)
      into v_moods
      from jsonb_array_elements(v_scores) with ordinality as s(value, ord)
     where (s.value ->> 'films')::integer > 0 and s.ord <= 3;
  end if;
  if v_moods is null then v_moods := array[]::text[]; end if;

  for v_slot in 1..5 loop
    if coalesce(array_length(v_moods, 1), 0) < 3 then
      v_slot_mood  := 'random-surprise';
      v_slot_cards := array['bogart', 'fincher'];
    elsif v_slot in (1, 2) then
      v_slot_mood  := v_moods[1];
      v_slot_cards := array['bogart', 'fincher'];
    elsif v_slot in (3, 4) then
      v_slot_mood  := v_moods[2];
      v_slot_cards := array['bogart', 'fincher'];
    else
      v_slot_mood  := v_moods[3];
      v_slot_cards := array['bogart', 'fincher', 'cypher'];
    end if;

    select array_agg(distinct sub.elem) into v_avail
      from (
        select jsonb_array_elements_text(rp.movie_ids)::integer as elem
          from recommendation_pools rp
         where rp.card_type = any(v_slot_cards) and rp.mood_key = v_slot_mood
      ) sub
     where sub.elem != all(v_library || v_picked);

    if v_avail is null or array_length(v_avail, 1) = 0 then
      select array_agg(distinct sub.elem) into v_avail
        from (
          select jsonb_array_elements_text(rp.movie_ids)::integer as elem
            from recommendation_pools rp
           where rp.card_type = any(v_slot_cards) and rp.mood_key = v_slot_mood
        ) sub
       where sub.elem != all(v_picked);
    end if;

    if v_avail is not null and array_length(v_avail, 1) > 0 then
      v_picked_id := v_avail[floor(random() * array_length(v_avail, 1))::integer + 1];
      v_picked    := v_picked || array[v_picked_id];
      v_result    := v_result || array[v_picked_id];
    end if;
  end loop;

  for v_slot in 1..coalesce(array_length(v_result, 1), 0) loop
    insert into user_oracle_daily_recommendations (user_id, recommendation_date, movie_id, pool_position)
    values (p_user_id, v_today, v_result[v_slot], v_slot::smallint)
    on conflict on constraint user_oracle_daily_recommendat_user_id_recommendation_date_p_key do nothing;
  end loop;

  return query
    select uodr.movie_id, uodr.pool_position
      from user_oracle_daily_recommendations uodr
     where uodr.user_id = p_user_id and uodr.recommendation_date = v_today
     order by uodr.pool_position;
end;
$$;

-- 9. Recalcula todo mundo ------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.refresh_user_persona(r.id);
  end loop;
end;
$$;
