-- Orçamento do filme (TMDB: budget, em dólares), mostrado abaixo do
-- diretor no menu do filme.
--   null = ainda não buscado (o app busca no TMDB na hora e grava aqui)
--   0    = o TMDB não tem o orçamento ("Não divulgado")
-- Séries não têm orçamento: fica null e a linha não aparece.
-- Numa amostra de 310 filmes (30/09/2026), 89% do catálogo, 94% dos
-- filmes avaliados pelos usuários e 70% dos filmes do Cypher tinham.
alter table public.movie_cache add column if not exists budget bigint;
