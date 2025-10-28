-- ensure public.profiles exists
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  avatar_url   text,
  bio          text,
  created_at   timestamptz default now(),
  plan_type    text default 'free',
  avatar_frame text default 'none',
  banner_slug  text default 'none'
);

-- move the table into public if it happens to live elsewhere
do $$
declare
  src_schema text;
begin
  select table_schema into src_schema
  from information_schema.tables
  where table_name = 'profiles' and table_schema <> 'public'
  limit 1;

  if src_schema is not null then
    execute format('alter table %I.profiles set schema public', src_schema);
  end if;
end$$;

-- make sure RLS is on
alter table public.profiles enable row level security;

-- policies (create only if missing)
do $$
begin
  if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename  = 'profiles'
        and policyname = 'Profiles are viewable by everyone') then

    create policy "Profiles are viewable by everyone"
      on public.profiles for select using (true);
  end if;

  if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename  = 'profiles'
        and policyname = 'Users can manage own profile') then

    create policy "Users can manage own profile"
      on public.profiles
      for all
      using  (auth.uid() = id)
      with   check (auth.uid() = id);
  end if;
end$$;