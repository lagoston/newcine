-- A Mesa dos Oráculos · esquema (SPEC §5.2) · 05/11/2026
--
-- Todas as tabelas da Mesa têm RLS ligado e NENHUMA política: nem anon nem
-- authenticated leem ou escrevem direto. O acesso é só pelas funções
-- SECURITY DEFINER das migrações 110000/120000 (porque a tiragem, as reservas
-- e a profecia não podem ser vistas nem forjadas pelo cliente).
--
-- Também ficam aqui os dois gatilhos (catálogo sujo e a profecia que se
-- cumpre) e mesa_category(), porque o gatilho de user_movies precisa dela
-- desde o primeiro minuto.

-- 1) Catálogo pré-calculado (uma linha por título das 27 prateleiras; refeito
--    toda noite e quando as prateleiras mudam).
create table if not exists public.mesa_titles (
  media_type   text not null check (media_type in ('movie','tv')),
  tmdb_id      int  not null,
  oracle       text not null check (oracle in ('bogart','fincher','cypher')),
  mood         text not null,
  year         smallint,
  decade       smallint,                 -- 1970, 1980…
  runtime      smallint,                 -- filmes (min)
  ep_runtime   smallint,                 -- séries: episode_run_time, ou runtime/number_of_episodes
  total_min    int,                      -- séries: ep_runtime × number_of_episodes
  seasons      smallint,
  ended        boolean,                  -- status in ('Ended','Canceled') ou palavra miniseries
  vote_count   int  not null default 0,
  vote_avg     real,
  pop_pct      real not null default 0,  -- percent_rank(vote_count) dentro de (oracle, media_type)
  countries    text[] not null default '{}',
  director_key text,                     -- lower(trim(movie_cache.director))
  collection_id int,                     -- movie_collection_parts (filmes)
  coll_pos     smallint,
  genre_ids    int[]  not null default '{}',
  kw           int[]  not null default '{}',
  kwn          text[] not null default '{}',   -- nomes em minúsculas (regras das ocasiões)
  age          smallint,                 -- idade BR (ou EUA convertida), §4.1
  is_bw boolean not null default false, is_anime boolean not null default false, is_br boolean not null default false,
  heavy boolean not null default false, heavy_family boolean not null default false, sad boolean not null default false,
  ressalva     boolean not null default false,  -- de mesa_comment_flags
  recog_rank   smallint,                 -- posição por votos dentro de (oracle, mood), só filmes; 0 = reforço curado
  built_at     timestamptz not null default now(),
  primary key (media_type, tmdb_id)
);
create index if not exists mesa_titles_om on public.mesa_titles (oracle, mood, media_type);
create index if not exists mesa_titles_dir on public.mesa_titles (director_key);

-- 2) Índice invertido das palavras específicas (2 ≤ df ≤ 400).
create table if not exists public.mesa_title_kw (
  kw_id int not null, media_type text not null, tmdb_id int not null,
  primary key (kw_id, media_type, tmdb_id)
);
create index if not exists mesa_title_kw_t on public.mesa_title_kw (media_type, tmdb_id);

-- 3) Glossário + IDF (todas as palavras do acervo; rótulo e marcas nas curadas
--    pelo WP-CURA). A construção nunca sobrescreve rótulos, kind, tema nem marcas.
create table if not exists public.mesa_kw (
  kw_id int primary key,
  name_en text not null,
  df int not null default 0,
  idf real not null default 0,            -- ln(títulos do acervo / df)
  label_pt text, label_en text,
  kind text check (kind in ('tema','tom','lugar','data','formato','origem','outro')),
  tema text,                               -- grupo (ex.: 'amor', 'luto', 'tempo')
  exibivel boolean not null default false,
  spoiler  boolean not null default false,
  sensivel boolean not null default false,
  reviewed boolean not null default false,
  check (not (exibivel and (spoiler or sensivel))),
  check (not exibivel or (label_pt is not null and label_en is not null))
);
create index if not exists mesa_kw_name on public.mesa_kw (lower(name_en));

-- 4) Ocasiões (editorial; os textos ficam no i18n mesa.occasions.<key>).
create table if not exists public.mesa_occasions (
  key text primary key,                    -- 'chuva' … 'colo', 'season:halloween', 'season:christmas'
  grp text not null check (grp in ('who','time','feel','season')),
  sort smallint not null,
  media text check (media in ('movie','tv')),      -- null = segue o filtro da pessoa
  rt_min smallint, rt_max smallint, ep_max smallint, total_min smallint, total_max smallint,
  ended_only boolean not null default false,
  vc_min int, vc_min_cypher int, va_min real, age_max smallint,
  exclude_moods text[] not null default '{}',
  require_mood_or_genre jsonb,             -- {"moods":["family-time"],"genres":[16,10751],"genre_weight":0.5}
  exclude_flags text[] not null default '{}',      -- 'heavy' | 'heavy_family' | 'sad'
  mood_w jsonb not null default '{}',      -- {"catharsis":0.35,...}; {"*":1} = fit 1
  tones_plus text[] not null default '{}',
  tones_minus text[] not null default '{}',
  comment_signal text,                     -- 'chuva','amor','familia','galera','maratona','choro','riso','susto'
  pass_oracles text[] not null default '{}',       -- colo → {cypher}
  season_event text check (season_event in ('halloween','christmas')),
  is_active boolean not null default true
);

