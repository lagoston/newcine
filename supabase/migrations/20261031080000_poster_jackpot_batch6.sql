-- Poster Jackpot: sexto lote de pôsteres (31/10/2026), mandado pelo Bruno.
-- Cada file_path foi conferido na lista de pôsteres do título no TMDB.

insert into public.poster_items (media_type, tmdb_id, rarity, file_path) values
  ('movie', 1271, 'epic', '/zn6Zh8Hc3RjUJmmA0OjOlqgzPaf.jpg'),       -- 300
  ('movie', 769, 'common', '/dQThBGXVNSUW5tbcn1cedl71H55.jpg'),       -- Os Bons Companheiros
  ('movie', 34647, 'epic', '/dgQHZXPqyS8eQI6vuud8WOGkZIs.jpg'),       -- Viagem Alucinante (Enter the Void)
  ('movie', 6479, 'common', '/dm6HWClm0q6ZQoZGYLBAITlIaaK.jpg'),      -- Eu Sou a Lenda
  ('movie', 181886, 'rare', '/ll4XHatRdf7sICbbitOv1sScE3f.jpg'),      -- O Homem Duplicado (Enemy)
  ('movie', 334, 'common', '/ovsMsKrngqx4jMWd2IO3hjqtD4h.jpg'),       -- Magnólia
  ('movie', 9615, 'epic', '/iGIhnBGVqAvnRILCQFtG40DUaVB.jpg'),        -- Velozes e Furiosos: Desafio em Tóquio
  ('movie', 263115, 'common', '/4iYctRB9A6Xg0ubOdtyMlZvDcEr.jpg'),    -- Logan
  ('movie', 616, 'common', '/nJjjqXsQ8nPzIao4RFys9i7IXqO.jpg'),       -- O Último Samurai
  ('movie', 118340, 'epic', '/m5VsAzLrS91LvbUVm1Kruuy1iVC.jpg'),      -- Guardiões da Galáxia
  ('movie', 49018, 'common', '/n07S7VcLyMkZERtZ5yNFAmRwADj.jpg'),     -- Sobrenatural (Insidious, 2011)
  ('movie', 310131, 'epic', '/4XxOVqcgEvSFD2jLfQzB44KKGfb.jpg'),      -- A Bruxa
  ('movie', 2501, 'common', '/fyNdyNsWm1xmalz0yVaJuXY3qzg.jpg')       -- A Identidade Bourne
on conflict (file_path) do nothing;
