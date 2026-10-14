-- Lista de pesca: lançamentos acompanhados até a nota "esquentar" (14/10/2026).
--
-- Pedido do Bruno: um mecanismo que absorve lançamentos numa lista, deixa a
-- nota do TMDB assentar até um número razoável de votos e mostra quais
-- passaram de 6,5 e podem entrar numa prateleira. Ele consulta a lista no
-- banco (Table Editor do Supabase: tabela `pesca`, ou as visões
-- `pesca_prontos` e `pesca_resumo`) e decide o que adicionar.
--
-- Como funciona (ver o doc "Lista de pesca" do projeto):
--   • Todo dia a função de borda `pesca-lancamentos` (agenda `pesca-diaria`)
--     traz do TMDB os lançamentos recentes mais populares — filmes, séries e
--     uma busca só de brasileiros — que ainda não estão nas prateleiras, e
--     reconfere a nota e os votos de quem já está na lista (uma vez por
--     semana cada), guardando o histórico.
--   • `pesca_avaliar()` decide o status de cada um:
--       esquentando → a nota ainda não assentou;
--       pronto      → assentou com nota acima de 6,5 (com oráculo e humor sugeridos);
--       abaixo      → assentou com 6,5 ou menos (continua sendo olhado 1×/mês);
--       expirado    → 2 anos depois do lançamento sem esquentar;
--       adicionado  → já está numa prateleira;
--       descartado  → o Bruno tirou da lista.
--     "Assentou" = lançado há 60+ dias e com os votos do Bogart (filme 500,
--     série 300) OU lançado há 180+ dias e com o piso do Cypher (filme 75,
--     série 40), E a nota não mexeu mais que 0,2 nas últimas 3 semanas (ou
--     já tem 1 ano). Lançamento sobe muito nas primeiras semanas (os fãs
--     votam primeiro) e costuma cair depois — por isso a espera.
--   • `pesca_adicionar(tmdb_id, 'movie'|'tv')` põe na prateleira sugerida
--     (ou na que o Bruno passar) e marca como adicionado.
--   • `pesca_descartar(tmdb_id, 'movie'|'tv', 'motivo')` tira da lista.
--
-- Nada aqui apaga linhas. A tabela não é lida pelo site (RLS sem políticas;
-- as visões e funções também ficam fechadas para anon/authenticated).

create table if not exists public.pesca (
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  titulo text,
  titulo_original text,
  lancamento date,
  nota numeric(4, 2),
  votos integer,
  popularidade numeric,
  idioma text,
  generos text,
  status text not null default 'esquentando'
    check (status in ('esquentando', 'pronto', 'abaixo', 'expirado', 'adicionado', 'descartado')),
  motivo text,
  oraculo_sugerido text check (oraculo_sugerido in ('bogart', 'fincher', 'cypher')),
  humor_sugerido text check (humor_sugerido in ('mind-blowing', 'dark-and-scary', 'drug-trip', 'adventures', 'catharsis',
                                                'adrenaline', 'romantic', 'family-time', 'laugh-out-loud')),
  humores_sugeridos text,
  origem text not null default 'lancamentos',
  observacao text,
  historico jsonb not null default '[]'::jsonb,
  entrou_em timestamptz not null default now(),
  checado_em timestamptz,
  pronto_em timestamptz,
  adicionado_em timestamptz,
  primary key (tmdb_id, media_type)
);
create index if not exists pesca_status_idx on public.pesca (status, checado_em);
alter table public.pesca enable row level security;

comment on table public.pesca is
  'Lista de pesca: lançamentos acompanhados até a nota do TMDB assentar. status: esquentando | pronto (nota > 6,5, pode entrar numa prateleira) | abaixo | expirado | adicionado | descartado. Para adicionar: select pesca_adicionar(tmdb_id, ''movie''); para tirar: select pesca_descartar(tmdb_id, ''movie'', ''motivo''). Atualizada todo dia pela função pesca-lancamentos. Doc: "Lista de pesca".';
comment on column public.pesca.historico is 'Medições semanais: [{"em": data, "nota": 7.1, "votos": 340}, ...]';
comment on column public.pesca.motivo is 'Por que está neste status (ex.: "320 votos; Bogart a partir de 500").';
comment on column public.pesca.origem is 'lancamentos (busca diária), brasil (busca de brasileiros) ou banco (já estava no banco do site na curadoria de 13/10/2026).';

