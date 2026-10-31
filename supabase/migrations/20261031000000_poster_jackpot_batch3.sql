-- Poster Jackpot: terceiro lote de pôsteres (31/10/2026), mandado pelo Bruno.
-- Cada file_path foi conferido na lista de pôsteres do título no TMDB
-- (/movie|tv/{id}/images) antes de entrar.

insert into public.poster_items (media_type, tmdb_id, rarity, file_path) values
  ('movie', 694, 'legendary', '/d2oMUQaCJzlLctiGlXQ7pm87uyy.jpg'),     -- O Iluminado
  ('movie', 603, 'legendary', '/4CArEDxO6jANdaU3H0bOGwACQGO.jpg'),     -- Matrix
  ('movie', 185, 'epic', '/kFEx41sf8NCfaNBg1o4jWvAUEkb.jpg'),          -- Laranja Mecânica
  ('movie', 62, 'legendary', '/g1wyGaLmRBFsJXNWh52DCpxvIxk.jpg'),      -- 2001: Uma Odisseia no Espaço
  ('movie', 28, 'rare', '/5U33BMOwcWkpO1YAVRFxZ2udFiT.jpg'),           -- Apocalypse Now
  ('movie', 129, 'legendary', '/byYh97Oh1VtxRtzrRkx9kOx2Fdw.jpg'),     -- A Viagem de Chihiro
  ('movie', 438631, 'legendary', '/9lngqotQjxjXvQXymTqLiRIUuf1.jpg'),  -- Duna (2021)
  ('tv', 66732, 'epic', '/jO5CovVzdrS6KEe652OGg87Kx5F.jpg'),           -- Stranger Things
  ('movie', 313369, 'common', '/k0toQ0FVQ7PrTSVWPCA8SKEzKDu.jpg'),     -- La La Land
  ('movie', 107, 'common', '/wYUaZYKl21rbcv8VLlVKHcURfOf.jpg'),        -- Snatch: Porcos e Diamantes
  ('movie', 503919, 'common', '/fEfiRjeyD5P6XKSVbDpwHqOg0yu.jpg'),     -- O Farol
  ('movie', 19995, 'rare', '/fwmoeF44DXBk1tC30QFAiE0nwjT.jpg'),        -- Avatar (2009)
  ('movie', 13183, 'legendary', '/lphjYidgkvq5VB59nUNIS1EDBJ3.jpg'),   -- Watchmen: O Filme
  ('movie', 24428, 'rare', '/q4xuhyjfMqbkm6o6Rx548EREJw0.jpg'),        -- Os Vingadores (2012)
  ('tv', 86831, 'epic', '/7MuV1EsBTvH7LuOv4ZuD4jxznhJ.jpg'),           -- Love, Death & Robots
  ('tv', 60574, 'rare', '/eNXedoheXrfBJJS6hZmXhX5hwmj.jpg'),           -- Peaky Blinders
  ('tv', 1413, 'rare', '/x0TrERb34bauHXLXLdcwLYqU9iO.jpg'),            -- American Horror Story
  ('movie', 10681, 'common', '/vkAh69GpsV9w05P9wBPMCWakIEa.jpg'),      -- WALL-E
  ('movie', 8587, 'legendary', '/5terxtsWSY4ds1WWuHFV9PAATi1.jpg'),    -- O Rei Leão (1994)
  ('movie', 85, 'common', '/z218SXkLsz2VsYMvV636Vr26eZ0.jpg'),         -- Indiana Jones e os Caçadores da Arca Perdida
  ('movie', 3131, 'epic', '/bTO2muMOLL4IphErvmHFZknjZmC.jpg'),         -- Gangues de Nova York
  ('movie', 37165, 'common', '/yFFrETGXDLQR78Tto3kIO6PVGeI.jpg'),      -- O Show de Truman
  ('movie', 101, 'common', '/wtCS01LW89R5HuyuWx5AnnZfOTI.jpg'),        -- O Profissional (Léon)
  ('movie', 44214, 'common', '/vQb0mDUxqXtCWIZN574d0IlhBKz.jpg'),      -- Cisne Negro
  ('movie', 764, 'epic', '/v8Sk3pzEV2NejzgncKw5VVnXWEN.jpg'),          -- Uma Noite Alucinante (The Evil Dead, 1981)
  ('movie', 4232, 'common', '/d4X8YMwjrHfbxaiq4BUrSe1z671.jpg'),       -- Pânico (1996)
  ('movie', 500, 'rare', '/pMjW52j4d40EK2M9sXP41b4RJD7.jpg'),          -- Cães de Aluguel
  ('movie', 16869, 'common', '/yj3gKIylFXGsaFwMRgVSfLCvHMQ.jpg'),      -- Bastardos Inglórios
  ('movie', 244786, 'common', '/Adre9uiyArv2kESw6vrvP40whPk.jpg'),     -- Whiplash
  ('movie', 7345, 'common', '/up4R96BTS5OR5rgpuNueZnRaZas.jpg'),       -- Sangue Negro (There Will Be Blood)
  ('movie', 14306, 'rare', '/3TelCfG4gD0JjlyK4eYTTp7tcO0.jpg')         -- Marley & Eu
on conflict (file_path) do nothing;
