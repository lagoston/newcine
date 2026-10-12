-- Página da pessoa (12/10/2026, pedido do Bruno): tocar num ator no menu do
-- filme abre a página dele, com os dados e o Top 10 de filmes.
--
-- Como as fotos do elenco (people) e as coleções (movie_collections), os
-- dados vêm do TMDB pelo servidor (edge function person-page), uma vez, e
-- ficam aqui: a próxima visita — de qualquer pessoa — sai do banco, sem
-- TMDB. A function refaz a busca quando a linha passa de 30 dias.
--
-- movie_cast / movie_directed: os filmes da pessoa já resumidos (id, título
-- em pt e en, pôster, data, nota e votos do TMDB, personagem, posição no
-- elenco, gêneros) — o Top 10 de ator e o de diretor saem daqui.

create table if not exists public.person_pages (
  tmdb_id integer primary key,
  name text not null,
  profile_path text,
  known_for_department text,
  birthday date,
  deathday date,
  place_of_birth text,
  biography_pt text,
  biography_en text,
  movie_cast jsonb not null default '[]'::jsonb,
  movie_directed jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.person_pages enable row level security;

-- Leitura livre (dados públicos do TMDB); só o servidor grava.
create policy "person_pages_read_all"
  on public.person_pages for select
  using (true);

grant select on public.person_pages to anon, authenticated;
