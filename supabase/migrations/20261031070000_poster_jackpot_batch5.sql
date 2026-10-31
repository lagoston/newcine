-- Poster Jackpot: quinto lote de pôsteres (31/10/2026), mandado pelo Bruno.
-- Cada file_path foi conferido na lista de pôsteres do título no TMDB.

insert into public.poster_items (media_type, tmdb_id, rarity, file_path) values
  ('movie', 597, 'rare', '/pKc3q0zo4Pk8v98BtHJYAygqVN4.jpg'),         -- Titanic (1997)
  ('movie', 2062, 'rare', '/asDAtgSva2qGHPpFJrefP11txaH.jpg'),        -- Ratatouille
  ('movie', 324857, 'rare', '/yQGCbVij3wGpwgWTxbz4DAilac9.jpg'),      -- Homem-Aranha: No Aranhaverso
  ('movie', 872, 'common', '/4mQygdeVyDEePZtvtDTuSCsK9Ze.jpg'),       -- Cantando na Chuva
  ('tv', 60059, 'epic', '/s9sO3xdOE6bZx1WcMn06c03ILUL.jpg'),          -- Better Call Saul
  ('movie', 38, 'common', '/dV9vtrLSg3LUZm4o8FGcngRCATB.jpg'),        -- Brilho Eterno de uma Mente sem Lembranças
  ('movie', 1878, 'epic', '/zinZTzufTQXIMUKgX2lw3SGCZpL.jpg'),        -- Medo e Delírio (Fear and Loathing in Las Vegas)
  ('movie', 36685, 'legendary', '/kGr2e1edqP5nF7K4ANOJK4Z9mG9.jpg'),  -- The Rocky Horror Picture Show
  ('movie', 762, 'rare', '/n4OP3ukdLsd2sOwXdUazXtbW4wx.jpg'),         -- Monty Python em Busca do Cálice Sagrado
  ('movie', 30497, 'common', '/37L9viRi53Y5HXJbL8tEArhaf9V.jpg'),     -- O Massacre da Serra Elétrica (1974)
  ('movie', 1954, 'rare', '/eGM0zMm2v0J4q9HHJR0eywLmJ3f.jpg'),        -- Efeito Borboleta
  ('movie', 9377, 'common', '/cfIkcRPv5Wvv6b1EtWxLq1JCPU2.jpg')       -- Curtindo a Vida Adoidado
on conflict (file_path) do nothing;
