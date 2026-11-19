-- 19/11/2026 (Protocolo Reborn, onda 3): sussurros em tempo real de verdade.
--
-- O sino dos sussurros nunca foi "ao vivo": a tela assinava mudanças da tabela
-- friend_indications (postgres_changes), mas a publicação supabase_realtime não
-- tem nenhuma tabela, então o aviso nunca chegou (auditoria do banco, A5). A
-- assinatura morta saiu na Onda 1; desde então o número só era relido quando a
-- pessoa voltava para o app. Um convite para a mesa de pôquer, uma proposta de
-- troca ou um pedido de amizade ficavam parados até lá.
--
-- Agora o banco avisa, pelo mesmo caminho que o pôquer com amigos já usa:
-- Broadcast privado. Cada sussurro novo manda um "ping" para o tópico
-- user:<id de quem recebe>.
--   • O ping não leva conteúdo: só o tipo do sussurro. A tela relê o que
--     precisa pelas consultas de sempre, com as políticas de sempre.
--   • Só a própria pessoa entra no tópico dela (política em realtime.messages).
--   • O aviso nunca impede o sussurro de ser gravado (erro vira "warning").
--   • O app antigo (APK) não assina o tópico e não sente diferença.
-- A tela só mantém a conexão com o app na frente (src/lib/userChannel.ts).

create or replace function public.trigger_whisper_ping()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform realtime.send(
      jsonb_build_object('kind', 'whisper', 'type', new.type),
      'ping', 'user:' || new.to_user_id::text, true);
  exception when others then
    raise warning 'whisper ping: %', sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.trigger_whisper_ping() from public, anon, authenticated;

do $do$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.friend_indications'::regclass and tgname = 'zz_whisper_ping'
  ) then
    create trigger zz_whisper_ping
      after insert on public.friend_indications
      for each row execute function public.trigger_whisper_ping();
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'each user receives own pings'
  ) then
    create policy "each user receives own pings" on realtime.messages
      for select to authenticated
      using (extension = 'broadcast' and realtime.topic() = 'user:' || (select auth.uid())::text);
  end if;
end;
$do$;
