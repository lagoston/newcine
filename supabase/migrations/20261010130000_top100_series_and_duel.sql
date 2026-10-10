-- Top 100 com séries e o modo Duelo (10/10/2026, pedido do Bruno).
--
-- Filmes e séries têm numerações independentes no TMDB (105 é um filme e
-- também uma série), então o Top 100 passa a guardar chaves "movie:105" /
-- "tv:105" em vez de só o número. As colunas antigas (items, excluded, só
-- números de filmes) ficam sem uso; a linha que já existia é convertida.
--
-- Duelo: a pessoa ordena o Top 100 em confrontos de 1 contra 1. O que já
-- foi confirmado pelos duelos (o começo da lista, em ordem) fica em
-- duel_sorted, pra continuar de onde parou; duel_count conta os duelos.

alter table public.library_top100
  add column if not exists item_keys text[] not null default '{}',
  add column if not exists excluded_keys text[] not null default '{}',
  add column if not exists duel_sorted text[] not null default '{}',
  add column if not exists duel_count integer not null default 0;

update public.library_top100 t
   set item_keys = coalesce((select array_agg('movie:' || x order by o) from unnest(t.items) with ordinality u(x, o)), '{}'),
       excluded_keys = coalesce((select array_agg('movie:' || x order by o) from unnest(t.excluded) with ordinality u(x, o)), '{}')
 where cardinality(t.item_keys) = 0
   and cardinality(t.excluded_keys) = 0
   and (cardinality(t.items) > 0 or cardinality(t.excluded) > 0);

-- Desafiantes (títulos de fora do Top 100) que perderam o duelo de entrada
-- ou foram empurrados para fora: não são chamados de novo até a pessoa
-- recomeçar os duelos.
alter table public.library_top100
  add column if not exists duel_rejected text[] not null default '{}';
