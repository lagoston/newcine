-- Check-up das 84 personalidades (21/10/2026): o filme do personagem tem de
-- estar numa das três prateleiras do código. 11 não estavam:
--   - 8 com o filme em outra prateleira: MXA (2001, P), MPF (Willy Wonka, A),
--     MAL (Mochileiro, P), MZL (MIB, A), MRL (Feitiço do Tempo, C),
--     XCR (A Forma da Água, M), XZF (Jurassic Park, A), PAL (Piratas, Z);
--   - 3 com o filme fora das prateleiras: MPR (Sonhando Acordado),
--     XPF (Alice de Tim Burton), PZF (Speed Racer).
-- Dois personagens só mudaram de código, porque o filme deles cabe no outro:
-- Agente J (MIB, Aventuras) MZL → MAL e Arthur Dent (Mochileiro, Psicodélico)
-- MAL → PAL. Com a saída do Jack Sparrow, o Johnny Depp volta como Edward Mãos
-- de Tesoura. Nenhum ator, filme ou saga se repete nas 84.
-- Código, humores e ordem continuam iguais; só muda quem é o personagem.

update public.cine_personas set
  title_pt = 'Messias do Deserto', title_en = 'Desert Messiah',
  character_pt = 'Paul Atreides', character_en = 'Paul Atreides',
  film_title_pt = 'Duna', film_title_en = 'Dune', film_year = 2021, tmdb_id = 438631,
  poster_path = '/v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg',
  blurb_pt = 'Herdeiro de uma casa nobre traída no planeta mais hostil do universo, assombrado por visões de um futuro terrível.',
  blurb_en = 'Heir to a betrayed noble house on the most hostile planet in the universe, haunted by visions of a terrible future.',
  actor_name = 'Timothée Chalamet', actor_tmdb_id = 1190668,
  character_image_path = '/34T7UYDSNfEQbuealcm4Plibla2.jpg', character_image_focus = '50% 0%',
  works = '[{"id": 438631, "type": "movie"}, {"id": 841, "type": "movie"}, {"id": 693134, "type": "movie"}]'::jsonb
where code = 'MXA';

update public.cine_personas set
  title_pt = 'Menina do Coelho Branco', title_en = 'Girl of the White Rabbit',
  character_pt = 'Alice', character_en = 'Alice',
  film_title_pt = 'Alice no País das Maravilhas', film_title_en = 'Alice in Wonderland', film_year = 1951, tmdb_id = 12092,
  poster_path = '/20cvfwfaFqNbe9Fc3VEHJuPRxmn.jpg',
  blurb_pt = 'Menina curiosa que segue um coelho apressado e cai num mundo onde nada faz sentido — e tudo pode acontecer.',
  blurb_en = 'A curious girl who follows a hurried rabbit into a world where nothing makes sense — and anything can happen.',
  actor_name = 'Kathryn Beaumont', actor_tmdb_id = 67228,
  character_image_path = '/aGUSyNCQ61kc9AEF8op9YfwI6ua.jpg', character_image_focus = '68% 50%',
  works = '[{"id": 12092, "type": "movie"}]'::jsonb
where code = 'MPF';

update public.cine_personas set
  title_pt = 'Novato das Galáxias', title_en = 'Rookie of the Galaxy',
  character_pt = 'Agente J', character_en = 'Agent J',
  film_title_pt = 'MIB: Homens de Preto', film_title_en = 'Men in Black', film_year = 1997, tmdb_id = 607,
  poster_path = '/uLOmOF5IzWoyrgIF5MfUnh5pa1X.jpg',
  blurb_pt = 'Policial de Nova York recrutado por uma agência secreta que vigia os alienígenas escondidos entre nós.',
  blurb_en = 'A New York cop recruited by a secret agency that polices the aliens hiding among us.',
  actor_name = 'Will Smith', actor_tmdb_id = 2888,
  character_image_path = '/8r1Wglhe8RCp7VxaTyXSpmB1AzX.jpg', character_image_focus = '50% 0%',
  works = '[{"id": 607, "type": "movie"}, {"id": 41154, "type": "movie"}]'::jsonb
where code = 'MAL';

