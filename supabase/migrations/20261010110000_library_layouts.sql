-- Organizações da Biblioteca (10/10/2026, pedido do Bruno).
--
-- Os avaliados podiam aparecer de 2 jeitos (Notas e One Grid), escolhidos só
-- no aparelho (localStorage). Agora são 4 — Notas, One Grid, Top 100 e Por
-- década — e a escolha fica no perfil: o perfil da pessoa na comunidade
-- mostra a coleção do jeito que ela organiza a própria biblioteca.

-- null = Notas (o padrão de sempre)
alter table public.profiles add column if not exists library_layout text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_library_layout_check') then
    alter table public.profiles
      add constraint profiles_library_layout_check
      check (library_layout is null or library_layout in ('notes', 'onegrid', 'top100', 'decades'));
  end if;
end $$;

-- Top 100: os filmes na ordem que a pessoa escolheu. Fica guardado mesmo
-- quando ela troca de organização. O que não está em `items` (filmes
-- avaliados depois, por exemplo) completa a lista pela nota, até 100;
-- `excluded` são os que ela tirou do Top 100 e que não voltam sozinhos.
-- Tabela à parte (e não uma coluna em user_movies) pra reordenar não
-- disparar os gatilhos das notas.
create table if not exists public.library_top100 (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items integer[] not null default '{}',
  excluded integer[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.library_top100 enable row level security;

-- Quem pode ver a biblioteca da pessoa pode ver o Top 100 dela.
create policy "Top 100 segue a visibilidade da biblioteca"
  on public.library_top100 for select
  using (public.can_view_user_content(user_id));

create policy "Dono cria o próprio Top 100"
  on public.library_top100 for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Dono atualiza o próprio Top 100"
  on public.library_top100 for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.library_top100 to authenticated;
grant select on public.library_top100 to anon;

-- As linhas da biblioteca com o ano de lançamento (pra organização por
-- década), na ordem em que entraram. Respeita a visibilidade de user_movies
-- (security invoker).
create or replace function public.get_library_titles(p_user_id uuid)
returns table(movie_id integer, media_type text, rating integer, release_year integer)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select um.movie_id,
         coalesce(um.media_type, 'movie'),
         um.rating,
         extract(year from mc.release_date)::integer
  from public.user_movies um
  left join public.movie_cache mc
    on mc.tmdb_id = um.movie_id
   and mc.media_type = coalesce(um.media_type, 'movie')
  where um.user_id = p_user_id
  order by um.created_at desc
$$;

grant execute on function public.get_library_titles(uuid) to authenticated, anon;
