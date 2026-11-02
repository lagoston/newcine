-- Poster Jackpot: sétimo lote de pôsteres (02/11/2026), mandado pelo Bruno.
-- Cada file_path foi conferido na lista de pôsteres do título no TMDB
-- (tmdb-proxy via pg_net). Na ordem em que o Bruno mandou: é ela que define
-- os números de colecionador (gatilho poster_items_serial).
-- "Millennium: Os Homens que Não Amavam as Mulheres" é o de 2011 (Fincher):
-- o arquivo está nos pôsteres dele, não nos da versão sueca de 2009.
-- "Buddy" é o filme de 2026 (id 1514026).

insert into public.poster_items (media_type, tmdb_id, rarity, file_path) values
  ('movie', 687163, 'epic', '/4vAzk0jVxcn3692H7uODJDHbxpo.jpg'),     -- Devoradores de Estrelas (Project Hail Mary, 2026)
  ('movie', 286217, 'common', '/uYXbc1uhIDarfG0LIOYLNsySUwB.jpg'),   -- Perdido em Marte
  ('movie', 278, 'common', '/sk6SHy0bgTdRDaFj7vUyopqR47V.jpg'),      -- Um Sonho de Liberdade
  ('movie', 73, 'common', '/dzzIeOW9dmgkxWCks8HVFLdjY6K.jpg'),       -- A Outra História Americana
  ('movie', 1233413, 'rare', '/oc5m03GbUzSE6Cd1juCmMMbtLyi.jpg'),    -- Pecadores (Sinners, 2025)
  ('movie', 1514026, 'common', '/1qpgMYBPbm2bief81IIF6qqjjhm.jpg'),  -- Buddy (2026)
  ('tv', 5920, 'common', '/60877Z2qkpF9iiOJftFl11GVTDN.jpg'),        -- O Mentalista (série)
  ('movie', 65754, 'common', '/hmhOxC7afVzNi4iJVmYTUoqd4dp.jpg'),    -- Millennium: Os Homens que Não Amavam as Mulheres (2011)
  ('movie', 1949, 'rare', '/yoXsrW4UYD9XrxEoDkinunFffnX.jpg'),       -- Zodíaco
  ('movie', 546554, 'common', '/99yvIGJIN0BhjvzaxUPrNSD9hpN.jpg')    -- Entre Facas e Segredos
on conflict (file_path) do nothing;
