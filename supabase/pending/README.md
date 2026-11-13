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

- `20261113120000_friday13_scary_clown_in_use.sql` (13/11/2026): o presente
  da sexta-feira 13 só para quem está **usando** a Scary Clown no perfil, e a
  correção das fichas dadas em 13/11 a quem não estava usando (devolve só o
  que ainda está no porta-fichas; nada é apagado). Escrito com o Supabase fora
  do ar nesta sessão. Aplicar com `apply_migration` assim que a conexão
  voltar (o quanto antes: a regra vale para o resto do dia 13/11), conferir o
  md5 e mover para `supabase/migrations/`.
- `20261113121000_acervo_tie_shuffle.sql` (13/11/2026): no Acervo, os títulos
  de mesma nota prevista em ordem sorteada por pessoa e por dia (mesma
  assinatura de `mesa_acervo2`). Aplicar quando o Supabase voltar e mover para
  `supabase/migrations/`.
