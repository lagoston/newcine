-- Base de filmes no servidor (12/10/2026, "nova proposta aceita, realize
-- todas as mudanças"). Ver o doc "Base de filmes" do Project.
--
-- Até aqui o navegador buscava os títulos no TMDB e gravava ele mesmo no
-- movie_cache (qualquer conta podia gravar qualquer título), e cada busca
-- regravava os resultados. Agora:
--   • quem grava e atualiza o movie_cache é só a função cache-title, que
--     recebe o id e o tipo e busca no TMDB ela mesma;
--   • cada título tem prazo de validade (title_refresh_days): 7 dias para
--     lançamentos e séries no ar, 90 para o resto. Vencido, ele é atualizado
--     quando alguém abre (em segundo plano) ou pela rotina da madrugada;
--   • o tmdb-proxy guarda as listas (tmdb_response_cache) e tem limite por
--     pessoa (api_rate_limits);
--   • chamadas do próprio banco (agenda, gatilhos, curadoria) se identificam
--     com uma chave interna que fica só no cofre (vault) do banco.

-- ---------- movie_cache: colunas novas ----------

alter table public.movie_cache
  add column if not exists director_id integer,
  add column if not exists trailer jsonb,
  add column if not exists refreshed_at timestamptz;

comment on column public.movie_cache.director_id is 'Id do TMDB do diretor (série: criador). Preenchido a cada atualização.';
comment on column public.movie_cache.trailer is 'Trailer do YouTube {key, site, name}; {} = conferido e sem trailer; null = ainda não conferido.';
comment on column public.movie_cache.refreshed_at is 'Última atualização completa a partir do TMDB (cache-title).';

-- Sem registro confiável de atualização completa, vale a data em que o título
-- entrou na base: os mais antigos vencem primeiro e a rotina põe em dia.
update public.movie_cache set refreshed_at = coalesce(cached_at, updated_at, now()) where refreshed_at is null;
alter table public.movie_cache alter column refreshed_at set default now();

-- ---------- Prazo de validade ----------

create or replace function public.title_refresh_days(p_media_type text, p_release_date date, p_in_production boolean, p_status text)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when p_media_type = 'tv' and (coalesce(p_in_production, false) or p_status in ('Returning Series', 'In Production', 'Planned', 'Pilot')) then 7
    when p_media_type = 'movie' and p_release_date is null then 30
    when p_media_type = 'movie' and p_release_date > current_date - 120 then 7
    else 90
  end;
$$;

-- Os títulos vencidos (ou incompletos), do mais atrasado para o menos.
create or replace function public.titles_due_for_refresh(p_limit integer)
returns table (tmdb_id integer, media_type text)
language sql
stable
security definer
set search_path = public
as $$
  select mc.tmdb_id, mc.media_type
  from public.movie_cache mc
  where mc.refreshed_at + make_interval(days => public.title_refresh_days(mc.media_type, mc.release_date, mc.in_production, mc.status)) <= now()
     or (mc.media_type = 'movie' and mc.budget is null)
     or (mc.media_type = 'tv' and coalesce(mc.number_of_seasons, 0) > 0 and (mc.seasons_data is null or jsonb_array_length(mc.seasons_data) = 0))
  order by mc.refreshed_at + make_interval(days => public.title_refresh_days(mc.media_type, mc.release_date, mc.in_production, mc.status))
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.titles_due_for_refresh(integer) from public, anon, authenticated;
grant execute on function public.titles_due_for_refresh(integer) to service_role;

-- ---------- Respostas guardadas do tmdb-proxy ----------

create table if not exists public.tmdb_response_cache (
  endpoint text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.tmdb_response_cache enable row level security;
revoke all on public.tmdb_response_cache from anon, authenticated;
create index if not exists tmdb_response_cache_fetched_idx on public.tmdb_response_cache (fetched_at);

-- ---------- Limite de chamadas ao TMDB por pessoa ----------

-- Uma linha por pessoa (conta ou endereço IP), com a janela atual.
create table if not exists public.api_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

-- Soma p_cost à janela de quem pede; devolve se ainda está dentro do limite.
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer, p_cost integer default 1)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  insert into public.api_rate_limits as r (key, window_start, hits)
  values (p_key, now(), p_cost)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then p_cost else r.hits + p_cost end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer, integer) to service_role;

-- ---------- Chave interna (banco → funções) ----------

-- Gerada aqui e guardada só no vault; nunca sai do banco. As funções conferem
-- a chave recebida por check_internal_key.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'internal_api_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'internal_api_key', 'Chave das chamadas internas do banco para as funções (cache-title, tmdb-proxy).');
  end if;
end $$;

create or replace function curation.internal_api_key()
returns text
language sql
stable
security definer
set search_path = curation, public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'internal_api_key' limit 1;
$$;
revoke all on function curation.internal_api_key() from public;

create or replace function public.check_internal_key(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_key, '') <> '' and p_key = curation.internal_api_key();
$$;
revoke all on function public.check_internal_key(text) from public, anon, authenticated;
grant execute on function public.check_internal_key(text) to service_role;

-- Pede à cache-title os títulos da lista (em segundo plano, pelo pg_net).
create or replace function curation.request_title_cache(p_titles jsonb, p_mode text default 'fill')
returns bigint
language plpgsql
security definer
set search_path = curation, public
as $$
declare
  v_id bigint;
begin
  if p_mode = 'fill' and (p_titles is null or jsonb_array_length(p_titles) = 0) then
    return null;
  end if;
  select net.http_post(
    url := 'https://hewixvcatnuqftalzmtg.supabase.co/functions/v1/cache-title',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhld2l4dmNhdG51cWZ0YWx6bXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MTY3NDMsImV4cCI6MjA2MDM5Mjc0M30.wK9jnuFFje_AtzqokWiuVYq2otYKW3rLPrIczw6ggFs',
      'x-internal-key', curation.internal_api_key()),
    body := jsonb_build_object('mode', p_mode, 'titles', coalesce(p_titles, '[]'::jsonb)),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end;
$$;
revoke all on function curation.request_title_cache(jsonb, text) from public;

-- A curadoria passa a se identificar no tmdb-proxy pela chave interna.
create or replace function curation.tmdb_get(p_kind text, p_endpoint text, p_tmdb_id integer default null, p_lang text default null)
returns bigint
language plpgsql
security definer
set search_path = curation, public
as $$
declare v_id bigint;
begin
  select net.http_get(
    url := 'https://hewixvcatnuqftalzmtg.supabase.co/functions/v1/tmdb-proxy?endpoint=' ||
           replace(replace(replace(p_endpoint, '%', '%25'), '&', '%26'), '?', '%3F'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhld2l4dmNhdG51cWZ0YWx6bXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MTY3NDMsImV4cCI6MjA2MDM5Mjc0M30.wK9jnuFFje_AtzqokWiuVYq2otYKW3rLPrIczw6ggFs',
      'x-internal-key', curation.internal_api_key()),
    timeout_milliseconds := 30000
  ) into v_id;
  insert into curation.http_log (req_id, kind, tmdb_id, lang, endpoint) values (v_id, p_kind, p_tmdb_id, p_lang, p_endpoint);
  return v_id;
end $$;