-- ---------------------------------------------------------------------------
-- Humor sugerido: um "Naive Bayes" treinado nas próprias prateleiras
-- (palavras-chave, gêneros e diretor dos títulos já curados). Testado em
-- 13/10/2026 deixando cada título de fora: acerta o humor de primeira em 66%
-- e está entre os 3 primeiros em 90% (filmes e séries). Só para títulos que
-- já estão no movie_cache (precisa das palavras-chave).
-- ---------------------------------------------------------------------------

create or replace function curation.sugerir_humores(p_items jsonb)
returns table (tmdb_id integer, media_type text, humor text, pct integer, ordem integer)
language sql
stable
security definer
set search_path = public, curation
as $$
  with moods as (
    select unnest(array['mind-blowing', 'dark-and-scary', 'drug-trip', 'adventures', 'catharsis',
                        'adrenaline', 'romantic', 'family-time', 'laugh-out-loud']) mood
  ),
  lab as (
    select distinct on (z.x::int, z.mt) z.x::int id, z.mt, rp.mood_key mood
    from public.recommendation_pools rp
    cross join lateral (
      select 'movie' mt, jsonb_array_elements_text(rp.movie_ids) x
      union all
      select 'tv', jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb))
    ) z
    where rp.mood_key <> 'random-surprise'
  ),
  want as (
    select distinct (e ->> 'id')::int id, e ->> 'type' mt from jsonb_array_elements(p_items) e
  ),
  feat as (
    select mc.tmdb_id id, mc.media_type mt, f.f
    from public.movie_cache mc
    cross join lateral (
      select 'k:' || (k ->> 'id') f from jsonb_array_elements(coalesce(mc.keywords, '[]'::jsonb)) k
      union select 'g:' || (g ->> 'id') from jsonb_array_elements(coalesce(mc.genres_en, '[]'::jsonb)) g
      union select 'd:' || lower(mc.director) where coalesce(mc.director, '') <> ''
    ) f
    where exists (select 1 from lab where lab.id = mc.tmdb_id and lab.mt = mc.media_type)
       or exists (select 1 from want w where w.id = mc.tmdb_id and w.mt = mc.media_type)
  ),
  n as (select mt, mood, count(*) nm from lab group by 1, 2),
  tot as (select mt, sum(nm) t from n group by 1),
  c as (
    select feat.f, feat.mt, lab.mood, count(*) cfm
    from feat join lab on lab.id = feat.id and lab.mt = feat.mt
    group by 1, 2, 3
  ),
  cf as (select f, mt, sum(cfm) cf from c group by 1, 2),
  sc as (
    select w.id, w.mt, m.mood,
      ln((n.nm + 1.0) / (tot.t + 9))
      + coalesce(sum((case when x.f like 'd:%' then 2.0 else 1.0 end) * ln((coalesce(c.cfm, 0) + 0.5) / (n.nm + 1.0)))
                 filter (where cf.cf >= 2), 0) s
    from want w
    cross join moods m
    join n on n.mt = w.mt and n.mood = m.mood
    join tot on tot.mt = w.mt
    left join feat x on x.id = w.id and x.mt = w.mt
    left join cf on cf.f = x.f and cf.mt = x.mt
    left join c on c.f = x.f and c.mt = x.mt and c.mood = m.mood
    where exists (select 1 from public.movie_cache mc where mc.tmdb_id = w.id and mc.media_type = w.mt)
    group by w.id, w.mt, m.mood, n.nm, tot.t
  ),
  -- "Temperatura" 3,5: o modelo soma dezenas de pistas e sai confiante
  -- demais (100% / 0%). Com 3,5, a confiança média do 1º lugar (~67%) bate
  -- com o acerto medido deixando cada título de fora (66%).
  pr as (
    select id, mt, mood, exp((s - max(s) over (partition by id, mt)) / 3.5) e from sc
  ),
  rk as (
    select id, mt, mood, e / sum(e) over (partition by id, mt) p,
           row_number() over (partition by id, mt order by e desc) r
    from pr
  )
  select id, mt, mood, round(100 * p)::int, r::int from rk where r <= 3;
$$;

