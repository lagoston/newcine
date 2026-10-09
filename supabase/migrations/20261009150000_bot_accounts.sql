-- Perfis-bot (09/10/2026).
--
-- Bots são contas comuns do site (auth.users + profiles, criadas pelo
-- handle_new_user de sempre) que nascem com a biblioteca de um perfil
-- público de cinema e servem de "terreno" para a comunidade e para o
-- Oráculo (as notas deles entram na fórmula como as de qualquer pessoa).
-- No site eles aparecem como usuários comuns; quem é bot fica registrado
-- só em bot_accounts, que nenhum cliente lê (RLS ligada e sem policies —
-- só service_role e funções security definer).
--
-- Duas coisas NÃO acontecem para bots, porque a carga da biblioteca entra
-- de uma vez e não é uma pessoa avaliando um filme por vez:
--   * prediction_accuracy_log (o acerto da previsão "antes de avaliar");
--   * ações de evento sazonal (record_seasonal_action).
--
-- A semeadura em si (criar o bot, resolver os códigos do IMDb, cachear os
-- títulos e gravar as notas) fica no schema curation e na função de borda
-- seed-bot-titles, que só aceita chamadas com uma chave de bot_seed_keys.

create table if not exists public.bot_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  handle text not null unique,
  created_at timestamptz not null default now()
);
alter table public.bot_accounts enable row level security;
revoke all on public.bot_accounts from anon, authenticated;

create table if not exists public.bot_seed_keys (
  key text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.bot_seed_keys enable row level security;
revoke all on public.bot_seed_keys from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gatilhos de user_movies que pulam bots
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trigger_log_prediction_accuracy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_library_size_before integer;
  v_pool_matches jsonb;
  v_was_in_pool boolean;
  v_log_id uuid;
  v_should_fire boolean;
BEGIN
  v_should_fire := (TG_OP = 'INSERT' AND NEW.rating IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND OLD.rating IS NULL AND NEW.rating IS NOT NULL);

  IF NOT v_should_fire THEN
    RETURN NEW;
  END IF;

  -- bots: a biblioteca entra de uma vez, não há previsão "antes" a medir
  IF EXISTS (SELECT 1 FROM bot_accounts b WHERE b.user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_library_size_before
  FROM user_movies
  WHERE user_id = NEW.user_id
    AND rating IS NOT NULL
    AND NOT (movie_id = NEW.movie_id AND media_type = NEW.media_type);

  SELECT jsonb_agg(jsonb_build_object('card_type', card_type, 'mood_key', mood_key))
  INTO v_pool_matches
  FROM recommendation_pools
  WHERE (CASE WHEN NEW.media_type = 'tv' THEN tv_ids ELSE movie_ids END) @> to_jsonb(NEW.movie_id);

  v_was_in_pool := v_pool_matches IS NOT NULL AND jsonb_array_length(v_pool_matches) > 0;
  v_pool_matches := COALESCE(v_pool_matches, '[]'::jsonb);

  INSERT INTO prediction_accuracy_log (
    user_id, movie_id, media_type, actual_rating,
    library_size_before, was_in_pool, pool_matches, prediction_status
  ) VALUES (
    NEW.user_id, NEW.movie_id, NEW.media_type, NEW.rating,
    v_library_size_before, v_was_in_pool, v_pool_matches,
    CASE WHEN v_was_in_pool THEN 'pending' ELSE 'skipped_not_in_pool' END
  )
  RETURNING id INTO v_log_id;

  IF v_was_in_pool THEN
    PERFORM net.http_post(
      url := 'https://hewixvcatnuqftalzmtg.supabase.co/functions/v1/log-prediction-accuracy',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhld2l4dmNhdG51cWZ0YWx6bXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MTY3NDMsImV4cCI6MjA2MDM5Mjc0M30.wK9jnuFFje_AtzqokWiuVYq2otYKW3rLPrIczw6ggFs'
      ),
      body := jsonb_build_object('logId', v_log_id),
      timeout_milliseconds := 15000
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in trigger_log_prediction_accuracy: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_seasonal_event_on_movie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.media_type, 'movie') <> 'movie' then
    return null;
  end if;
  -- bots não participam de eventos sazonais
  if exists (select 1 from bot_accounts b where b.user_id = new.user_id) then
    return null;
  end if;
  begin
    if new.rating is not null and (tg_op = 'INSERT' or old.rating is null) then
      perform public.record_seasonal_action(new.user_id, 'rate', new.movie_id);
    elsif new.rating is null and tg_op = 'INSERT' then
      perform public.record_seasonal_action(new.user_id, 'watchlist', new.movie_id);
    end if;
  exception when others then
    raise warning 'seasonal event (user_movies): %', sqlerrm;
  end;
  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Semeadura (schema curation — andaime, pode ser apagado depois)
-- ---------------------------------------------------------------------------

-- código do IMDb -> título do TMDB, preenchido a partir das respostas da seed-bot-titles
create table if not exists curation.imdb_map (
  imdb_id text primary key,
  tmdb_id integer,
  media_type text,
  status text not null,
  resolved_at timestamptz not null default now()
);

-- pedidos feitos à seed-bot-titles (o id do pg_net de cada lote)
create table if not exists curation.seed_requests (
  req_id bigint primary key,
  imdb_ids text[] not null,
  created_at timestamptz not null default now()
);

-- cria (ou devolve) o bot com esse nome de usuário
create or replace function curation.create_bot(p_handle text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  v_id uuid;
begin
  select user_id into v_id from public.bot_accounts where handle = p_handle;
  if v_id is not null then
    return v_id;
  end if;
  v_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
          lower(regexp_replace(p_handle, '[^A-Za-z0-9]', '', 'g')) || '@bots.cineoracle.invalid',
          extensions.crypt(gen_random_uuid()::text || clock_timestamp()::text, extensions.gen_salt('bf')), now(),
          '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('username', p_handle), now(), now(),
          '', '', '', '', '', '', '', '');
  -- o profile nasce pelo gatilho handle_new_user (com o username acima)
  insert into public.bot_accounts (user_id, handle) values (v_id, p_handle);
  return v_id;
end $$;

-- manda um lote de códigos do IMDb para a seed-bot-titles
create or replace function curation.seed_titles(p_imdb_ids text[], p_key text)
returns bigint
language plpgsql
security definer
set search_path to 'curation', 'public'
as $$
declare v_id bigint;
begin
  select net.http_post(
    url := 'https://hewixvcatnuqftalzmtg.supabase.co/functions/v1/seed-bot-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhld2l4dmNhdG51cWZ0YWx6bXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MTY3NDMsImV4cCI6MjA2MDM5Mjc0M30.wK9jnuFFje_AtzqokWiuVYq2otYKW3rLPrIczw6ggFs',
      'x-seed-key', p_key),
    body := jsonb_build_object('imdbIds', to_jsonb(p_imdb_ids)),
    timeout_milliseconds := 140000
  ) into v_id;
  insert into curation.seed_requests (req_id, imdb_ids) values (v_id, p_imdb_ids);
  return v_id;
