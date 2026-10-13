-- Bots aceitam 1 em cada 10 pedidos de amizade (13/10/2026).
--
-- Os bots se comportam como pessoas comuns da comunidade (aparecem nas
-- conexões, em "Cinéfilos com o seu gosto", recebem pedidos), mas só aceitam
-- cerca de 1 pedido a cada 10. Quem aceita é decidido pelo par (pessoa, bot),
-- então cancelar e pedir de novo não muda a resposta. O aceite chega depois
-- de um tempo (entre 5 e 90 minutos), como uma pessoa que viu o pedido mais
-- tarde. Os outros pedidos ficam pendentes, como alguém que não respondeu.
-- Nada é apagado.

create or replace function public.process_bot_friend_requests()
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with acc as (
    update public.friendships f
    set status = 'accepted', updated_at = now()
    where f.status = 'pending'
      and exists (select 1 from public.bot_accounts b where b.user_id = f.addressee_id)
      and not exists (select 1 from public.bot_accounts b2 where b2.user_id = f.requester_id)
      and abs(hashtext(f.addressee_id::text || ':' || f.requester_id::text)) % 10 = 0
      and f.created_at < now() - make_interval(mins => 5 + abs(hashtext(f.requester_id::text || f.addressee_id::text)) % 85)
    returning 1
  )
  select count(*)::integer from acc;
$$;

revoke all on function public.process_bot_friend_requests() from public, anon, authenticated;

select cron.schedule('bot-friend-requests', '*/10 * * * *', $$select public.process_bot_friend_requests()$$);
