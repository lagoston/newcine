-- Tags especiais (Beta Tester…) visíveis no perfil dos outros.
--
-- A leitura de user_special_tags era só da própria linha, então ninguém
-- via o Beta Tester do @Math (nem de ninguém) no perfil dele — só o dono.
-- As tags de progresso já aparecem pra todo mundo (são calculadas de dados
-- públicos); as especiais passam a aparecer também.
--
-- De quebra: o usuário não pode mais inserir/alterar as próprias tags
-- especiais pelo navegador (dava pra se dar o Beta Tester depois do fim do
-- beta). Quem concede é só o servidor (trigger auto_unlock_beta_tester e
-- funções SECURITY DEFINER).

drop policy if exists "Users can read own special tags" on public.user_special_tags;
drop policy if exists "Anyone signed in can read special tags" on public.user_special_tags;
create policy "Anyone signed in can read special tags"
  on public.user_special_tags for select
  to authenticated
  using (true);

drop policy if exists "Users can insert own special tags" on public.user_special_tags;
drop policy if exists "Users can update own special tags" on public.user_special_tags;