-- ---------------------------------------------------------------------------
-- Entrada (usada pela função de borda): grava novos e atualiza nota/votos,
-- acrescentando ao histórico no máximo uma medição por semana. O que já está
-- numa prateleira não entra.
-- ---------------------------------------------------------------------------

create or replace function public.pesca_registrar(p_items jsonb, p_origem text default 'lancamentos')
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with items as (
    select (e ->> 'id')::int id, e ->> 'type' mt, nullif(e ->> 'title', '') titulo, nullif(e ->> 'original_title', '') titulo_original,
           nullif(e ->> 'date', '')::date lancamento, (e ->> 'va')::numeric nota, (e ->> 'vc')::int votos,
           (e ->> 'popularity')::numeric popularidade, nullif(e ->> 'lang', '') idioma, nullif(e ->> 'genres', '') generos
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where (e ->> 'type') in ('movie', 'tv') and (e ->> 'id') ~ '^[0-9]+$'
  ),
  novos as (
    select distinct on (i.id, i.mt) i.* from items i
    where not exists (
      select 1 from public.recommendation_pools rp
      where rp.mood_key <> 'random-surprise'
        and (case when i.mt = 'movie' then rp.movie_ids else coalesce(rp.tv_ids, '[]'::jsonb) end) @> to_jsonb(i.id)
    )
  ),
  up as (
    insert into public.pesca as p (tmdb_id, media_type, titulo, titulo_original, lancamento, nota, votos, popularidade, idioma, generos,
                                   origem, historico, checado_em)
    select id, mt, titulo, titulo_original, lancamento, nota, votos, popularidade, idioma, generos, coalesce(p_origem, 'lancamentos'),
           case when nota is null then '[]'::jsonb
                else jsonb_build_array(jsonb_build_object('em', current_date, 'nota', nota, 'votos', votos)) end,
           now()
    from novos
    on conflict (tmdb_id, media_type) do update set
      titulo = coalesce(excluded.titulo, p.titulo),
      titulo_original = coalesce(excluded.titulo_original, p.titulo_original),
      lancamento = coalesce(excluded.lancamento, p.lancamento),
      nota = coalesce(excluded.nota, p.nota),
      votos = coalesce(excluded.votos, p.votos),
      popularidade = coalesce(excluded.popularidade, p.popularidade),
      idioma = coalesce(excluded.idioma, p.idioma),
      generos = coalesce(excluded.generos, p.generos),
      checado_em = now(),
      historico = case
        when excluded.nota is null then p.historico
        when jsonb_array_length(p.historico) > 0 and (p.historico -> -1 ->> 'em')::date > current_date - 6 then p.historico
        else p.historico || jsonb_build_array(jsonb_build_object('em', current_date, 'nota', excluded.nota, 'votos', excluded.votos))
      end
    returning 1
  )
  select count(*)::int from up;
$$;

-- Quem reconferir agora: esquentando 1×/semana; pronto/abaixo a cada 2 semanas
-- (para ver se a nota cai ou sobe), até 2 anos depois do lançamento.
create or replace function public.pesca_para_checar(p_limit integer default 120)
returns table (tmdb_id integer, media_type text)
language sql
stable
security definer
set search_path = public
as $$
  select p.tmdb_id, p.media_type
  from public.pesca p
  where (p.status = 'esquentando' and (p.checado_em is null or p.checado_em < now() - interval '6 days'))
     or (p.status in ('pronto', 'abaixo') and p.checado_em < now() - interval '13 days'
         and (p.lancamento is null or p.lancamento > current_date - 730))
  order by p.checado_em nulls first, p.popularidade desc nulls last
  limit greatest(1, least(coalesce(p_limit, 120), 300));
$$;

-- ---------------------------------------------------------------------------
-- Avaliação: status, motivo, oráculo e humor sugeridos.
-- ---------------------------------------------------------------------------

create or replace function public.pesca_avaliar()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, curation
as $$
declare
  v_items jsonb;
  v_missing jsonb;
  v_result jsonb;