end $$;

-- lê as respostas que já chegaram e grava o mapa IMDb -> TMDB
create or replace function curation.ingest_seed()
returns table(done integer, pending integer, failed integer)
language plpgsql
security definer
set search_path to 'curation', 'public'
as $$
begin
  insert into curation.imdb_map (imdb_id, tmdb_id, media_type, status, resolved_at)
  select distinct on (x->>'imdbId') x->>'imdbId', nullif(x->>'tmdbId', '')::int, x->>'mediaType', x->>'status', now()
  from curation.seed_requests s
  join net._http_response r on r.id = s.req_id
  cross join lateral jsonb_array_elements(case when r.status_code = 200 then coalesce(r.content::jsonb->'results', '[]') else '[]' end) x
  order by x->>'imdbId', (x->>'status' in ('cached', 'added')) desc, s.req_id desc
  on conflict (imdb_id) do update set tmdb_id = excluded.tmdb_id, media_type = excluded.media_type,
    status = excluded.status, resolved_at = excluded.resolved_at
  where curation.imdb_map.status <> 'cached' and curation.imdb_map.status <> 'added';
  return query
  select (select count(*) from curation.seed_requests s join net._http_response r on r.id = s.req_id where r.status_code = 200)::int,
         (select count(*) from curation.seed_requests s where not exists (select 1 from net._http_response r where r.id = s.req_id))::int,
         (select count(*) from curation.seed_requests s join net._http_response r on r.id = s.req_id where coalesce(r.status_code, 0) <> 200)::int;
end $$;

-- grava as notas de um bot: p_data = 'tt0111161:10:2023-05-01;tt0068646:9:;…'
-- (data opcional = dia em que a pessoa avaliou; sem data, usa hoje)
create or replace function curation.import_bot_ratings(p_handle text, p_data text)
returns integer
language plpgsql
security definer
set search_path to 'curation', 'public'
as $$
declare
  v_user uuid;
  v_n integer;
begin
  select user_id into v_user from public.bot_accounts where handle = p_handle;
  if v_user is null then
    raise exception 'bot % não existe', p_handle;
  end if;
  with raw as (
    select split_part(item, ':', 1) imdb_id, split_part(item, ':', 2)::int rating, nullif(split_part(item, ':', 3), '')::date rated_on
    from regexp_split_to_table(p_data, ';') item
    where item ~ '^tt\d+:\d+'
  ),
  resolved as (
    select distinct on (m.tmdb_id, m.media_type) m.tmdb_id, m.media_type, r.rating, r.rated_on
    from raw r join curation.imdb_map m on m.imdb_id = r.imdb_id
    where m.status in ('cached', 'added') and r.rating between 1 and 10
      and exists (select 1 from public.movies mv where mv.id = m.tmdb_id and mv.media_type = m.media_type)
    order by m.tmdb_id, m.media_type, r.rated_on desc nulls last
  )
  insert into public.user_movies (user_id, movie_id, media_type, rating, created_at, updated_at)
  select v_user, tmdb_id, media_type, rating,
         coalesce(rated_on::timestamptz + interval '20 hours', now()),
         coalesce(rated_on::timestamptz + interval '20 hours', now())
  from resolved
  on conflict (user_id, movie_id, media_type) do update set rating = excluded.rating, updated_at = excluded.updated_at;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function curation.create_bot(text) from public, anon, authenticated;
revoke all on function curation.seed_titles(text[], text) from public, anon, authenticated;
revoke all on function curation.ingest_seed() from public, anon, authenticated;
revoke all on function curation.import_bot_ratings(text, text) from public, anon, authenticated;