-- 5) Encaixe título × ocasião (só fit ≥ 0,5).
create table if not exists public.mesa_title_occasions (
  occasion_key text not null references public.mesa_occasions(key) on delete cascade,
  media_type text not null, tmdb_id int not null,
  fit real not null,
  source text not null check (source in ('regra','comentario','curadoria')),
  primary key (occasion_key, media_type, tmdb_id)
);
create index if not exists mesa_title_occ_t on public.mesa_title_occasions (media_type, tmdb_id);

-- 6) Curadoria à mão (seeds do WP-CURA).
create table if not exists public.mesa_occasion_overrides (
  occasion_key text not null, media_type text not null, tmdb_id int not null,
  sign smallint not null check (sign in (-1, 1)),
  source text not null check (source in ('comentario','curadoria')),
  note text,
  primary key (occasion_key, media_type, tmdb_id)
);
create table if not exists public.mesa_comment_flags (
  media_type text not null, tmdb_id int not null,
  ressalva boolean not null default false,
  signals text[] not null default '{}',    -- sinais confirmados: 'chuva','amor','familia','galera','maratona','choro','riso','susto'
  primary key (media_type, tmdb_id)
);
create table if not exists public.mesa_recognition_boost (
  media_type text not null default 'movie', tmdb_id int not null, note text,
  primary key (media_type, tmdb_id)
);

-- 7) Vetor de previsões por pessoa (2 linhas por pessoa: filme e série).
--    Guardado porque o custo fixo da v4 domina (§5.1): calcular uma vez e
--    depois só filtrar e sortear em memória.
create table if not exists public.mesa_user_vec (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie','tv')),
  fingerprint text not null,
  computed_at timestamptz not null,
  ids int[] not null,          -- em ordem crescente
  mu  real[] not null,         -- alinhados a ids (null quando a v4 devolve null)
  p9  real[] not null,
  p10 real[] not null,
  pr  smallint[] not null,     -- a nota exibida da v4 (predicted_rating), sem recalcular
  ms  int,
  primary key (user_id, media_type)
);
create table if not exists public.mesa_vec_dirty (user_id uuid primary key, at timestamptz not null default now());

-- 8) Estado leve por pessoa (fatos do Espelho).
create table if not exists public.mesa_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_visit_day date, prev_visit_day date, last_code text,
  last_refresh_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 9) As tiragens (uma por pessoa × dia × pergunta × mídia).
create table if not exists public.mesa_draws (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,                        -- dia de Brasília
  ask text not null,                        -- 'daily' | 'occ:<key>' | 'mood:<key>' | 'season:<key>'
  media text not null check (media in ('all','movie','tv')),
  mode text not null check (mode in ('normal','recon')),
  seed int not null,                        -- hashtextextended(...) & 2147483647
  host text check (host in ('bogart','fincher','cypher')),
  reserves jsonb not null default '{}',     -- {"bogart":[Reserve,...],"fincher":[...],"cypher":[...]}
  second_opinion text[] not null default '{}',  -- assentos que já usaram a 2ª opinião
  passed jsonb not null default '[]',       -- [{"seat":"cypher","reason":"colo"}]
  facts jsonb not null default '{}',        -- retrato dos fatos no momento da tiragem
  created_at timestamptz not null default now(),
  unique (user_id, day, ask, media)
);
create index if not exists mesa_draws_user_day on public.mesa_draws (user_id, day desc);

-- 10) As cartas mostradas (só as que entraram na mesa; as reservas ficam no
--     jsonb da tiragem).
create table if not exists public.mesa_cards (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.mesa_draws(id) on delete cascade,
  user_id uuid not null,
  day date not null,
  seat text not null check (seat in ('bogart','fincher','cypher','espelho')),
  kind text not null check (kind in ('main','recon','espelho4','reveal')),
  gen smallint not null default 0,          -- 0 = original; 1, 2… = substitutas no assento
  active boolean not null default true,     -- a carta que está no assento agora
  media_type text not null, tmdb_id int not null,
  oracle text not null, mood text not null, -- dono do título (na espelho4/reveal, o dono do comentário)
  pred smallint, mu real, p9 real, p10 real, -- a profecia registrada no dia (nunca reexibida como número)
  reason jsonb not null, evidence jsonb not null default '[]',
  state text not null default 'down' check (state in ('down','up','want','seen','refused','not_seen')),
  flipped_at timestamptz, reacted_at timestamptz,
  rating smallint, rated_at timestamptz,
  verdict text check (verdict in ('exact','near','over','under','ten')),
  verdict_ack boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists mesa_cards_draw on public.mesa_cards (draw_id, seat, gen);
create index if not exists mesa_cards_title on public.mesa_cards (user_id, media_type, tmdb_id);
create index if not exists mesa_cards_rated on public.mesa_cards (user_id, rated_at) where rated_at is not null;
create index if not exists mesa_cards_flipped on public.mesa_cards (user_id, day) where state <> 'down';

-- 11) Recusas e "não vi".
create table if not exists public.mesa_feedback (
  user_id uuid not null, media_type text not null, tmdb_id int not null,
  kind text not null check (kind in ('refused','not_seen')),
  until date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id)
);

