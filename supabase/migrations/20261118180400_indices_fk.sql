-- 18/11/2026 — Protocolo Reborn, onda 2 do banco (achado A11 de
-- claude/otimizacao/banco.md: chaves estrangeiras sem índice).
--
-- Das 42 chaves estrangeiras sem índice, quase todas estão em tabelas de
-- catálogo que não crescem. Aqui entram só as de tabelas que crescem com o
-- uso e onde o índice tem para quê:
--   • user_posters(item_id): cresce a cada giro do Jackpot (925 linhas
--     inseridas). O catálogo em revisão conta os donos de cada pôster
--     (get_poster_catalog_review: 225 pôsteres × a tabela inteira), e apagar
--     ou trocar um pôster do catálogo confere a tabela inteira;
--   • user_special_tags(tag_id): apagar uma tag (ON DELETE CASCADE) e "quem
--     tem esta tag" varrem a tabela;
--   • feed_story_views(owner_id): cresce a cada story visto (814); apagar
--     uma conta (ON DELETE CASCADE) varre a tabela inteira;
--   • friend_indications(poker_room_id): só as linhas de convite de pôquer;
--     apagar uma sala (ON DELETE SET NULL) varre todos os sussurros;
--   • jackpot_contracts(pull_id): só as linhas com giro; apagar um giro
--     (ON DELETE SET NULL) varre todos os contratos.
-- Hoje as tabelas têm centenas de linhas e o ganho medido é pequeno (ver o
-- ensaio): é um seguro barato (8–16 kB cada) para quando crescerem.
--
-- Ficam sem índice, de propósito: poker_room_members (invited_by, stake_to,
-- stake_item_id: 12 linhas, as buscas são por sala e por pessoa, que já têm
-- índice), jackpot_pulls(item_id) e title_oracle_comments(phrase_id) (o pai
-- nunca é apagado e ninguém busca por essas colunas) e as tabelas pequenas
-- de catálogo do pôquer e do questionário antigo.
--
-- CREATE INDEX comum (sem CONCURRENTLY): cada tabela tem menos de 1.000
-- linhas, a trava dura milissegundos.

create index if not exists user_posters_item_idx
  on public.user_posters (item_id);

create index if not exists user_special_tags_tag_idx
  on public.user_special_tags (tag_id);

create index if not exists feed_story_views_owner_idx
  on public.feed_story_views (owner_id);

create index if not exists friend_indications_poker_room_idx
  on public.friend_indications (poker_room_id)
  where poker_room_id is not null;

create index if not exists jackpot_contracts_pull_idx
  on public.jackpot_contracts (pull_id)
  where pull_id is not null;
