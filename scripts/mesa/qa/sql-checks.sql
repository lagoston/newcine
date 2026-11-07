-- WP-QA · conferência SQL da Mesa dos Oráculos (SPEC §8.5) · 05/11/2026
-- Só leitura (SELECT). Rodar inteiro num banco com as migrações aplicadas;
-- cada bloco devolve uma linha com o resultado. Os testes que gravam
-- (tiragens, gestos, gatilho) ficam em 01-wpdb-acceptance.sql e
-- 02-asks-dryrun.sql, que terminam em raise exception (dry-run).

-- 1) As migrações aplicadas são byte a byte os arquivos do repo.
--    Esperado (md5): schema c23d635c…, glossary 51e9fa50…, occasions a94711eb…,
--    comment_flags e65c9889…, recognition 8a64b65f…, engine c801e86e…,
--    upkeep 7f9be7c1…, api 74750130…, cron eac5e114…
select name, md5(array_to_string(statements, '')) as md5
  from supabase_migrations.schema_migrations where name like 'mesa%' order by version;

-- 2) Catálogo e seeds.
select (select count(*) from mesa_titles) as titles,                       -- 6.491
       (select count(*) from mesa_title_occasions) as title_occ,           -- 8.501
       (select count(*) from mesa_kw where reviewed) as kw_reviewed,       -- ≥ 800 (929)
       (select count(*) from mesa_kw where exibivel and (spoiler or sensivel)) as kw_bad, -- 0
       (select count(*) from mesa_occasions) as occasions;                 -- 14

-- 3) Pisos da tiragem diária de hoje, em todas as pessoas (§8.4 WP-DB 3).
with d as (select * from mesa_draws where day = mesa_day() and ask = 'daily' and mode = 'normal'),
c as (select c.*, t.director_key, t.collection_id from mesa_cards c join d on d.id = c.draw_id
       left join mesa_titles t on t.media_type = c.media_type and t.tmdb_id = c.tmdb_id
      where c.seat <> 'espelho' and c.gen = 0)
select count(distinct d.id) as draws,
       (select count(*) from c where seat = 'bogart' and pred < 7) as bogart_below_7,
       (select count(*) from c where seat = 'cypher' and mu < 6.5) as cypher_mu_below,
       (select count(*) from c where seat = 'cypher' and mood = any(mesa_top3(c.user_id))) as cypher_in_top3,
       (select count(*) from c join user_movies um on um.user_id = c.user_id and um.movie_id = c.tmdb_id
                                and um.media_type = c.media_type and um.rating is not null) as rated_cards,
       (select count(*) from (select 1 from c where director_key is not null group by draw_id, director_key having count(*) > 1) x) as dup_director,
       (select count(*) from (select 1 from c where collection_id is not null group by draw_id, collection_id having count(*) > 1) x) as dup_saga,
       (select count(*) from (select 1 from c where media_type = 'tv' group by draw_id having count(*) > 1) x) as multi_series
  from d;

-- 4) Segurança: só as 6 públicas executáveis por authenticated; nada por anon;
--    tabelas sem privilégio e com RLS sem política.
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_x,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.proname like 'mesa%' or p.proname in ('process_mesa_dirty', 'predict_ratings'))
   and (has_function_privilege('anon', p.oid, 'execute')
        or (has_function_privilege('authenticated', p.oid, 'execute')
            and p.proname not in ('mesa_get','mesa_react','mesa_ack','mesa_book','mesa_acervo','mesa_refresh')));
-- esperado: 0 linhas
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'mesa%'
   and (not c.relrowsecurity or has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'));
-- esperado: 0 linhas

-- 5) As 4 agendas.
select jobname, schedule, command, active from cron.job where jobname like 'mesa%' order by jobname;

-- 6) O tom das ocasiões (o que o QA achou em 05/11): família com idade > 12,
--    pesado ou Sombrio (só entram por override +1); 90 minutos acima de 90;
--    Natal com título pesado/Sombrio/Psicodélico.
select o.occasion_key, count(*) as n,
       count(*) filter (where o.occasion_key = 'familia' and (t.age > 12 or t.heavy_family or t.mood = 'dark-and-scary')) as familia_suspeitos,
       count(*) filter (where o.occasion_key = 'noventa' and t.runtime > 90) as noventa_acima_90,
       count(*) filter (where o.occasion_key like 'season:%' and (t.heavy or t.heavy_family or t.mood in ('dark-and-scary','drug-trip'))) as epoca_pesados
  from mesa_title_occasions o join mesa_titles t on t.media_type = o.media_type and t.tmdb_id = o.tmdb_id
 group by o.occasion_key order by o.occasion_key;

-- 7) O contrato: as chaves do payload gravado batem com src/lib/mesa/types.ts.
select (select array_agg(k order by k) from jsonb_object_keys(mesa_payload(d.id)) k) as payload_keys,
       (select array_agg(k order by k) from jsonb_object_keys(mesa_payload(d.id)->'cards'->0) k) as card_keys,
       (select array_agg(k order by k) from jsonb_object_keys(mesa_payload(d.id)->'cards'->0->'line_facts') k) as line_fact_keys,
       (select array_agg(k order by k) from jsonb_object_keys(mesa_payload(d.id)->'facts') k) as fact_keys
  from mesa_draws d where d.user_id = '17bef49a-2c3f-40c9-a9b5-a741946b1b1b' and d.day = mesa_day() and d.ask = 'daily' limit 1;

-- 8) Tamanho no banco (o SPEC estimava < 15 MB).
select pg_size_pretty(sum(pg_total_relation_size(c.oid))) as mesa_total
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'mesa%';
