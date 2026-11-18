-- 18/11/2026 — Protocolo Reborn, onda 1 do banco (achado A7 de
-- claude/otimizacao/banco.md).
--
-- As prateleiras dos oráculos moram em recommendation_pools como listas JSON
-- (movie_ids, tv_ids). 37 funções desmontavam esse JSON a cada chamada; a
-- shelf_titles(), usada por 13 delas (persona, mundo da Persona, salas,
-- tags…), levava 52 ms por chamada (11.688 linhas tiradas do JSON) e o
-- get_persona_world a chamava duas vezes (~100 dos 165 ms). Pior: como o
-- resultado vinha de uma função, o planejador chutava 1.000 linhas e escolhia
-- laços ruins (1,35 milhão de comparações dentro de predict_ratings).
--
-- Agora as mesmas listas também ficam numa tabela de verdade, pool_titles
-- (uma linha por título de cada prateleira, na ordem do JSON), mantida por um
-- gatilho em recommendation_pools. O JSON continua sendo a fonte (o site e o
-- APK antigo leem recommendation_pools direto) e nada muda para quem grava.
--
-- shelf_titles() passa a ler pool_titles com a mesma assinatura e a mesma
-- saída. Ela deixa de ser SECURITY DEFINER e perde o SET search_path para o
-- Postgres poder "abrir" a função dentro de quem a chama (inlining): o
-- planejador enxerga a tabela, o índice e o número real de linhas. Ela só é
-- executável por postgres e service_role (como antes), e quem a chama são
-- funções SECURITY DEFINER do dono, que leem pool_titles sem RLS.
--
-- O gatilho se chama a_pool_titles_sync para rodar ANTES dos outros gatilhos
-- AFTER de recommendation_pools (pools_persona_refresh,
-- pools_seal_oracle_comments, trigger_update_random_surprise), que leem a
-- shelf_titles() e precisam ver a prateleira nova. Os gatilhos AFTER da mesma
-- linha rodam em ordem alfabética.

create table if not exists public.pool_titles (
  card_type  text    not null,
  mood_key   text    not null,
  media_type text    not null check (media_type in ('movie', 'tv')),
  ord        integer not null,
  tmdb_id    integer not null,
  primary key (card_type, mood_key, media_type, ord)
);

comment on table public.pool_titles is
  '18/11/2026: cópia em linhas de recommendation_pools.movie_ids/tv_ids (uma linha por título de cada prateleira, na ordem do JSON). Mantida pelo gatilho a_pool_titles_sync; não gravar direto.';

create index if not exists pool_titles_title on public.pool_titles (media_type, tmdb_id);
create index if not exists pool_titles_mood on public.pool_titles (mood_key, media_type);

alter table public.pool_titles enable row level security;
revoke all on public.pool_titles from anon, authenticated;

create or replace function public.sync_pool_titles()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- nada mudou nas listas: não mexe (o updated_at sozinho também dispara)
  if tg_op = 'UPDATE'
     and old.card_type = new.card_type and old.mood_key = new.mood_key
     and old.movie_ids is not distinct from new.movie_ids
     and old.tv_ids is not distinct from new.tv_ids then
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.pool_titles pt
     where pt.card_type = old.card_type and pt.mood_key = old.mood_key;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.pool_titles (card_type, mood_key, media_type, ord, tmdb_id)
    select new.card_type, new.mood_key, 'movie', e.ord::integer, (e.v #>> '{}')::integer
      from jsonb_array_elements(coalesce(new.movie_ids, '[]'::jsonb)) with ordinality as e(v, ord)
    union all
    select new.card_type, new.mood_key, 'tv', e.ord::integer, (e.v #>> '{}')::integer
      from jsonb_array_elements(coalesce(new.tv_ids, '[]'::jsonb)) with ordinality as e(v, ord);
  end if;

  return null;
end;
$function$;

revoke all on function public.sync_pool_titles() from public, anon, authenticated;

create trigger a_pool_titles_sync
  after insert or update or delete on public.recommendation_pools
  for each row execute function public.sync_pool_titles();

-- carga inicial (a tabela acabou de ser criada)
insert into public.pool_titles (card_type, mood_key, media_type, ord, tmdb_id)
select rp.card_type, rp.mood_key, 'movie', e.ord::integer, (e.v #>> '{}')::integer
  from public.recommendation_pools rp
  cross join lateral jsonb_array_elements(coalesce(rp.movie_ids, '[]'::jsonb)) with ordinality as e(v, ord)
union all
select rp.card_type, rp.mood_key, 'tv', e.ord::integer, (e.v #>> '{}')::integer
  from public.recommendation_pools rp
  cross join lateral jsonb_array_elements(coalesce(rp.tv_ids, '[]'::jsonb)) with ordinality as e(v, ord);

analyze public.pool_titles;

-- shelf_titles(): mesma assinatura e mesma saída, agora lendo a tabela.
-- (antes: language sql stable security definer set search_path to 'public',
--  com dois jsonb_array_elements sobre recommendation_pools)
create or replace function public.shelf_titles()
returns table(card_type text, mood_key text, media_type text, tmdb_id integer)
language sql
stable
security invoker
as $function$
  select pt.card_type, pt.mood_key, pt.media_type, pt.tmdb_id
    from public.pool_titles pt
$function$;

alter function public.shelf_titles() reset all;
