-- Cópia de segurança das prateleiras dos oráculos (16/11/2026).
--
-- O estudo da Conta Diretor achou a função de borda populate-recommendation-pools
-- (v7) aberta: com a chave pública do site ela regravava as 30 linhas de
-- recommendation_pools com listas genéricas do TMDB. A função foi desativada no
-- mesmo dia. Não havia cópia das prateleiras no banco; esta é a primeira, tirada
-- antes de as funções do diretor começarem a mexer nelas. Fechada para o site
-- (RLS ligado, sem política). Para voltar uma prateleira:
--   update recommendation_pools p set movie_ids = b.movie_ids, tv_ids = b.tv_ids
--     from recommendation_pools_backup_20261116 b
--    where b.card_type = p.card_type and b.mood_key = p.mood_key
--      and p.card_type = '<oráculo>' and p.mood_key = '<humor>';
create table if not exists public.recommendation_pools_backup_20261116 as
  select * from public.recommendation_pools;

alter table public.recommendation_pools_backup_20261116 enable row level security;
revoke all on public.recommendation_pools_backup_20261116 from anon, authenticated;

comment on table public.recommendation_pools_backup_20261116 is
  'Cópia das prateleiras dos oráculos em 16/11/2026, antes da Conta Diretor. Só leitura pelo banco.';
