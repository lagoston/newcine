-- Poster Jackpot: segundo lote de pôsteres (30/10/2026), mandado pelo Bruno.
-- Cada file_path foi conferido na lista de pôsteres do título no TMDB
-- (/movie|tv/{id}/images) antes de entrar.

insert into public.poster_items (media_type, tmdb_id, rarity, file_path) values
  ('movie', 7347, 'rare', '/1TRTrI0HeeyOLjkDkQF53LKluGG.jpg'),        -- Tropa de Elite
  ('movie', 11, 'common', '/n0fP2rSekfbhVhxtnoQD00cdkEh.jpg'),         -- Star Wars
  ('movie', 11, 'legendary', '/8LGB9KHsNVllGcQnDq0rhxmsYoz.jpg'),      -- Star Wars
  ('movie', 11, 'rare', '/low7ZBfb9MIuKJ7gk3VDDTtYHgW.jpg'),           -- Star Wars
  ('movie', 577922, 'common', '/jeHQIDSIa4vJBQPztVOHr39Z6ah.jpg'),     -- Tenet
  ('movie', 9552, 'legendary', '/3fmrVaalYSNA6Pd5WYVCKX0lNz9.jpg'),    -- O Exorcista
  ('movie', 475557, 'rare', '/onwnTFCEF5CvB8AFi9BzZqm6cng.jpg'),       -- Coringa
  ('movie', 550, 'epic', '/vCsHerGMuhxI5VHUhKVdah3NCo3.jpg'),          -- Clube da Luta
  ('movie', 254, 'common', '/nnKabiybTw7debCed2twJFhJ7jZ.jpg'),        -- King Kong (2005)
  ('movie', 585, 'common', '/oZuu3MZRyJcJTlQj13zVgrkwSC3.jpg'),        -- Monstros S.A.
  ('movie', 8844, 'legendary', '/z7coPT0pynA7zacaTUOG53QBALH.jpg'),    -- Jumanji (1995)
  ('movie', 22, 'epic', '/2xsk01XgVthhgJu8iLMHbRGVuLS.jpg'),           -- Piratas do Caribe: A Maldição do Pérola Negra
  ('movie', 927, 'rare', '/b2aB7bvzqOM4O6KQpSdCmtVQi8X.jpg'),          -- Gremlins
  ('movie', 361743, 'common', '/27xTbZ9mVGcIa5RBbnL1v6QQY7C.jpg'),     -- Top Gun: Maverick
  ('movie', 933260, 'epic', '/nnCZbcBsqIJHzechhbfqy8fgXuL.jpg'),       -- A Substância
  ('movie', 242582, 'common', '/3DUG5AEWR16dcwu6Ex5mLOEy1V.jpg'),      -- O Abutre (Nightcrawler)
  ('movie', 245891, 'common', '/e9RZhzD8zRUqi5nKXQQV5bTkPNX.jpg'),     -- John Wick
  ('movie', 293660, 'legendary', '/eMsXFOhgrJy1AWIY047IQ1SqkY0.jpg'),  -- Deadpool
  ('movie', 530385, 'epic', '/ollsbcSi68oCWyc3s73kyWnvQ2E.jpg'),       -- Midsommar
  ('movie', 141, 'legendary', '/yMeEjYx0hK8YMxCrBF1RA89qAe8.jpg'),     -- Donnie Darko
  ('movie', 1368337, 'common', '/bPrnnhzdSpqsoQi362YasWsoGVG.jpg'),    -- A Odisseia (2026)
  ('movie', 1339713, 'common', '/mzCeCBrF4ssQ1TSnkX64Q8hVunL.jpg'),    -- Obsessão (2026)
  ('movie', 68718, 'rare', '/2N2VNTfkN0vuDXjCV2aDuBx6P3O.jpg'),        -- Django Livre
  ('movie', 949, 'common', '/tpKwlIuUu3stEOJmZLjGaW4W1ku.jpg'),        -- Fogo Contra Fogo (Heat)
  ('movie', 120, 'rare', '/wQiovNqzmUfzs1drytY9s5OObkF.jpg'),          -- O Senhor dos Anéis: A Sociedade do Anel
  ('movie', 11036, 'common', '/h865nXhPt5u8aMtnMksymUllvel.jpg'),      -- Diário de uma Paixão
  ('movie', 14160, 'common', '/Actd00TwhZsXqqPG33zpvWKqTr9.jpg'),      -- Up: Altas Aventuras
  ('movie', 671, 'rare', '/vq3E1U5WmAIPpqBoUHi77zYVIij.jpg'),          -- Harry Potter e a Pedra Filosofal
  ('movie', 447332, 'common', '/lqHLZXrm9h11JC9RRehDbDDgqfo.jpg'),     -- Um Lugar Silencioso
  ('tv', 1402, 'common', '/t4c4Qo6LfVxPO8Ge52UP7yuQloJ.jpg'),          -- The Walking Dead
  ('tv', 44217, 'rare', '/A2nDk7DxZTk61eDEHZle082Zmdx.jpg'),           -- Vikings
  ('movie', 157336, 'epic', '/AvNFQWhRh3b9fHNGWh4nn45JVjz.jpg'),       -- Interestelar
  ('tv', 125988, 'common', '/kFN62hDFgv0y8VxBMDO500WN7RQ.jpg'),        -- Silo
  ('movie', 752, 'rare', '/rW7EnEnGiq6UnbrwSbjD7NBHLq0.jpg'),          -- V de Vingança
  ('movie', 13223, 'common', '/42lLSg5JTxuXB4jcbTK42NVtM3O.jpg'),      -- Gran Torino
  ('movie', 289, 'common', '/xaldXbk4rGAFDZJ296vawnyZ7Py.jpg'),        -- Casablanca
  ('movie', 539, 'epic', '/hqqjKv2S6I2BrqHctSVRgjTrdHl.jpg'),          -- Psicose
  ('movie', 426, 'rare', '/kBi6wp83DCJ8NBvOcDmKR7ASX4w.jpg'),          -- Um Corpo Que Cai (Vertigo)
  ('movie', 1018, 'common', '/ewOwkCuv2SirKWhKiCb9Jvr6VKd.jpg'),       -- Cidade dos Sonhos (Mulholland Drive)
  ('tv', 1920, 'epic', '/PGn9O08blkbMLG96oIAmOFPIDl.jpg'),             -- Twin Peaks
  ('movie', 429, 'rare', '/obxBOJVjgPWt9VabIftGZHJ3V2h.jpg'),          -- Três Homens em Conflito
  ('movie', 238, 'common', '/mwnKeRRkrArgG866ha1sG46gwZh.jpg'),        -- O Poderoso Chefão
  ('movie', 103, 'legendary', '/8YetzVwBMH9CL6fPJIpFLlQ0wRR.jpg'),     -- Taxi Driver
  ('movie', 1359, 'epic', '/2Ao4ftruXckRzza9tjQbB69QGXQ.jpg'),         -- Psicopata Americano
  ('movie', 274, 'epic', '/pjXDl3lZPmHcLjAJdeMS5lDu6KJ.jpg'),          -- O Silêncio dos Inocentes
  ('movie', 218, 'rare', '/k9UIT5kx2LeSOP56eRMkgt1qyi7.jpg')           -- O Exterminador do Futuro
on conflict (file_path) do nothing;
