-- 04/11/2026 (10h59) — Lote 10 do Poster Jackpot, pedido do Bruno: 26 pôsteres novos,
-- na ordem em que ele mandou (é ela que define os números de colecionador), e a troca
-- da arte do Perdido em Marte. Todos os arquivos conferidos no TMDB (/images) antes.
-- Raridades: 2 lendários, 5 épicos, 7 raros e 12 comuns. Com eles a roleta tem
-- 189 pôsteres: 80 comuns (a meta), 47 raros, 38 épicos e 24 lendários.

insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 95557, 'legendary', '/3qPB2ydMCyEZlS4JbymbZ4RIdPU.jpg') on conflict (file_path) do nothing; -- Invencível (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 969681, 'epic', '/lH6LQcUhkVOK6ekvXzthQAogUnR.jpg') on conflict (file_path) do nothing; -- Homem-Aranha: Um Novo Dia (2026)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 771, 'rare', '/qAlC9aGHz5ILswVMSuyFtA5tdAD.jpg') on conflict (file_path) do nothing; -- Esqueceram de Mim
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 10625, 'common', '/4gVFIvUcm3yRVIG2FKGMwORisP.jpg') on conflict (file_path) do nothing; -- Meninas Malvadas (2004)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 808, 'common', '/2Caoraw3SbZw9g23JksWxAA8FVO.jpg') on conflict (file_path) do nothing; -- Shrek
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 350, 'common', '/4PdlakfJvcWedT1e3Jra5Zy8TgC.jpg') on conflict (file_path) do nothing; -- O Diabo Veste Prada
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 2108, 'rare', '/2MqfUrqUamgzkV1snw6HDrDnxWx.jpg') on conflict (file_path) do nothing; -- Clube dos Cinco
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 18785, 'common', '/5ybCRTwrSjCoeaxO200qPgEmDcd.jpg') on conflict (file_path) do nothing; -- Se Beber, Não Case!
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 9806, 'rare', '/q9oaD0myYNsyEgk0fZPlJULKnQ7.jpg') on conflict (file_path) do nothing; -- Os Incríveis
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 862, 'common', '/fGJwi4mhqg0TaXeqhTayT4OE42E.jpg') on conflict (file_path) do nothing; -- Toy Story
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 1584, 'rare', '/tPlPiXpfjokCJaaI06DFKyBWfk6.jpg') on conflict (file_path) do nothing; -- Escola de Rock
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 598, 'legendary', '/yY8Fp644mPNX8HP8O7cu2ksMq3y.jpg') on conflict (file_path) do nothing; -- Cidade de Deus
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 194, 'common', '/cxK0XyLraCsda6mgng4wztiahgu.jpg') on conflict (file_path) do nothing; -- O Fabuloso Destino de Amélie Poulain
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 1417, 'common', '/loGh5DXfEOp7VhlpQCgSEiiWYna.jpg') on conflict (file_path) do nothing; -- O Labirinto do Fauno
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 601, 'common', '/oDlh1vExm2X0kAqMddTi7iVLy3k.jpg') on conflict (file_path) do nothing; -- E.T.: O Extraterrestre
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 578, 'common', '/4eXMxfVysr93BX4lZAERakVGZMI.jpg') on conflict (file_path) do nothing; -- Tubarão
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 807, 'common', '/zUwMTJptftzNWXAYBFLKfWSI8XR.jpg') on conflict (file_path) do nothing; -- Seven: Os Sete Crimes Capitais
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 115, 'epic', '/9cHAfpLVNlFz7d91RdYtwG33TMn.jpg') on conflict (file_path) do nothing; -- O Grande Lebowski
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 76341, 'common', '/tvpf0gi4EOIuI9in1obHaNezJc2.jpg') on conflict (file_path) do nothing; -- Mad Max: Estrada da Fúria
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 4607, 'rare', '/wxsKQg6i8nFq6PjusnNbIwK9pie.jpg') on conflict (file_path) do nothing; -- Lost (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 42009, 'rare', '/dtcaNiEv4lywOUFNKa66Kj4pqsl.jpg') on conflict (file_path) do nothing; -- Black Mirror (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 76331, 'epic', '/jaUDKLKdYgLzm56hTaHBtmD4T9i.jpg') on conflict (file_path) do nothing; -- Succession (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 93405, 'epic', '/x1tomwnDNB7AeXTyEfacigNboo4.jpg') on conflict (file_path) do nothing; -- Round 6 (série)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 105, 'epic', '/e7IoUZOmjsy0v47UvZsrwkbtvYR.jpg') on conflict (file_path) do nothing; -- De Volta para o Futuro
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 348, 'common', '/jsbF3fHLU9DO3pfzg6HGQkxkqEi.jpg') on conflict (file_path) do nothing; -- Alien: O Oitavo Passageiro (1979)
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 329, 'rare', '/zWgWVXrLjVKCGzeJaV2FTNbuCza.jpg') on conflict (file_path) do nothing; -- Jurassic Park

-- Perdido em Marte (Comum 057): o Bruno pediu para trocar a arte ("vamos trocar o atual
-- por esse"). Troca no próprio pôster, sem número novo: quem já tem continua tendo o
-- Comum 057, agora com a arte nova (em 04/11, 1 pessoa tinha; nenhum equipado nem em troca).
update poster_items set file_path = '/bbsXQQuf0mj2c8puPv1WuF21VLF.jpg'
 where id = 138 and media_type = 'movie' and tmdb_id = 286217 and file_path = '/uYXbc1uhIDarfG0LIOYLNsySUwB.jpg';
