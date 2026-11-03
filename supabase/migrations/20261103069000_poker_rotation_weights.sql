-- O Grande Blefe: pesos da rotação do prêmio do dia (03/11/2026).
-- Com peso 1 para todos e janela sem repetição = tamanho do catálogo − 1, a
-- rotação virava um ciclo fixo de 28 dias com um lendário a cada 4 dias.
-- Agora o sorteio pesa pela raridade (comum 8, raro 5, épico 3, lendário 1:
-- ~47% / 29% / 18% / 6% dos dias) e a janela cai para 14 dias, para sobrar
-- escolha de verdade. Os cosméticos do poker sobem um pouco (são o prêmio
-- que só existe aqui). A agenda já gravada (até 16/11) não muda.
update public.poker_prizes
   set weight = case rarity when 'common' then 8 when 'rare' then 5 when 'epic' then 3 else 1 end
 where in_rotation and id not in ('deck-noir', 'table-meia-noite');

update public.poker_prizes set weight = 4 where id = 'deck-noir';
update public.poker_prizes set weight = 2 where id = 'table-meia-noite';

update public.poker_settings set no_repeat_days = 14 where no_repeat_days <> 14;
