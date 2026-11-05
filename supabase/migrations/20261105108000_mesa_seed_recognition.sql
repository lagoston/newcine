-- Seed do reforço do reconhecimento (mesa_recognition_boost), SPEC §6.4
-- Gerado por scripts/mesa/cura/build-seeds.ts (WP-CURA, 05/11/2026) a partir das planilhas
-- scripts/mesa/cura/*.csv. Não edite à mão: edite a planilha e gere de novo.
-- Idempotente (insert … on conflict … do update) e só toca tabelas mesa_*; não apaga nada.

-- Até 15 filmes brasileiros ou muito vistos no Brasil, já nas prateleiras, que a regra de votos
-- (os 8 mais votados de cada oráculo × humor) não traria. Ganham recog_rank = 0.

insert into public.mesa_recognition_boost (media_type, tmdb_id, note) values
  ('movie', 598, 'Cidade de Deus · clássico nacional; o mais visto do cinema brasileiro lá fora'),
  ('movie', 7347, 'Tropa de Elite · fenômeno nacional (até no camelô)'),
  ('movie', 47931, 'Tropa de Elite 2: O Inimigo Agora é Outro · maior bilheteria nacional da sua época'),
  ('movie', 1000837, 'Ainda Estou Aqui · Oscar de 2025; visto por milhões no Brasil'),
  ('movie', 666, 'Central do Brasil · clássico nacional; Fernanda Montenegro'),
  ('movie', 40096, 'O Auto da Compadecida · reprise eterna na TV aberta'),
  ('movie', 203217, 'Minha Mãe é uma Peça: O Filme · comédia nacional de bilheteria gigante'),
  ('movie', 446159, 'Bacurau · cult nacional muito comentado'),
  ('movie', 310569, 'Que Horas Ela Volta? · drama nacional muito visto'),
  ('movie', 8440, 'Carandiru · bilheteria nacional dos anos 2000'),
  ('movie', 49367, '2 Filhos de Francisco · uma das maiores bilheterias nacionais'),
  ('movie', 52345, 'Lisbela e o Prisioneiro · reprise de TV; romance nacional querido'),
  ('movie', 459670, 'Turma da Mônica: Laços · Turma da Mônica em carne e osso; família inteira viu'),
  ('movie', 755339, 'Tudo Bem no Natal Que Vem · sucesso nacional da Netflix'),
  ('movie', 1277988, 'Caramelo · sucesso nacional da Netflix em 2025')
on conflict (media_type, tmdb_id) do update set note = excluded.note;
