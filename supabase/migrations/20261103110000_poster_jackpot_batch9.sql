-- 03/11/2026 (17h54) — Poster Jackpot, lote 9 (17 pôsteres, terror e afins), na ordem em que o
-- Bruno mandou (é ela que define os números de colecionador; o gatilho pula os números
-- reservados do Pôster Poker). Todos os arquivos conferidos no TMDB (/images) antes.
-- Um insert por linha para garantir a ordem dos números.

-- Backrooms (2026): epic
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 1083381, 'epic', '/r3qtSHdbRf1xuMCqJ9dQkOulFKn.jpg') on conflict (file_path) do nothing;
-- Resident Evil (2026 — o arquivo é do filme de 2026, não do de 2002): common
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 1423191, 'common', '/d07Xk47MYElK4PNmbx7VYxpcnJm.jpg') on conflict (file_path) do nothing;
-- A Hora do Mal (Weapons, 2025): rare
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 1078605, 'rare', '/l7rvNcMBLvRIYELkKcSFf5U5Bfb.jpg') on conflict (file_path) do nothing;
-- Sexta-Feira 13 (1980): legendary
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 4488, 'legendary', '/4v8hLNko4szvlhZdUfc3XWjjRCE.jpg') on conflict (file_path) do nothing;
-- Os Fantasmas se Divertem (Beetlejuice, 1988): epic
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 4011, 'epic', '/1NYlyhqq0A4GO7tiQXAtO0SSoz2.jpg') on conflict (file_path) do nothing;
-- Os Caça-Fantasmas (1984): rare
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 620, 'rare', '/uL2aCLRb2WaGPk41Ebf3CU6RmOZ.jpg') on conflict (file_path) do nothing;
-- A Hora do Pesadelo (1984): rare
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 377, 'rare', '/g2bgT2K1HJmFQFci3Z3q25uMdlx.jpg') on conflict (file_path) do nothing;
-- A Lenda do Cavaleiro Sem Cabeça (Sleepy Hollow, 1999): common
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 2668, 'common', '/h3HMA0GsxnPqoJEVLFc9hRFeF7m.jpg') on conflict (file_path) do nothing;
-- It: A Coisa (2017): epic
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 346364, 'epic', '/kuL8JOqToD1kxMWEDO5TvRDj0UG.jpg') on conflict (file_path) do nothing;
-- Frankenstein (2025): common
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 1062722, 'common', '/dquKZyKPsXSqK4LC9aMIaXdHKYj.jpg') on conflict (file_path) do nothing;
-- A Entidade (Sinister, 2012): rare
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 82507, 'rare', '/gEeda2nrDQ52lJ4aS65pY2BKGln.jpg') on conflict (file_path) do nothing;
-- O Sexto Sentido (1999): legendary
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 745, 'legendary', '/d7hBtiPxvPVMu3DUFjsmhzMjkOd.jpg') on conflict (file_path) do nothing;
-- X: A Marca da Morte (2022): epic
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 760104, 'epic', '/fJNKPwiXN2tZ58ZqaosnOru1Gcr.jpg') on conflict (file_path) do nothing;
-- Euphoria (série): epic
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('tv', 85552, 'epic', '/4rnNs0ukZ7GeJHVZrKNSIrM9Fbi.jpg') on conflict (file_path) do nothing;
-- Invocação do Mal (2013): common
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 138843, 'common', '/f9D9pgkKgXfNi8cPC4m6vFopZxH.jpg') on conflict (file_path) do nothing;
-- Todo Mundo em Pânico (2000): legendary
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 4247, 'legendary', '/4lPpn6990T2m8iImMhnOPeQwDep.jpg') on conflict (file_path) do nothing;
-- Anjos e Demônios (2009): common
insert into poster_items (media_type, tmdb_id, rarity, file_path) values ('movie', 13448, 'common', '/cmO8veIOqKR5LNsqCiKJJDzOb1Z.jpg') on conflict (file_path) do nothing;
