-- Fila de semeadura dos bots (09/10/2026).
--
-- curation.queue_bot(handle, dados) cria o bot, guarda as notas e põe na fila
-- os códigos do IMDb que ainda não foram resolvidos. Um job do pg_cron chama
-- curation.seed_tick() a cada minuto: lê as respostas que chegaram, manda os
-- próximos lotes para a seed-bot-titles (no máximo 6 lotes de 25 ao mesmo
-- tempo, para não estourar o limite do TMDB) e, quando todos os títulos de um
-- bot estão resolvidos, grava as notas dele e recalcula as balanças.
-- dados = 'tt0111161:10:2023-05-01;tt0068646:9:;…' (mesmo formato de import_bot_ratings).

create table if not exists curation.bot_imports (
  handle text primary key,
  data text not null,
  status text not null default 'pending',
  n_imported integer,
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

create table if not exists curation.seed_queue (
  imdb_id text primary key,
  state text not null default 'queued',      -- queued | sent | done | failed
  attempts integer not null default 0,
  sent_req bigint,
  sent_at timestamptz,
  enqueued_at timestamptz not null default now()
);

create or replace function curation.queue_bot(p_handle text, p_data text)
returns integer
language plpgsql
security definer
set search_path to 'curation', 'public'
as $$
declare v_n integer;
begin
  perform curation.create_bot(p_handle);
  insert into curation.bot_imports (handle, data) values (p_handle, p_data)
  on conflict (handle) do update set data = excluded.data, status = 'pending', imported_at = null, n_imported = null;
  insert into curation.seed_queue (imdb_id)
  select distinct split_part(item, ':', 1)
  from regexp_split_to_table(p_data, ';') item
  where item ~ '^tt\d+:\d+'
    and not exists (select 1 from curation.imdb_map m where m.imdb_id = split_part(item, ':', 1) and m.status in ('cached', 'added', 'not_found'))
  on conflict (imdb_id) do update set state = 'queued', attempts = 0, sent_req = null, sent_at = null
    where curation.seed_queue.state = 'failed';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function curation.seed_tick()
returns text
language plpgsql
security definer
set search_path to 'curation', 'public'
as $$
declare
  v_key text;
  v_inflight integer;
  v_batch text[];
  v_sent integer := 0;
  v_imp record;
  v_done text := '';
  v_n integer;
begin
  perform curation.ingest_seed();

  -- resolvidos saem da fila (state = done); lote respondido ou parado há 4 min volta para a fila; 3 tentativas = failed
  update curation.seed_queue q set state = 'done'
  from curation.imdb_map m
  where m.imdb_id = q.imdb_id and q.state in ('queued', 'sent') and m.status in ('cached', 'added', 'not_found');
  update curation.seed_queue q set state = case when q.attempts >= 3 then 'failed' else 'queued' end, sent_req = null, sent_at = null
  where q.state = 'sent'
    and (exists (select 1 from net._http_response r where r.id = q.sent_req)
         or q.sent_at < now() - interval '4 minutes');

  select key into v_key from public.bot_seed_keys where expires_at > now() order by expires_at desc limit 1;
  select count(distinct sent_req) into v_inflight from curation.seed_queue where state = 'sent';

  while v_key is not null and v_inflight < 6 loop
    select array_agg(imdb_id) into v_batch
    from (select imdb_id from curation.seed_queue where state = 'queued' order by enqueued_at, imdb_id limit 25) z;
    exit when v_batch is null;
    with s as (select curation.seed_titles(v_batch, v_key) req)
    update curation.seed_queue q set state = 'sent', sent_req = s.req, sent_at = now(), attempts = q.attempts + 1
    from s where q.imdb_id = any(v_batch);
    v_inflight := v_inflight + 1;
    v_sent := v_sent + 1;
  end loop;

  -- bots com todos os títulos resolvidos: grava as notas
  for v_imp in
    select bi.handle, bi.data from curation.bot_imports bi
    where bi.status = 'pending'
      and not exists (
        select 1 from regexp_split_to_table(bi.data, ';') item
        join curation.seed_queue q on q.imdb_id = split_part(item, ':', 1) and q.state in ('queued', 'sent'))
  loop
    v_n := curation.import_bot_ratings(v_imp.handle, v_imp.data);
    perform public.recalculate_user_spectrogram_v2(b.user_id) from public.bot_accounts b where b.handle = v_imp.handle;
    update curation.bot_imports set status = 'done', n_imported = v_n, imported_at = now() where handle = v_imp.handle;
    v_done := v_done || v_imp.handle || '(' || v_n || ') ';
  end loop;

  return format('lotes enviados: %s, na fila: %s, gravados: %s', v_sent,
                (select count(*) from curation.seed_queue where state in ('queued', 'sent')), nullif(v_done, ''));
end $$;

-- bots com alguma moldura ou banner de franquia liberado (fora o dourado) ganham premium vitalício
create or replace function curation.grant_bot_premium()
returns integer
language plpgsql
security definer
set search_path to 'curation', 'public'
as $$
declare
  v_bot record;
  v_n integer := 0;
begin
  for v_bot in
    select b.user_id from public.bot_accounts b join public.profiles p on p.id = b.user_id
    where not coalesce(p.lifetime_premium, false)
      and exists (
        select 1 from public.cosmetic_requirements cr
        where cr.category in ('frame', 'banner') and cr.required_tag is not null
          and public.is_required_tag_met(b.user_id, cr.required_tag))
  loop
    perform public.grant_lifetime_premium(v_bot.user_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function curation.queue_bot(text, text) from public, anon, authenticated;
revoke all on function curation.seed_tick() from public, anon, authenticated;
revoke all on function curation.grant_bot_premium() from public, anon, authenticated;