begin
  -- Entrou numa prateleira por outro caminho: adicionado.
  update public.pesca p
     set status = 'adicionado', adicionado_em = coalesce(p.adicionado_em, now()), motivo = 'já está numa prateleira'
   where p.status not in ('adicionado', 'descartado')
     and exists (
       select 1 from public.recommendation_pools rp
       where rp.mood_key <> 'random-surprise'
         and (case when p.media_type = 'movie' then rp.movie_ids else coalesce(rp.tv_ids, '[]'::jsonb) end) @> to_jsonb(p.tmdb_id));

  with calc as (
    select p.tmdb_id, p.media_type, p.nota, p.votos, p.lancamento, p.generos, p.idioma,
      (current_date - p.lancamento) d,
      case when p.media_type = 'movie' then 500 else 300 end thr_b,
      case when p.media_type = 'movie' then 200 else 100 end thr_f,
      case when p.media_type = 'movie' then 75 else 40 end piso,
      (select (h ->> 'nota')::numeric from jsonb_array_elements(p.historico) h
        where (h ->> 'em')::date <= current_date - 21 order by (h ->> 'em')::date desc limit 1) nota_antes
    from public.pesca p
    where p.status not in ('adicionado', 'descartado')
  ),
  st as (
    select c.*,
      coalesce(c.d >= 365 or (c.nota_antes is not null and abs(c.nota - c.nota_antes) <= 0.2), false) estavel,
      coalesce((c.votos >= c.thr_b and c.d >= 60) or (c.votos >= c.piso and c.d >= 180), false) quente,
      -- 6,46 arredondaria para "6,5" e confundiria com o corte: aí vão 2 casas.
      replace(to_char(c.nota, case when round(c.nota, 1) = 6.5 then 'FM90.00' else 'FM90.0' end), '.', ',') nota_txt
    from calc c
  ),
  decisao as (
    select st.*,
      case
        when st.lancamento is null or st.lancamento > current_date or st.nota is null then 'esquentando'
        when st.quente and st.estavel and st.nota > 6.5 then 'pronto'
        when st.quente and st.estavel then 'abaixo'
        when st.d > 730 then 'expirado'
        else 'esquentando'
      end novo
    from st
  )
  update public.pesca p set
    status = decisao.novo,
    pronto_em = case when decisao.novo = 'pronto' then coalesce(p.pronto_em, now()) else p.pronto_em end,
    oraculo_sugerido = case
      when p.media_type = 'tv' and coalesce(decisao.idioma, '') = 'ja' and coalesce(decisao.generos, '') ilike '%anima%' then 'cypher'
      when extract(year from decisao.lancamento) >= 2000 and decisao.votos >= decisao.thr_b then 'bogart'
      when extract(year from decisao.lancamento) <= 1999 and decisao.votos >= decisao.thr_f then 'fincher'
      else 'cypher' end,
    motivo = case decisao.novo
      when 'pronto' then format('nota %s com %s votos, estável', decisao.nota_txt, decisao.votos)
      when 'abaixo' then format('nota %s (6,5 ou menos) com %s votos', decisao.nota_txt, decisao.votos)
      when 'expirado' then format('não esquentou em 2 anos (%s votos)', coalesce(decisao.votos, 0))
      else case
        when decisao.lancamento is null or decisao.lancamento > current_date then 'ainda não lançado'
        when decisao.d < 60 then format('lançado há %s dias (espera 60); nota %s com %s votos', decisao.d, decisao.nota_txt, decisao.votos)
        when not decisao.quente then format('%s votos (Bogart a partir de %s; Cypher a partir de %s, com 180 dias)', decisao.votos, decisao.thr_b, decisao.piso)
        when decisao.nota_antes is null then format('nota %s com %s votos; esperando a 2ª medição (3 semanas) para ver se assentou', decisao.nota_txt, decisao.votos)
        else format('nota ainda mexendo: %s há 3 semanas, %s agora', replace(to_char(decisao.nota_antes, 'FM90.0'), '.', ','), decisao.nota_txt)
      end
    end
  from decisao
  where p.tmdb_id = decisao.tmdb_id and p.media_type = decisao.media_type;

  -- Humor sugerido para os prontos que já estão no cache (sem passar por cima
  -- de um humor escolhido na curadoria).
  select jsonb_agg(jsonb_build_object('id', p.tmdb_id, 'type', p.media_type)) into v_items
  from public.pesca p
  where p.status = 'pronto' and p.humores_sugeridos is null
    and exists (select 1 from public.movie_cache mc where mc.tmdb_id = p.tmdb_id and mc.media_type = p.media_type);
  if v_items is not null then
    with s as (select * from curation.sugerir_humores(v_items)),
    agg as (
      select s.tmdb_id, s.media_type,
             max(s.humor) filter (where s.ordem = 1) top,
             string_agg(s.humor || ' ' || s.pct || '%', ' · ' order by s.ordem) txt
      from s group by 1, 2
    )
    update public.pesca p
       set humor_sugerido = coalesce(p.humor_sugerido, agg.top),
           humores_sugeridos = agg.txt
      from agg
     where p.tmdb_id = agg.tmdb_id and p.media_type = agg.media_type;
  end if;

  -- Prontos que ainda não estão no cache do site: pede (até 50 por vez); o
  -- humor sai na próxima avaliação.
  select jsonb_agg(x) into v_missing from (
    select jsonb_build_object('id', p.tmdb_id, 'type', p.media_type) x
    from public.pesca p
    where p.status = 'pronto'
      and not exists (select 1 from public.movie_cache mc where mc.tmdb_id = p.tmdb_id and mc.media_type = p.media_type)
    order by p.pronto_em
    limit 50
  ) z;
  if v_missing is not null then
    perform curation.request_title_cache(v_missing, 'fill');
  end if;

  select jsonb_object_agg(status, n) into v_result from (select status, count(*) n from public.pesca group by status) z;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ações do Bruno (no SQL Editor do Supabase)
