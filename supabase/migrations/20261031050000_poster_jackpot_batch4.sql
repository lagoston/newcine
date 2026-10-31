-- Poster Jackpot: quarto lote de pôsteres (31/10/2026), mandado pelo Bruno.
-- Cada file_path foi conferido na lista de pôsteres do título no TMDB.
-- "Os Suspeitos" é Prisoners (2013, Denis Villeneuve): o arquivo está nos
-- pôsteres dele, não nos de The Usual Suspects.

insert into public.poster_items (media_type, tmdb_id, rarity, file_path) values
  ('movie', 530915, 'common', '/oG1mL3IgPJQsEdqilmXOpw5uDV0.jpg'),     -- 1917
  ('movie', 193756, 'common', '/gstswc6eVY0fuvyA4wDTloTsJR2.jpg'),     -- O Grande Herói (Lone Survivor)
  ('movie', 1495, 'epic', '/tT7dHpF8NvoeejIRzWVox60PSFV.jpg'),         -- Cruzada (Kingdom of Heaven)
  ('movie', 389, 'rare', '/qDlfeN63PNSAwSXx7CnQTfYSm5P.jpg'),          -- 12 Homens e uma Sentença (1957)
  ('movie', 49051, 'common', '/2Qydfq6g8RtiCnwkHgoXZtkCKIZ.jpg'),      -- O Hobbit: Uma Jornada Inesperada
  ('tv', 63247, 'common', '/kYacwb1n1fJ9q6WuPHHfxO3RCEL.jpg'),         -- Westworld (série)
  ('tv', 1409, 'rare', '/5KvUWbFTmxBme1k7hYeYsowP00P.jpg'),            -- Filhos da Anarquia
  ('movie', 5176, 'common', '/1Dcis10ui1p0wtsrhH0h2akt2VV.jpg'),       -- Os Indomáveis (3:10 to Yuma, 2007)
  ('movie', 176, 'legendary', '/wCCwzY9Odugy9VSWGaYOZksIhsn.jpg'),     -- Jogos Mortais (2004)
  ('movie', 14836, 'rare', '/rr5M0tL6aLV0NXitgpU9CrqFCAG.jpg'),        -- Coraline e o Mundo Secreto
  ('movie', 1726, 'common', '/on1aCYwoqy37c4arkuggfGYGhoT.jpg'),       -- Homem de Ferro
  ('tv', 1622, 'common', '/ojuJiSTDVm6fQFGlnl7Jx7ZDaEd.jpg'),          -- Sobrenatural
  ('tv', 1100, 'common', '/xXhyQZFEbyfoR4Orw9Zcs680x04.jpg'),          -- Como Eu Conheci Sua Mãe
  ('tv', 46648, 'common', '/7Q7Rqd3mWEdbjR2gg07cqCojWRB.jpg'),         -- True Detective
  ('tv', 94997, 'rare', '/abZMSJ0xRlTgmarBFEW3giEaraQ.jpg'),           -- A Casa do Dragão
  ('movie', 911430, 'common', '/brx8IYFuZ3AJb7dnz52VFmjonFY.jpg'),     -- F1: O Filme
  ('movie', 146233, 'rare', '/n6hGNvqh0CFpV9rx0KcQ4mmCGk.jpg'),        -- Os Suspeitos (Prisoners, 2013)
  ('tv', 76479, 'rare', '/3IEDVyZn7f4vNSnfGr56DOPg6SY.jpg'),           -- The Boys
  ('movie', 64690, 'common', '/f3EtWuNN5dfexrGwheNwPtCFSem.jpg'),      -- Drive
  ('movie', 335984, 'epic', '/fNVa05Jn1w26us4qnVcIybI1c4s.jpg'),       -- Blade Runner 2049
  ('movie', 120467, 'epic', '/dmNwwIqPGeVSDep2ubXtC3jfvep.jpg'),       -- O Grande Hotel Budapeste
  ('movie', 9532, 'rare', '/dkyeuyRe6bEOvuHOdxtZkLqIFiT.jpg')          -- Premonição (2000)
on conflict (file_path) do nothing;
