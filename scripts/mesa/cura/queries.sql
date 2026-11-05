-- Consultas de leitura do WP-CURA (05/11/2026). Só SELECT: rodam pelo MCP do Supabase,
-- antes de existir mesa_titles. O bloco "base" espelha o que mesa_build_titles() vai
-- gravar (§5.3), para a curadoria medir as ocasiões sem depender do motor.

-- ============================================================
-- 1) Exportação do glossário (glossary.csv): df >= 20 + palavras das regras e sensíveis
-- ============================================================
with st as (select distinct (x)::int id, 'movie' mt from recommendation_pools rp, jsonb_array_elements_text(rp.movie_ids) x where rp.mood_key <> 'random-surprise'
            union all select distinct (x)::int, 'tv' from recommendation_pools rp, jsonb_array_elements_text(rp.tv_ids) x where rp.mood_key <> 'random-surprise')
select (k->>'id')::int kw_id, lower(k->>'name') name_en, count(*) df
from st join movie_cache mc on mc.tmdb_id = st.id and mc.media_type = st.mt, jsonb_array_elements(mc.keywords) k
group by 1, 2
having count(*) >= 20
    or lower(k->>'name') = any(array['time loop','rain','bittersweet','farce','nonlinear timeline','plot twist','twist ending',
       'atmospheric','creepy','heartwarming','tearjerker','lovers','cannibalism','pedophilia','self-harm','sexual violence',
       'extreme violence','sex','nudity','erotic','domestic violence','genocide','abortion','school shooting','death of mother',
       'imaginary friend','split personality','dual identity','unreliable narrator','dream','valentine''s day','santa claus',
       'carnival','thanksgiving','easter'])
order by df desc;
-- + a varredura de raízes sensíveis com 4 <= df <= 19 (rape|abuse|suicid|incest|death of|holocaust|...), revisada à mão.