-- ---------------------------------------------------------------------------

-- Põe na prateleira. Sem humor/oráculo, usa os sugeridos.
-- Ex.: select pesca_adicionar(1311031, 'movie');
--      select pesca_adicionar(1311031, 'movie', 'adrenaline');
--      select pesca_adicionar(1311031, 'movie', 'adrenaline', 'cypher');
create or replace function public.pesca_adicionar(p_tmdb_id integer, p_media_type text default 'movie',
                                                  p_humor text default null, p_oraculo text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public, curation
as $$
declare
  r public.pesca%rowtype;
  v_humor text;
  v_oraculo text;
  v_col text;
  v_rows integer;
begin
  select * into r from public.pesca where tmdb_id = p_tmdb_id and media_type = p_media_type;
  if not found then
    raise exception 'O título % (%) não está na lista de pesca', p_tmdb_id, p_media_type;
  end if;
  v_humor := coalesce(p_humor, r.humor_sugerido);
  v_oraculo := coalesce(p_oraculo, r.oraculo_sugerido);
  if v_humor is null or v_humor not in ('mind-blowing', 'dark-and-scary', 'drug-trip', 'adventures', 'catharsis',
                                        'adrenaline', 'romantic', 'family-time', 'laugh-out-loud') then
    raise exception 'Humor inválido ou sem sugestão: passe um dos 9 (ex.: ''adrenaline'')';
  end if;
  if v_oraculo is null or v_oraculo not in ('bogart', 'fincher', 'cypher') then
    raise exception 'Oráculo inválido: bogart, fincher ou cypher';
  end if;
  if exists (
    select 1 from public.recommendation_pools rp
    where rp.mood_key <> 'random-surprise'
      and (case when p_media_type = 'movie' then rp.movie_ids else coalesce(rp.tv_ids, '[]'::jsonb) end) @> to_jsonb(p_tmdb_id)
  ) then
    update public.pesca set status = 'adicionado', adicionado_em = coalesce(adicionado_em, now()), motivo = 'já está numa prateleira'
     where tmdb_id = p_tmdb_id and media_type = p_media_type;
    return format('%s já estava numa prateleira', coalesce(r.titulo, p_tmdb_id::text));
  end if;

  v_col := case when p_media_type = 'movie' then 'movie_ids' else 'tv_ids' end;
  execute format(
    'update public.recommendation_pools set %1$I = coalesce(%1$I, ''[]''::jsonb) || to_jsonb($1) where card_type = $2 and mood_key = $3',
    v_col)
  using p_tmdb_id, v_oraculo, v_humor;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Prateleira %/% não encontrada', v_oraculo, v_humor;
  end if;

  -- O site só mostra o que está no cache.
  if not exists (select 1 from public.movie_cache where tmdb_id = p_tmdb_id and media_type = p_media_type) then
    perform curation.request_title_cache(jsonb_build_array(jsonb_build_object('id', p_tmdb_id, 'type', p_media_type)), 'fill');
  end if;

  update public.pesca
     set status = 'adicionado', adicionado_em = now(), humor_sugerido = v_humor, oraculo_sugerido = v_oraculo,
         motivo = format('adicionado em %s · %s', v_oraculo, v_humor)
   where tmdb_id = p_tmdb_id and media_type = p_media_type;

  -- A personalidade conta as notas dadas a filmes das prateleiras.
  if p_media_type = 'movie' then
    perform public.refresh_user_persona(um.user_id)
    from (select distinct user_id from public.user_movies where movie_id = p_tmdb_id and media_type = 'movie' and rating is not null) um;
  end if;

  return format('%s entrou em %s · %s', coalesce(r.titulo, p_tmdb_id::text), v_oraculo, v_humor);
end;
$$;

-- Tira da lista (não volta a aparecer; a busca diária não reabre).
create or replace function public.pesca_descartar(p_tmdb_id integer, p_media_type text default 'movie', p_motivo text default null)
returns text
language sql
volatile
security definer
set search_path = public
as $$
  update public.pesca
     set status = 'descartado', motivo = coalesce(p_motivo, 'descartado à mão')
   where tmdb_id = p_tmdb_id and media_type = p_media_type
  returning format('%s descartado', coalesce(titulo, tmdb_id::text));
$$;

-- ---------------------------------------------------------------------------
-- Visões para consultar
-- ---------------------------------------------------------------------------

create or replace view public.pesca_prontos with (security_invoker = true) as
select p.titulo, extract(year from p.lancamento)::int ano,
       case p.media_type when 'movie' then 'filme' else 'série' end tipo,
       p.nota, p.votos, p.oraculo_sugerido, p.humor_sugerido, p.humores_sugeridos, p.motivo, p.observacao,
       p.tmdb_id, p.media_type, p.pronto_em
from public.pesca p
where p.status = 'pronto'
order by p.pronto_em desc nulls last, p.nota desc;

create or replace view public.pesca_resumo with (security_invoker = true) as
select p.status,
       count(*) filter (where p.media_type = 'movie') filmes,
       count(*) filter (where p.media_type = 'tv') series,
       count(*) total
from public.pesca p
group by p.status
order by case p.status when 'pronto' then 1 when 'esquentando' then 2 when 'abaixo' then 3 when 'adicionado' then 4
                       when 'expirado' then 5 else 6 end;

-- ---------------------------------------------------------------------------
-- Agenda: todo dia 04h30 (Brasília) a função de borda busca e reconfere.
-- ---------------------------------------------------------------------------

create or replace function curation.pesca_tick()
returns bigint
language plpgsql
security definer
set search_path = curation, public
as $$
declare
  v_id bigint;
begin
  select net.http_post(
    url := 'https://hewixvcatnuqftalzmtg.supabase.co/functions/v1/pesca-lancamentos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhld2l4dmNhdG51cWZ0YWx6bXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MTY3NDMsImV4cCI6MjA2MDM5Mjc0M30.wK9jnuFFje_AtzqokWiuVYq2otYKW3rLPrIczw6ggFs',
      'x-internal-key', curation.internal_api_key()),
    body := jsonb_build_object('mode', 'run'),
    timeout_milliseconds := 150000
  ) into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: nada disso é para o site.
-- ---------------------------------------------------------------------------

revoke all on table public.pesca from anon, authenticated;
revoke all on table public.pesca_prontos from anon, authenticated;
revoke all on table public.pesca_resumo from anon, authenticated;
revoke all on function public.pesca_registrar(jsonb, text) from public, anon, authenticated;
revoke all on function public.pesca_para_checar(integer) from public, anon, authenticated;
revoke all on function public.pesca_avaliar() from public, anon, authenticated;
revoke all on function public.pesca_adicionar(integer, text, text, text) from public, anon, authenticated;
revoke all on function public.pesca_descartar(integer, text, text) from public, anon, authenticated;
revoke all on function curation.sugerir_humores(jsonb) from public, anon, authenticated;
revoke all on function curation.pesca_tick() from public, anon, authenticated;
grant execute on function public.pesca_registrar(jsonb, text) to service_role;
grant execute on function public.pesca_para_checar(integer) to service_role;
grant execute on function public.pesca_avaliar() to service_role;
grant select, insert, update on table public.pesca to service_role;

select cron.schedule('pesca-diaria', '30 7 * * *', $$select curation.pesca_tick()$$);
