# Migrações pendentes

Arquivos prontos que **ainda não foram aplicados** no banco. Ficam fora de
`supabase/migrations/` para a pasta de migrações continuar batendo com o que
está aplicado.

- `20261105145000_mesa_upkeep_fixes.sql` (06/11/2026): correções de tom do
  Natal e do Halloween e da segurança dos +1 na Mesa dos Oráculos. Precisa da
  aprovação do Bruno na janela de confirmação (a função apaga linhas, só nas
  tabelas `mesa_*`). Aplicar antes de 01/12, mover o arquivo para
  `supabase/migrations/` e rodar `select public.mesa_build_titles();`.
  Detalhes em `claude/mesa-dos-oraculos.md` (Pendências).
- `20261115193000_game_tags_recheck.sql` (15/11/2026): devolve ao cadeado as
  tags de Jogos de quem ganhou com a regra antiga e não cumpre a nova (no dia,
  15 conquistas de 5 contas, 8 delas do Bruno). Precisa do ok do Bruno: apaga
  linhas de `user_special_tags` (guarda uma cópia em
  `game_tags_revoked_20261115`, para poder devolver) e tira a tag ativa de
  quem estava usando uma delas. Detalhes em `claude/personalizacao-e-tags.md`.