-- ============================================================
-- 2) Base: um título por linha, como em mesa_titles (§5.2/§5.3)
-- ============================================================
-- (copie este bloco "with" na frente das consultas 3 a 5)
with pool as (
  select rp.card_type oracle, rp.mood_key mood, 'movie'::text media_type, (x)::int tmdb_id
  from recommendation_pools rp, jsonb_array_elements_text(rp.movie_ids) x where rp.mood_key <> 'random-surprise'
  union all
  select rp.card_type, rp.mood_key, 'tv', (x)::int
  from recommendation_pools rp, jsonb_array_elements_text(rp.tv_ids) x where rp.mood_key <> 'random-surprise'
),
t as (
  select distinct on (p.media_type, p.tmdb_id)
    p.oracle, p.mood, p.media_type, p.tmdb_id, mc.title_pt, mc.title_en,
    mc.runtime, coalesce(mc.vote_count, 0) vc, mc.vote_average::real va,
    case when p.media_type = 'tv' then coalesce(nullif(mc.episode_run_time, 0), nullif(mc.runtime, 0) / nullif(mc.number_of_episodes, 0)) end ep_rt,
    case when p.media_type = 'tv' then coalesce(nullif(mc.episode_run_time, 0), nullif(mc.runtime, 0) / nullif(mc.number_of_episodes, 0)) * mc.number_of_episodes end total_min,
    (mc.status in ('Ended', 'Canceled') or exists (select 1 from jsonb_array_elements(coalesce(mc.keywords, '[]')) k where lower(k->>'name') = 'miniseries')) ended,
    coalesce(array(select lower(k->>'name') from jsonb_array_elements(coalesce(mc.keywords, '[]')) k), '{}') kwn,
    coalesce(array(select (g->>'id')::int from jsonb_array_elements(coalesce(mc.genres_en, '[]')) g), '{}') genre_ids,
    coalesce(
      (select max(case when c->>'certification' in ('L', 'AL', 'Livre') then 0
                       else nullif(regexp_replace(c->>'certification', '\D', '', 'g'), '')::int end)
         from jsonb_array_elements(case when jsonb_typeof(mc.content_ratings) = 'array' then mc.content_ratings else '[]' end) c
        where c->>'iso_3166_1' = 'BR'),
      (select max(case c->>'certification' when 'G' then 0 when 'TV-Y' then 0 when 'TV-Y7' then 0 when 'TV-G' then 0
                       when 'PG' then 10 when 'TV-PG' then 10 when 'PG-13' then 12 when 'TV-14' then 14
                       when 'R' then 16 when 'TV-MA' then 18 when 'NC-17' then 18 end)
         from jsonb_array_elements(case when jsonb_typeof(mc.content_ratings) = 'array' then mc.content_ratings else '[]' end) c
        where c->>'iso_3166_1' = 'US')) age
  from pool p join movie_cache mc on mc.tmdb_id = p.tmdb_id and mc.media_type = p.media_type
  order by p.media_type, p.tmdb_id, p.oracle
),
tf as (
  select t.*,
    t.kwn && array['rape','sexual abuse','incest','torture','child abuse','cannibalism','pedophilia','self-harm','sexual violence','extreme violence','gore'] heavy,
    t.kwn && array['rape','sexual abuse','incest','torture','child abuse','cannibalism','pedophilia','self-harm','sexual violence','extreme violence','gore',
                   'slasher','serial killer','drug addiction','suicide','sex','nudity','erotic','supernatural horror','possession'] heavy_family,
    t.kwn && array['tragic','depressing','grief','loss of loved one','war','suicide'] sad
  from t
),
-- ============================================================
-- 3) As ocasiões com os mesmos números do seed 106000 (§4.2 / §5.2)
-- ============================================================
occ(key, media, rt_min, rt_max, ep_max, total_min, total_max, ended_only, vc_min, vc_min_cy, va_min, age_max,
    ex_moods, req, ex_flags, mood_w, plus, minus) as (values
  ('chuva', 'movie', 80, 150, null::int, null::int, null::int, false, null::int, null::int, null::real, null::int,
   '{}'::text[], null::jsonb, '{}'::text[], '{"catharsis":0.35,"mind-blowing":0.25,"romantic":0.25,"drug-trip":0.2}'::jsonb,
   array['melancholy','reflective','loneliness','philosophical','isolation','introspective','thoughtful','wistful','bittersweet','rain','sentimental','existentialism','atmospheric','nostalgic'],
   array['hilarious','playful','parody','gore','slasher']),
  ('amor', null, 80, 140, null, null, null, false, null, null, 6.5, null,
   '{dark-and-scary}', null, '{heavy}', '{"romantic":0.6,"laugh-out-loud":0.2,"catharsis":0.15,"adventures":0.1}',
   array['romance','love','romantic','romcom','first love','falling in love','lovers','sentimental','heartwarming','hopeful'],
   array['tragic','depressing','grief','loss of loved one','war','suicide']),
  ('familia', null, null, 130, null, null, null, false, null, null, null, 12,
   '{dark-and-scary}', '{"moods":["family-time"],"genres":[16,10751],"genre_weight":0.5}', '{heavy_family}', '{"family-time":0.7}',
   array['friendship','heartwarming','cheerful','whimsical','comforting','joyous','lighthearted','hopeful','playful'], '{}'),
  ('galera', null, null, 130, null, null, null, false, 1000, 300, null, null,
   '{}', null, '{}', '{"laugh-out-loud":0.45,"adrenaline":0.45,"dark-and-scary":0.35,"adventures":0.3}',
   array['hilarious','absurd','dark comedy','amused','witty','parody','farce','heist','zombie','slasher','suspenseful','intense'],
   array['tragic','depressing','grief','loss of loved one','war','suicide']),
  ('noventa', 'movie', 60, 100, null, null, null, false, null, null, null, null, '{}', null, '{}', '{"*":1}', '{}', '{}'),
  ('episodio', 'tv', null, null, 35, null, null, false, null, null, null, null, '{}', null, '{}', '{"*":1}', '{}', '{}'),
  ('maratona', 'tv', null, null, null, 180, 1200, true, null, null, null, null, '{}', null, '{}', '{"*":1}', array['suspenseful','intense'], '{}'),
  ('chorar', null, null, null, null, null, null, false, null, null, null, null, '{}', null, '{}', '{"catharsis":0.45,"romantic":0.25,"family-time":0.15}',
   array['tragic','grief','sadness','loss of loved one','tearjerker','empathetic','sentimental','bittersweet','melancholy','depressing'],
   array['hilarious','amused','parody','sitcom','farce','playful','witty','satire','absurd']),
  ('rir', null, null, 125, null, null, null, false, null, null, null, null, '{}', null, '{}', '{"laugh-out-loud":0.6,"family-time":0.1}',
   array['hilarious','amused','absurd','witty','parody','satire','farce','playful','sitcom'],
   array['tragic','depressing','grief','loss of loved one','war','suicide']),
  ('susto', null, null, null, null, null, null, false, null, null, null, null, '{}', null, '{}', '{"dark-and-scary":0.55,"mind-blowing":0.1}',
   array['suspenseful','tense','frightened','horror','haunted house','ghost','supernatural horror','slasher','possession','foreboding','ominous','creepy'], '{}'),
  ('no', null, null, null, null, null, null, false, null, null, null, null, '{}', null, '{}', '{"mind-blowing":0.55,"drug-trip":0.3}',
   array['complex','nonlinear timeline','time loop','surrealism','surreal','psychological thriller','whodunit','ambiguous','dystopia','time travel','philosophical','existentialism','twist ending','plot twist'], '{}'),
  ('colo', null, null, 120, 45, null, null, false, 300, null, 6.8, null,
   '{dark-and-scary}', null, '{heavy_family,sad}', '{"laugh-out-loud":0.35,"family-time":0.35,"romantic":0.3,"adventures":0.2}',
   array['comforting','cheerful','heartwarming','hopeful','whimsical','lighthearted','joyous','friendship','playful','nostalgic','amused'], '{}')
),
fit as (
  select o.key, t.oracle, t.media_type, t.tmdb_id, t.title_pt, t.vc,
    least(1,
      coalesce((o.mood_w->>t.mood)::real, (o.mood_w->>'*')::real,
               case when o.req is not null then (o.req->>'genre_weight')::real end, 0)
      + 0.25 * least(2, cardinality(array(select unnest(o.plus) intersect select unnest(t.kwn)))))
      - case when t.kwn && o.minus then 0.35 else 0 end as fit
  from tf t cross join occ o
  where (o.media is null or o.media = t.media_type)
    and (t.media_type = 'tv' or ((o.rt_min is null or t.runtime >= o.rt_min) and (o.rt_max is null or t.runtime <= o.rt_max)))
    and (t.media_type = 'movie' or o.ep_max is null or t.ep_rt <= o.ep_max)
    and (t.media_type = 'movie' or ((o.total_min is null or t.total_min >= o.total_min) and (o.total_max is null or t.total_min <= o.total_max)))
    and (not o.ended_only or t.ended)
    and (o.vc_min is null or t.vc >= case when t.oracle = 'cypher' then coalesce(o.vc_min_cy, o.vc_min) else o.vc_min end)
    and (o.va_min is null or t.va >= o.va_min)
    and (o.age_max is null or t.age is null or t.age <= o.age_max)
    and not (t.mood = any(o.ex_moods))
    and (o.req is null or t.mood in (select jsonb_array_elements_text(o.req->'moods'))
         or t.genre_ids && array(select (jsonb_array_elements_text(o.req->'genres'))::int))
    and not ('heavy' = any(o.ex_flags) and t.heavy)
    and not ('heavy_family' = any(o.ex_flags) and t.heavy_family)
    and not ('sad' = any(o.ex_flags) and t.sad)
)
-- 4) Contagens do §4.4 só pela regra (antes dos overrides)
select key, media_type, oracle, count(*) filter (where fit >= 0.5) n
from fit group by 1, 2, 3 order by 1, 2, 3;