-- 12) Metadados (versão do catálogo, disponibilidade das ocasiões, log do aquecimento).
create table if not exists public.mesa_meta (key text primary key, value jsonb not null, updated_at timestamptz not null default now());

-- RLS ligado, nenhuma política, e nada para anon/authenticated (o Supabase dá
-- privilégios padrão a esses papéis em tabelas novas do public; aqui eles saem).
do $$
declare t text;
begin
  foreach t in array array['mesa_titles','mesa_title_kw','mesa_kw','mesa_occasions','mesa_title_occasions',
                           'mesa_occasion_overrides','mesa_comment_flags','mesa_recognition_boost','mesa_user_vec',
                           'mesa_vec_dirty','mesa_user_state','mesa_draws','mesa_cards','mesa_feedback','mesa_meta'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- O catálogo começa sujo: a primeira rodada da fila (ou o passo depois do
-- deploy) constrói tudo.
insert into public.mesa_meta (key, value) values ('catalog', '{"version": 0, "dirty": true}'::jsonb)
on conflict (key) do nothing;

-- A categoria do veredito (§5.2). Existe para escolher a fala de reação do
-- oráculo, nunca para mostrar uma conta. Com previsão nula, 'near'.
create or replace function public.mesa_category(r int, p int)
returns text language sql immutable
set search_path = public, pg_temp as $$
  select case
    when r is null then null
    when p is null then 'near'
    when r = 10 and r - p >= -1 then 'ten'
    when r - p = 0 then 'exact'
    when abs(r - p) = 1 then 'near'
    when r - p >= 2 then 'over'
    else 'under'
  end
$$;
revoke all on function public.mesa_category(int, int) from public, anon, authenticated;

-- Gatilho das prateleiras: qualquer mudança em recommendation_pools marca o
-- catálogo como sujo; a fila de 10 min (process_mesa_dirty) refaz.
create or replace function public.mesa_pools_changed()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  begin
    insert into public.mesa_meta (key, value, updated_at)
    values ('catalog', '{"version": 0, "dirty": true}'::jsonb, now())
    on conflict (key) do update
      set value = public.mesa_meta.value || '{"dirty": true}'::jsonb, updated_at = now();
  exception when others then
    null; -- marcar o catálogo nunca pode impedir a edição de uma prateleira
  end;
  return null;
end $$;
revoke all on function public.mesa_pools_changed() from public, anon, authenticated;

create or replace trigger mesa_pools_changed
  after insert or update or delete on public.recommendation_pools
  for each statement execute function public.mesa_pools_changed();

-- Gatilho das notas (§5.2): (a) a profecia se cumpre na carta virada mais
-- recente daquele título; (b) a pessoa entra na fila do vetor. Bots ficam de
-- fora. O corpo inteiro fica num bloco com exception: o gatilho NUNCA impede
-- uma nota.
create or replace function public.mesa_on_rating()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  begin
    update public.mesa_cards c
       set rating = n.rating, rated_at = now(),
           verdict = public.mesa_category(n.rating, c.pred), verdict_ack = false
      from new_rows n
     where n.rating is not null
       and c.user_id = n.user_id and c.tmdb_id = n.movie_id and c.media_type = n.media_type
       and c.state in ('up','want','seen') and c.rating is null
       and not exists (select 1 from public.bot_accounts b where b.user_id = n.user_id)
       and c.id = (select c2.id from public.mesa_cards c2
                    where c2.user_id = c.user_id and c2.tmdb_id = c.tmdb_id
                      and c2.media_type = c.media_type and c2.state in ('up','want','seen')
                    order by c2.created_at desc limit 1);

    insert into public.mesa_vec_dirty (user_id)
    select distinct n.user_id from new_rows n
     where n.rating is not null and n.user_id is not null
       and not exists (select 1 from public.bot_accounts b where b.user_id = n.user_id)
    on conflict (user_id) do update set at = now();
  exception when others then
    null; -- nunca bloqueia a nota
  end;
  return null;
end $$;
revoke all on function public.mesa_on_rating() from public, anon, authenticated;

create or replace trigger mesa_on_rating_ins
  after insert on public.user_movies
  referencing new table as new_rows
  for each statement execute function public.mesa_on_rating();

create or replace trigger mesa_on_rating_upd
  after update on public.user_movies
  referencing new table as new_rows
  for each statement execute function public.mesa_on_rating();
