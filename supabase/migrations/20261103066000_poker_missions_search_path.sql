-- 03/11/2026 — O Grande Blefe (pôquer), pacote C: get_advisors.
--
-- jackpot_week_missions nunca teve search_path fixo (aviso
-- function_search_path_mutable). Como ela agora chama poker_mission_from_week,
-- o search_path fica preso em public. O corpo não muda.

alter function public.jackpot_week_missions(date) set search_path = public;
