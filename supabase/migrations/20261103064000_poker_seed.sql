-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: linhas iniciais.
--
--   - Parâmetros dos bots: {} na versão 1 (vale o padrão do código).
--   - Itens: os 3 padrão (baralho Clássico, Feltro Verde, Réplicas da Casa) e
--     os 2 cosméticos próprios do pôquer (Baralho Noir e Feltro Meia-Noite;
--     só os registros, o desenho é da interface).
--   - Catálogo inicial (até a lista do Bruno): 2 fichas, 1 ficha especial, os
--     2 cosméticos, 24 pôsteres do Jackpot (6 por raridade pela ordem do
--     serial; sem efeito no comum e no raro, holográfico no épico e no
--     lendário). Moldura e banner dourados ficam no catálogo FORA da rotação:
--     são do Premium, e dar de prêmio é decisão do Bruno.
--   - Agenda de 03/11 a 16/11/2026 (troca às 00h de Brasília); depois, o
--     sorteio do catálogo.
--   - As 5 tags dos marcos, com textos provisórios (os finais vêm do pacote B)
--     e starts_at no futuro: ficam escondidas na lista de tags de quem não as
--     tem até a abertura (na abertura: starts_at = now()).

-- Parâmetros dos bots -------------------------------------------------------
insert into public.poker_bot_params (rival_id, version, params, note) values
  ('bogart', 1, '{}', 'padrão do código (03/11/2026)'),
  ('cypher', 1, '{}', 'padrão do código (03/11/2026)'),
  ('fincher', 1, '{}', 'padrão do código (03/11/2026)')
on conflict (rival_id) do nothing;

-- Itens do pôquer -----------------------------------------------------------
insert into public.poker_items (id, kind, name_pt, name_en, is_default, sort) values
  ('deck-classico', 'deck', 'Clássico CineOracle', 'CineOracle Classic', true, 0),
  ('deck-noir', 'deck', 'Baralho Noir', 'Noir Deck', false, 1),
  ('table-feltro-verde', 'table', 'Feltro Verde', 'Green Felt', true, 0),
  ('table-meia-noite', 'table', 'Feltro Meia-Noite', 'Midnight Felt', false, 1),
  ('quips-padrao', 'poker_quip', 'Réplicas da Casa', 'House Comebacks', true, 0)
on conflict (id) do nothing;

-- Catálogo de prêmios ---------------------------------------------------------
insert into public.poker_prizes (id, kind, payload, rarity, repeatable, name_pt, name_en, article_pt,
                                 blurb_pt, blurb_en, in_rotation, weight) values
  ('fichas-2', 'tickets', '{"amount":2}', 'common', true, '2 fichas', '2 chips', 'as',
   'Duas fichas para a roleta do Jackpot.', 'Two chips for the Jackpot wheel.', true, 1),
  ('ficha-especial-1', 'special_tickets', '{"amount":1}', 'rare', true, 'Ficha especial', 'Special chip', 'a',
   'Uma ficha especial: o pôster sai sempre com efeito.', 'A special chip: the poster always comes with an effect.', true, 1),
  ('deck-noir', 'deck', '{"item_id":"deck-noir"}', 'epic', false, 'Baralho Noir', 'Noir Deck', 'o',
   'Verso preto e prata, em art déco.', 'Black and silver back, art deco.', true, 1),
  ('table-meia-noite', 'table', '{"item_id":"table-meia-noite"}', 'legendary', false, 'Feltro Meia-Noite', 'Midnight Felt', 'o',
   'Feltro azul-noite para a mesa livre.', 'Night-blue felt for the free table.', true, 1),
  ('moldura-dourada', 'avatar_frame', '{"cosmetic_id":"gold"}', 'legendary', false, 'Moldura Dourada', 'Gold Frame', 'a',
   'A moldura dourada do perfil, para sempre.', 'The gold profile frame, for good.', false, 1),
  ('banner-dourado', 'banner', '{"cosmetic_id":"gold"}', 'epic', false, 'Banner Dourado', 'Gold Banner', 'o',
   'O banner dourado do perfil, para sempre.', 'The gold profile banner, for good.', false, 1)
on conflict (id) do nothing;

-- 24 pôsteres do Jackpot: 6 por raridade, pela ordem do serial.
insert into public.poker_prizes (id, kind, payload, rarity, repeatable, name_pt, name_en, article_pt, in_rotation, weight)
select 'poster-' || pi.id || '-' || fx.effect,
       'poster',
       jsonb_build_object('item_id', pi.id, 'effect', fx.effect),
       pi.rarity,
       false,
       case when fx.effect = 'holo' then 'Pôster holográfico de ' else 'Pôster de ' end || coalesce(j ->> 'title_pt', j ->> 'title_en'),
       case when fx.effect = 'holo' then 'Holo ' else '' end || coalesce(j ->> 'title_en', j ->> 'title_pt') || ' poster',
       'o',
       true,
       1
  from public.poster_items pi
  cross join lateral public.poster_item_json(pi) j
  cross join lateral (select case when pi.rarity in ('epic', 'legendary') then 'holo' else 'none' end as effect) fx
 where pi.is_active and pi.serial between 1 and 6
