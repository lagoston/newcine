-- Fotos do elenco: cada artista é "cadastrado" uma única vez com a foto do
-- TMDB (profile_path) e, dali em diante, o site lê do próprio banco — em
-- qualquer filme em que ele apareça. Diferente do movie_cache (nota,
-- streamings… mudam sempre), a foto de um artista não precisa ser
-- atualizada: quem já tem foto nunca mais é tocado.
--
-- Quem ainda não tinha foto no TMDB fica com profile_path nulo e pode ser
-- conferido de novo depois de 30 dias (checked_at) — é o único caso em que
-- a linha muda, e só pra ganhar a foto.
--
-- Escrita só pelo servidor (edge function cast-photos, com a service role,
-- que busca os dados no próprio TMDB); leitura pública.

create table if not exists public.people (
  tmdb_id integer primary key,
  name text not null,
  profile_path text,
  created_at timestamptz not null default now(),
  checked_at timestamptz not null default now()
);

alter table public.people enable row level security;

drop policy if exists "people_read_all" on public.people;
create policy "people_read_all" on public.people for select using (true);

revoke insert, update, delete on public.people from anon, authenticated;

-- Cadastra artistas vindos do TMDB. Novo → insere. Já existe COM foto →
-- não mexe. Já existe SEM foto → ganha a foto se o TMDB tiver agora e
-- marca a conferência.
create or replace function public.register_people(p_people jsonb)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.people as pe (tmdb_id, name, profile_path)
  -- distinct on: o mesmo artista pode vir duas vezes (dois papéis)
  select distinct on (x.id) x.id, x.name, nullif(x.profile_path, '')
    from jsonb_to_recordset(p_people) as x(id integer, name text, profile_path text)
   where x.id is not null and x.name is not null
   order by x.id, (x.profile_path is null)
  on conflict (tmdb_id) do update
     set profile_path = coalesce(pe.profile_path, excluded.profile_path),
         checked_at = now()
   where pe.profile_path is null;
$$;

revoke execute on function public.register_people(jsonb) from public, anon, authenticated;
grant execute on function public.register_people(jsonb) to service_role;
