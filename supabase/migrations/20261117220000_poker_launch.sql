-- 17/11/2026 (pedido do Bruno): o Pôster Poker abre para todos.
--
-- "Abra para todos." Até aqui só os dois testadores de poker_settings.testers
-- (a conta do Bruno e a Conta Diretor) tinham o pôquer: para os outros, a rota
-- mostrava "Em breve" e a mesa não aparecia no estúdio. São os três primeiros
-- passos de "Para lançar" (claude/poker.md); cada um só age uma vez.
--
-- 1. O salão abre (poker_enabled passa a responder sim para toda conta logada)
--    e o lançamento fica marcado.
update public.poker_settings
   set is_open = true, launched_at = now()
 where id and not is_open;

-- 2. As tags do pôquer começam agora (estavam em 2100-01-01): todos veem e
--    podem ganhar, e a conquista volta a virar sussurro e story.
update public.special_tags
   set starts_at = now()
 where id like 'poker-%' and starts_at > now();

-- 3. A missão semanal "jogue pôquer" (poker_play) entra no rodízio das
--    missões do Jackpot a partir da próxima segunda, 23/11/2026, para não
--    trocar as missões no meio da semana.
update public.poker_settings
   set mission_from_week = date '2026-11-23'
 where id and mission_from_week is null;
