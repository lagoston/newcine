-- Poster Jackpot: lançamento para todo mundo (31/10/2026).
--
-- Abre a roleta (is_open), dá 3 tickets de boas-vindas a cada conta que não
-- é bot e manda o convite "Poster Jackpot chegou" nos sussurros
-- (friend_indications.type = 'jackpot_invite', sem remetente; o site
-- desenha o cartão com o palco, os pôsteres e o "Jogar agora").
-- Roda uma vez só: launched_at marca o lançamento.

do $$
begin
  if exists (select 1 from poster_jackpot_settings where launched_at is null) then
    update poster_jackpot_settings set is_open = true, launched_at = now();

    insert into jackpot_wallets (user_id, tickets)
    select p.id, 3
      from profiles p
     where not exists (select 1 from bot_accounts b where b.user_id = p.id)
    on conflict (user_id) do update set tickets = jackpot_wallets.tickets + 3, updated_at = now();

    insert into friend_indications (from_user_id, to_user_id, type, media_type, read)
    select null, p.id, 'jackpot_invite', null, false
      from profiles p
     where not exists (select 1 from bot_accounts b where b.user_id = p.id);
  end if;
end $$;