-- 5) Revisão das ocasiões (§6.2.2): os 40 mais votados + 20 sorteados (filmes e séries), por ocasião
-- select * from (select f.*, row_number() over (partition by key order by vc desc) r,
--                       row_number() over (partition by key order by hashtext(key || tmdb_id)) rr
--                from fit f where fit >= 0.5) x where r <= 40 or rr <= 20;

-- ============================================================
-- 6) Contagem final do §4.4 com os overrides (mesma semântica de mesa_build_titles):
--    regra (fit >= 0,5, +0,40 quando há sinal confirmado) menos os vetos (-1),
--    mais os +1 (encaixe 1, só na mídia própria da ocasião), mais o Natal
--    (palavra christmas + listas de seasonal_events). Para rodar antes dos seeds:
--      node scripts/mesa/cura/build-seeds.ts --counts   → counts.overrides.sql (CTE "ov")
--    cole "with <counts.overrides.sql>, pool as (…), t as (…), tf as (…), occ as (…)" e:
-- rule as (select o.key, t.oracle, t.media_type, t.tmdb_id from tf t cross join occ o where <filtros duros da consulta 3>
--          and (<peso do humor> + 0.25*least(2, tons a favor) + 0.4*[+1 do comentário] - 0.35*[tom contra]) >= 0.5
--          and not exists (select 1 from ov where ov.occasion_key = o.key and ov.media_type = t.media_type
--                          and ov.tmdb_id = t.tmdb_id and ov.sign = -1)),
-- plus as (select ov.occasion_key, t.oracle, t.media_type, t.tmdb_id from ov join tf t using (media_type, tmdb_id)
--          left join occ o on o.key = ov.occasion_key where ov.sign = 1 and (o.media is null or o.media = t.media_type))
-- select key, media_type, oracle, count(*) from (select * from rule union select * from plus) x group by 1, 2, 3;
--    Depois que o WP-DB aplicar tudo, a conferência oficial é direto na tabela:
-- select occasion_key, media_type, t.oracle, count(*) from mesa_title_occasions o
--   join mesa_titles t using (media_type, tmdb_id) group by 1, 2, 3 order by 1, 2, 3;

-- ============================================================
-- 7) Cobertura do porquê (§6.1.5, aproximação antes do motor): para as sementes do
--    Bruno (nota >= 9 ou nota - média pública >= 2), a melhor âncora de cada título não
--    avaliado (>= 2 palavras específicas em comum, 2 <= df <= 400, soma de IDF) tem pelo
--    menos 1 palavra exibível? Medido em 05/11: 33 sementes, 1.755 títulos com âncora,
--    84,9% com tema exibível (86,3% nas âncoras fortes, soma de IDF >= 12). Meta: 70%.
--    Depois do motor, a conferência oficial: share de cartas do Bruno com reason.type =
--    'anchor_kw' e themes_pt não vazio.