on conflict (id) do nothing;

update public.poker_settings set fallback_prize_id = 'fichas-2' where fallback_prize_id is null;

-- Agenda: 03/11 a 16/11/2026 (portador pela raridade) ------------------------
insert into public.poker_bounty_days (day, prize_id, reserve_prize_id, source, note) values
  ('2026-11-03', 'poster-8-none', 'poster-16-none', 'agenda', 'Batman: O Cavaleiro das Trevas'),
  ('2026-11-04', 'poster-11-none', 'poster-18-none', 'agenda', 'Pulp Fiction'),
  ('2026-11-05', 'fichas-2', 'poster-20-none', 'agenda', '2 fichas'),
  ('2026-11-06', 'deck-noir', 'poster-19-holo', 'agenda', 'Baralho Noir'),
  ('2026-11-07', 'table-meia-noite', 'poster-7-holo', 'agenda', 'Feltro Meia-Noite (sábado)'),
  ('2026-11-08', 'ficha-especial-1', 'poster-24-none', 'agenda', 'Ficha especial'),
  ('2026-11-09', 'poster-4-none', 'poster-10-none', 'agenda', 'Game of Thrones'),
  ('2026-11-10', 'poster-1-none', 'poster-12-none', 'agenda', 'Breaking Bad'),
  ('2026-11-11', 'poster-26-holo', 'poster-23-holo', 'agenda', 'A Substância'),
  ('2026-11-12', 'poster-13-none', 'poster-20-none', 'agenda', 'Guerra nas Estrelas'),
  ('2026-11-13', 'poster-17-holo', 'poster-14-holo', 'agenda', 'O Exorcista (sexta-feira 13)'),
  ('2026-11-14', 'poster-15-none', 'poster-18-none', 'agenda', 'Guerra nas Estrelas (raro)'),
  ('2026-11-15', 'poster-30-holo', 'poster-5-holo', 'agenda', 'Midsommar'),
  ('2026-11-16', 'fichas-2', 'poster-16-none', 'agenda', '2 fichas')
on conflict (day) do nothing;

-- As 5 tags dos marcos (textos provisórios; os finais vêm do pacote B) --------
insert into public.special_tags (id, name, emoji, description, description_pt, requirement_description,
                                 requirement_description_pt, starts_at, ends_at, requirement_type, requirement_data) values
  ('poker-first-win', 'Opening Night', '🃏',
   'Won a prize table at The Big Bluff for the first time.', 'Venceu pela primeira vez uma mesa valendo prêmio no Grande Blefe.',
   'Win a prize table at The Big Bluff.', 'Vença uma mesa valendo prêmio no Grande Blefe.',
   '2100-01-01', null, 'custom', '{"source":"poker","mark":"first_win"}'),
  ('poker-fox-hunter', 'Fox Hunter', '🦊',
   'Knocked the Fox out of a prize table.', 'Eliminou o Raposo numa mesa valendo prêmio.',
   'Knock the Fox out of a prize table.', 'Elimine o Raposo numa mesa valendo prêmio.',
   '2100-01-01', null, 'custom', '{"source":"poker","mark":"fox_hunter"}'),
  ('poker-clean-sweep', 'Clean Sweep', '🧹',
   'Knocked out all three oracles in the same prize table.', 'Eliminou os três oráculos na mesma mesa valendo prêmio.',
   'Knock out all three oracles in one prize table.', 'Elimine os três oráculos numa mesma mesa valendo prêmio.',
   '2100-01-01', null, 'custom', '{"source":"poker","mark":"clean_sweep"}'),
  ('poker-oscar-bluff', 'Oscar Bluff', '🏆',
   'Took a big pot without a showdown while holding the worse hand.', 'Levou um pote grande sem showdown com a mão pior.',
   'Win a pot of 20+ big blinds without a showdown, with a better hand folded.', 'Leve um pote de 20+ big blinds sem showdown, com uma mão melhor largada.',
   '2100-01-01', null, 'custom', '{"source":"poker","mark":"oscar_bluff"}'),
  ('poker-seven-nights', 'Seven Nights', '🌙',
   'Played a prize table seven nights in a row.', 'Jogou uma mesa valendo prêmio sete noites seguidas.',
   'Finish a prize table on 7 days in a row.', 'Termine uma mesa valendo prêmio em 7 dias seguidos.',
   '2100-01-01', null, 'custom', '{"source":"poker","mark":"seven_nights"}')
on conflict (id) do nothing;
