-- Sagas, trilogias e continuações (botão no menu do filme, abaixo da
-- sinopse).
--
-- De onde vem: o TMDB marca cada filme com belongs_to_collection e a
-- coleção (/collection/{id}) lista todas as partes, inclusive as que ainda
-- vão estrear. A edge function movie-collection busca isso UMA vez por
-- filme/coleção e grava aqui; o site lê daqui. Coleções do TMDB são
-- conferidas de novo a cada 30 dias (sai filme novo na saga); filmes sem
-- coleção também são reconferidos a cada 30 dias.
--
-- Preencher à mão (sagas que o TMDB não junta, ex.: universos):
--   1. insert into movie_collections (id, name_pt, name_en, source)
--        values (-1, 'Universo Invocação', 'The Conjuring Universe', 'manual');
--      (use ids NEGATIVOS pras manuais, pra nunca bater com um id do TMDB)
--   2. insert into movie_collection_parts (collection_id, movie_id, position)
--        values (-1, 138843, 1), (-1, 250546, 2), ...;
--      movie_id é o id do filme no TMDB; position é a ordem (opcional — sem
--      ela, vale a data de estreia). Título, pôster e data podem ficar
--      vazios: a function preenche do TMDB na primeira vez que alguém abrir.
--   Coleções 'manual' nunca são sobrescritas pela function.

create table if not exists public.movie_collections (
  id integer primary key,
  name_en text,
  name_pt text,
  poster_path text,
  source text not null default 'tmdb' check (source in ('tmdb', 'manual')),
  fetched_at timestamptz not null default now()
);

create table if not exists public.movie_collection_parts (
  collection_id integer not null references public.movie_collections(id) on delete cascade,
  movie_id integer not null,
  position integer,
  title_en text,
  title_pt text,
  release_date date,
  poster_path text,
  poster_path_pt text,
  primary key (collection_id, movie_id)
);

create index if not exists movie_collection_parts_movie_idx on public.movie_collection_parts (movie_id);

-- Filmes já conferidos no TMDB que não pertencem a nenhuma coleção.
create table if not exists public.movie_collection_checks (
  movie_id integer primary key,
  checked_at timestamptz not null default now()
);

alter table public.movie_collections enable row level security;
alter table public.movie_collection_parts enable row level security;
alter table public.movie_collection_checks enable row level security;

drop policy if exists "movie_collections_read_all" on public.movie_collections;
create policy "movie_collections_read_all" on public.movie_collections for select using (true);
drop policy if exists "movie_collection_parts_read_all" on public.movie_collection_parts;
create policy "movie_collection_parts_read_all" on public.movie_collection_parts for select using (true);
drop policy if exists "movie_collection_checks_read_all" on public.movie_collection_checks;
create policy "movie_collection_checks_read_all" on public.movie_collection_checks for select using (true);

-- Escrita só pelo servidor (service role) ou à mão pelo painel do Supabase.
revoke insert, update, delete on public.movie_collections from anon, authenticated;
revoke insert, update, delete on public.movie_collection_parts from anon, authenticated;
revoke insert, update, delete on public.movie_collection_checks from anon, authenticated;
