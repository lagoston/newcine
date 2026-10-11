-- Nenhum ator repetido nas 84 personalidades (11/10/2026, pedido do Bruno).
-- Depois das 13 trocas de 20261011100000_persona_swaps.sql ainda havia 5
-- atores com mais de um personagem. Fica o papel mais icônico de cada um:
--   Johnny Depp (fica Jack Sparrow, PAL):
--     PFL Rango           → Flint Lockwood (Tá Chovendo Hambúrguer)
--     XCR Edward          → Elisa Esposito (A Forma da Água)
--     XPL Raoul Duke      → Beetlejuice (Os Fantasmas se Divertem)
--   Leonardo DiCaprio (fica Jack Dawson, ACR):
--     MCZ Dom Cobb        → Joe (Looper: Assassinos do Futuro)
--     MXC Teddy Daniels   → Malcolm Crowe (O Sexto Sentido)
--   Harrison Ford (fica Han Solo, AZL):
--     AZR Indiana Jones   → Joan Wilder (Tudo por uma Esmeralda)
--   Tom Hanks (fica Forrest Gump, CRL):
--     CFL Woody           → Carl Fredricksen (Up: Altas Aventuras)
--   Jack Black (fica Dewey Finn, CZL):
--     AFL Po              → Shrek (Shrek)

update public.cine_personas as c set
  title_pt = v.title_pt, title_en = v.title_en,
  character_pt = v.character_pt, character_en = v.character_en,
  film_title_pt = v.film_title_pt, film_title_en = v.film_title_en,
  film_year = v.film_year, tmdb_id = v.tmdb_id, poster_path = v.poster_path,
  blurb_pt = v.blurb_pt, blurb_en = v.blurb_en
from (values
  ('PFL', 'Inventor Delirante', 'Delirious Inventor', 'Flint Lockwood', 'Flint Lockwood',
   'Tá Chovendo Hambúrguer', 'Cloudy with a Chance of Meatballs', 2009, 22794, '/qhOhIKf7QEyQ5dMrRUqs5eTX1Oq.jpg',
   'Inventor trapalhão que faz chover comida sobre a cidade até o céu sair do controle.',
   'A clumsy inventor who makes food rain over his town until the sky spins out of control.'),
  ('XCR', 'Voz Silenciosa', 'Silent Voice', 'Elisa Esposito', 'Elisa Esposito',
   'A Forma da Água', 'The Shape of Water', 2017, 399055, '/9zfwPffUXpBrEP26yp0q1ckXDcj.jpg',
   'Faxineira muda de um laboratório secreto que se apaixona pela criatura anfíbia mantida ali em cativeiro.',
   'A mute cleaner at a secret lab who falls in love with the amphibian creature held captive there.'),
  ('XPL', 'Bio-Exorcista Debochado', 'Cheeky Bio-Exorcist', 'Beetlejuice', 'Beetlejuice',
   'Os Fantasmas se Divertem', 'Beetlejuice', 1988, 4011, '/nnl6OWkyPpuMm595hmAxNW3rZFn.jpg',
   'Fantasma trambiqueiro e desbocado contratado para expulsar os vivos de uma casa assombrada.',
   'A foul-mouthed con-artist ghost hired to scare the living out of a haunted house.'),
  ('MCZ', 'Executor do Futuro', 'Executioner of the Future', 'Joe', 'Joe',
   'Looper: Assassinos do Futuro', 'Looper', 2012, 59967, '/sNjL6SqErDBE8OUZlrDLkexfsCj.jpg',
   'Matador que executa alvos enviados do futuro, até o alvo ser ele mesmo, trinta anos mais velho.',
   'A hitman who executes targets sent back from the future, until the target is himself, thirty years older.'),
  ('MXC', 'Psicólogo das Sombras', 'Psychologist of Shadows', 'Malcolm Crowe', 'Malcolm Crowe',
   'O Sexto Sentido', 'The Sixth Sense', 1999, 745, '/vOyfUXNFSnaTk7Vk5AjpsKTUWsu.jpg',
   'Psicólogo infantil que tenta ajudar um menino assombrado e acaba encarando o que ele mesmo não quer ver.',
   'A child psychologist trying to help a haunted boy who ends up facing what he himself won''t see.'),
  ('AZR', 'Romancista Aventureira', 'Adventurous Novelist', 'Joan Wilder', 'Joan Wilder',
   'Tudo por uma Esmeralda', 'Romancing the Stone', 1984, 9326, '/qfIlVOYZH5RiZ0ndFKUpr5Zn2Bx.jpg',
   'Escritora de romances que vai à selva colombiana salvar a irmã e vive a aventura que só conhecia dos livros.',
   'A romance novelist who heads into the Colombian jungle to save her sister and lives the adventure she only knew from her books.'),
  ('CFL', 'Aventureiro Tardio', 'Late Adventurer', 'Carl Fredricksen', 'Carl Fredricksen',
   'Up: Altas Aventuras', 'Up', 2009, 14160, '/mFvoEwSfLqbcWwFsDjQebn9bzFe.jpg',
   'Viúvo rabugento que amarra milhares de balões à casa para cumprir a promessa feita à esposa.',
   'A grumpy widower who ties thousands of balloons to his house to keep a promise to his late wife.'),
  ('AFL', 'Ogro do Pântano', 'Swamp Ogre', 'Shrek', 'Shrek',
   'Shrek', 'Shrek', 2001, 808, '/iB64vpL3dIObOtMZgX3RqdVdQDc.jpg',
   'Ogro ranzinza que só quer o pântano de volta e acaba numa missão para resgatar uma princesa.',
   'A grumpy ogre who just wants his swamp back and ends up on a quest to rescue a princess.')
) as v(code, title_pt, title_en, character_pt, character_en, film_title_pt, film_title_en, film_year, tmdb_id, poster_path, blurb_pt, blurb_en)
where c.code = v.code;
