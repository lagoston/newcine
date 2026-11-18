-- 18/11/2026 — Protocolo Reborn, onda 1 do banco (achado A8 de
-- claude/otimizacao/banco.md).
--
-- A política "View user movies respecting profile visibility" chamava
-- can_view_user_content(user_id), uma função plpgsql, EM CADA LINHA lida de
-- user_movies. Medido: contar as 12,5 mil notas como authenticated levava
-- 358 ms com a política e 2,5 ms sem ela (~28 µs por linha); abrir a
-- biblioteca de outra pessoa (1.138 linhas) custava ~30 ms só de política.
--
-- A regra é a mesma, só que calculada uma vez por consulta: em vez de
-- perguntar "posso ver o dono desta linha?" para cada linha, a política
-- pergunta uma vez "de quem eu NÃO posso ver?" (rls_hidden_owner_ids) e
-- compara com uma lista. O (select …) faz o Postgres guardar a resposta
-- (InitPlan) durante a consulta inteira; o ::uuid[] faz o = any olhar
-- dentro da lista (sem ele, o Postgres trataria o (select …) como subconsulta).
--
-- Quem fica de fora é exatamente quem can_view_user_content recusa:
--   • conta escondida da Conta Diretor (director.accounts.hidden), menos a
--     própria pessoa;
--   • perfil com profile_visibility diferente de 'public' (nulo conta como
--     público), a não ser 'friends_only' com amizade aceita;
--   • sem papel no JWT ou service_role: ninguém fica de fora (como antes).
-- Dono sem linha em profiles continua visível (como antes).
--
-- A política "Users read own seasonal actions" (seasonal_event_actions) usava
-- auth.uid() sem o (select …), reavaliado por linha (aviso do advisor de
-- desempenho do Supabase); passa a usar (select auth.uid()).
--
-- O ALTER POLICY trava user_movies por um instante: lock_timeout curto para
-- não enfileirar as leituras do app atrás da migração se algo estiver
-- segurando a tabela (aí é só rodar de novo).

set local lock_timeout = '5s';

-- A função mora no esquema `private`, que a API (PostgREST) não expõe: as
-- políticas conseguem chamá-la, mas ninguém consegue pedi-la por RPC — a
-- resposta é a lista de contas escondidas e de perfis fechados, que não pode
-- vazar (revisão do coordenador, 18/11/2026).
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.rls_hidden_owner_ids()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when auth.role() is null or auth.role() = 'service_role' then '{}'::uuid[]
    else coalesce((
      select array_agg(x.id)
        from (
          select a.user_id as id
            from director.accounts a
           where a.hidden
          union
          select p.id
            from public.profiles p
           where coalesce(p.profile_visibility, 'public') <> 'public'
             and not (p.profile_visibility = 'friends_only'
                      and auth.uid() is not null
                      and public.are_friends(auth.uid(), p.id))
        ) x
       where x.id is distinct from auth.uid()
    ), '{}'::uuid[])
  end
$function$;

comment on function private.rls_hidden_owner_ids() is
  '18/11/2026: de quem a pessoa que pede NÃO pode ver o conteúdo (a mesma regra de can_view_user_content, de uma vez). Usada nas políticas como (select private.rls_hidden_owner_ids()).';

revoke all on function private.rls_hidden_owner_ids() from public;
grant execute on function private.rls_hidden_owner_ids() to anon, authenticated, service_role;

alter policy "View user movies respecting profile visibility" on public.user_movies
  using (not (user_id = any ((select private.rls_hidden_owner_ids())::uuid[])));

alter policy "Users read own seasonal actions" on public.seasonal_event_actions
  using ((select auth.uid()) = user_id);
