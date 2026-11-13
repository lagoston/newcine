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