update public.cine_personas set
  title_pt = 'Aniversariante em Looping', title_en = 'Birthday on Loop',
  character_pt = 'Tree Gelbman', character_en = 'Tree Gelbman',
  film_title_pt = 'A Morte Te Dá Parabéns', film_title_en = 'Happy Death Day', film_year = 2017, tmdb_id = 440021,
  poster_path = '/cTaEIUYTt52ooq9quVbAQ7NpGwo.jpg',
  blurb_pt = 'Universitária assassinada no dia do próprio aniversário, que acorda de novo na mesma manhã até descobrir quem está por trás da máscara.',
  blurb_en = 'A college student murdered on her own birthday who keeps waking up to the same morning until she finds out who is behind the mask.',
  actor_name = 'Jessica Rothe', actor_tmdb_id = 1427680,
  character_image_path = '/3Oqgi4CpJWYPkVsnWBaJIEbhMbh.jpg', character_image_focus = '65% 50%',
  works = '[{"id": 440021, "type": "movie"}, {"id": 512196, "type": "movie"}]'::jsonb
where code = 'MZL';

update public.cine_personas set
  title_pt = 'Hóspede do Dia Eterno', title_en = 'Guest of the Endless Day',
  character_pt = 'Nyles', character_en = 'Nyles',
  film_title_pt = 'Palm Springs', film_title_en = 'Palm Springs', film_year = 2020, tmdb_id = 587792,
  poster_path = '/gnAfqiV7yO3Jq9IntTmwkcaICqc.jpg',
  blurb_pt = 'Convidado de casamento preso no mesmo dia há tanto tempo que já desistiu de tudo — até ganhar companhia no looping.',
  blurb_en = 'A wedding guest stuck in the same day for so long he has given up on everything — until someone joins him in the loop.',
  actor_name = 'Andy Samberg', actor_tmdb_id = 62861,
  character_image_path = '/3lIeLJi0VPZdIUauST2q4C804Ga.jpg', character_image_focus = '75% 50%',
  works = '[{"id": 587792, "type": "movie"}]'::jsonb
where code = 'MRL';

update public.cine_personas set
  title_pt = 'Coração de Lâminas', title_en = 'Heart of Blades',
  character_pt = 'Edward Mãos de Tesoura', character_en = 'Edward Scissorhands',
  film_title_pt = 'Edward Mãos de Tesoura', film_title_en = 'Edward Scissorhands', film_year = 1990, tmdb_id = 162,
  poster_path = '/e0FqKFvGPdQNWG8tF9cZBtev9Em.jpg',
  blurb_pt = 'Criação inacabada com tesouras no lugar das mãos, que se apaixona num subúrbio que não sabe como tocá-lo.',
  blurb_en = 'An unfinished creation with scissors for hands who falls in love in a suburb that does not know how to touch him.',
  actor_name = 'Johnny Depp', actor_tmdb_id = 85,
  character_image_path = '/qOL963em2govahmx5TzxDrYPxbY.jpg', character_image_focus = '50% 50%',
  works = '[{"id": 162, "type": "movie"}]'::jsonb
where code = 'XCR';

update public.cine_personas set
  title_pt = 'Mogwai das Três Regras', title_en = 'Mogwai of the Three Rules',
  character_pt = 'Gizmo', character_en = 'Gizmo',
  film_title_pt = 'Gremlins', film_title_en = 'Gremlins', film_year = 1984, tmdb_id = 927,
  poster_path = '/6m0F7fsXjQvUbCZrPWcJNrjvIui.jpg',
  blurb_pt = 'Bichinho adorável que vira o estopim do caos numa cidadezinha quando alguém quebra as três regras: nada de luz, nada de água e nada de comer depois da meia-noite.',
  blurb_en = 'An adorable little creature who sparks chaos in a small town when someone breaks the three rules: no bright light, no water and no food after midnight.',
  actor_name = 'Howie Mandel', actor_tmdb_id = 77920,
  character_image_path = '/xXficdkAqbZgR7OGvyae2nPIvsJ.jpg', character_image_focus = '50% 50%',
  works = '[{"id": 927, "type": "movie"}]'::jsonb
