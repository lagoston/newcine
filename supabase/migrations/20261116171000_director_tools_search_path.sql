-- Conta Diretor, etapa C: caminho de busca das ferramentas (16/11/2026).
--
-- O ensaio (transação desfeita) de director_pool_add falhou: os gatilhos antigos
-- de recommendation_pools (update_random_surprise_pool e outros) e o de
-- poster_items (poster_items_assign_serial) não fixam o próprio search_path e
-- citam as tabelas sem o esquema. Rodando dentro de uma função com
-- search_path = '', eles não acham "recommendation_pools". As funções que gravam
-- nessas tabelas passam a usar search_path = public, como o resto do banco (tudo
-- o que elas mesmas citam já vem com o esquema).
alter function public.director_pool_add(text, text, text, int, text) set search_path = public;
alter function public.director_pool_remove(text, text, text, int, text) set search_path = public;
alter function public.director_pool_move(text, text, text, text, text, int, text) set search_path = public;
alter function public.director_poster_create(text, int, text, text, text) set search_path = public;
alter function public.director_poster_set_active(int, boolean, text) set search_path = public;
alter function public.director_undo(bigint) set search_path = public;