where code = 'XZF';

update public.cine_personas set
  title_pt = 'Náufrago Cósmico', title_en = 'Cosmic Castaway',
  character_pt = 'Arthur Dent', character_en = 'Arthur Dent',
  film_title_pt = 'O Guia do Mochileiro das Galáxias', film_title_en = 'The Hitchhiker''s Guide to the Galaxy', film_year = 2005, tmdb_id = 7453,
  poster_path = '/4fOFbNMjq708CQ7ou71by6rI6wZ.jpg',
  blurb_pt = 'Inglês comum que perde a Terra numa quinta-feira e sai pela galáxia de roupão e toalha.',
  blurb_en = 'An ordinary Englishman who loses Earth on a Thursday and roams the galaxy in a bathrobe, towel in hand.',
  actor_name = 'Martin Freeman', actor_tmdb_id = 7060,
  character_image_path = '/tvI85xGm6KezHuHzfHEGNv5pzFc.jpg', character_image_focus = '68% 50%',
  works = '[{"id": 7453, "type": "movie"}, {"id": 2048, "type": "tv"}]'::jsonb
where code = 'PAL';

update public.cine_personas set
  title_pt = 'Homem de Todas as Vidas', title_en = 'Man of Every Life',
  character_pt = 'Nemo Nobody', character_en = 'Nemo Nobody',
  film_title_pt = 'Sr. Ninguém', film_title_en = 'Mr. Nobody', film_year = 2009, tmdb_id = 31011,
  poster_path = '/qNkIONc4Rgmzo23ph7qWp9QfVnW.jpg',
  blurb_pt = 'O último mortal da Terra, que relembra as vidas que poderia ter vivido — e os três amores que cada escolha mudaria.',
  blurb_en = 'The last mortal on Earth, recalling the lives he might have lived — and the three loves each choice would change.',
  actor_name = 'Jared Leto', actor_tmdb_id = 7499,
  character_image_path = '/dkS5XPz0Sd31YqHAKoDomN7VwCm.jpg', character_image_focus = '46% 50%',
  works = '[{"id": 31011, "type": "movie"}]'::jsonb
where code = 'MPR';

update public.cine_personas set
  title_pt = 'Menina dos Espíritos', title_en = 'Girl of the Spirits',
  character_pt = 'Chihiro', character_en = 'Chihiro',
  film_title_pt = 'A Viagem de Chihiro', film_title_en = 'Spirited Away', film_year = 2001, tmdb_id = 129,
  poster_path = '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
  blurb_pt = 'Menina de 10 anos que fica presa numa casa de banhos para espíritos e precisa trabalhar para salvar os pais, transformados em porcos.',
  blurb_en = 'A 10-year-old trapped in a bathhouse for spirits who must work to save her parents, turned into pigs.',
  actor_name = 'Rumi Hiiragi', actor_tmdb_id = 19587,
  character_image_path = '/6oaL4DP75yABrd5EbC4H2zq5ghc.jpg', character_image_focus = '59% 50%',
  works = '[{"id": 129, "type": "movie"}]'::jsonb
where code = 'XPF';

update public.cine_personas set
  title_pt = 'Corredora Glitch', title_en = 'Glitch Racer',
  character_pt = 'Vanellope von Schweetz', character_en = 'Vanellope von Schweetz',
  film_title_pt = 'Detona Ralph', film_title_en = 'Wreck-It Ralph', film_year = 2012, tmdb_id = 82690,
  poster_path = '/nrEupcBwf4O1zihCM34NoXusZDq.jpg',
  blurb_pt = 'Piloto com defeito de programação que sonha correr no jogo de doces que a expulsou da pista.',
  blurb_en = 'A racer with a programming glitch who dreams of competing in the candy game that banned her from the track.',
  actor_name = 'Sarah Silverman', actor_tmdb_id = 7404,
  character_image_path = '/lxN3aRNJIPTxbbsGwhfSv2Blt54.jpg', character_image_focus = '0% 50%',
  works = '[{"id": 82690, "type": "movie"}, {"id": 404368, "type": "movie"}]'::jsonb
where code = 'PZF';
