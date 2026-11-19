-- Fumaça do banco (19/11/2026, Protocolo Reborn, onda 3).
--
-- Teste rápido das funções que a tela mais usa. Roda inteiro dentro de uma
-- transação que é DESFEITA no fim: nada fica gravado. A resposta é uma tabela
-- (conferencia, ok, detalhe); qualquer ok = false é para olhar antes de
-- publicar. Como rodar e as regras para acrescentar conferências: README.md
-- desta pasta.
--
-- A conta de teste é escolhida na hora (a de biblioteca maior entre as
-- visíveis). Nenhum id de conta fica escrito aqui: o repositório é público.

begin;

create temp table _r (n serial, conferencia text, ok boolean, detalhe text) on commit drop;
grant all on _r to anon, authenticated;
grant usage on sequence _r_n_seq to anon, authenticated;

create temp table _ctx on commit drop as
select
  -- a conta de teste: biblioteca maior entre as contas de gente, visíveis
  (select um.user_id
     from user_movies um
    where um.rating is not null and not public.is_hidden_account(um.user_id)
      and not exists (select 1 from bot_accounts b where b.user_id = um.user_id)
    group by um.user_id order by count(*) desc limit 1) as uid,
  -- um "estranho": id que não existe (logado, sem amizade com ninguém)
  gen_random_uuid() as stranger,
  -- um filme e uma série que a conta de teste avaliou
  null::int as movie_id,
  null::int as tv_id,
  -- 20 filmes das prateleiras que a conta de teste ainda não avaliou (lidos
  -- aqui, como dono do banco: a tabela pool_titles não é aberta à tela)
  null::int[] as candidates;
update _ctx set
  candidates = (select array_agg(t.tmdb_id) from (
      select distinct pt.tmdb_id from pool_titles pt
       where pt.media_type = 'movie'
         and not exists (select 1 from user_movies um where um.user_id = _ctx.uid and um.movie_id = pt.tmdb_id and um.media_type = 'movie')
       limit 20) t),
  movie_id = (select um.movie_id from user_movies um where um.user_id = _ctx.uid and um.media_type = 'movie' and um.rating is not null order by um.created_at desc limit 1),
  tv_id = (select um.movie_id from user_movies um where um.user_id = _ctx.uid and um.media_type = 'tv' and um.rating is not null order by um.created_at desc limit 1)
where true;
grant select on _ctx to anon, authenticated;

-- Quem "está logado" a partir daqui. Uso: select pg_temp.act(uid) / pg_temp.act(null) para visitante.
create function pg_temp.act(p_uid uuid) returns void language plpgsql as $f$
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  end if;
end $f$;

-- Uma chamada que pode recusar (ex.: Jackpot fechado para a conta) vira um
-- detalhe na tabela, em vez de derrubar o teste inteiro.
create function pg_temp.safe(p_sql text) returns jsonb language plpgsql as $f$
declare j jsonb;
begin
  execute p_sql into j;
  return j;
exception when others then
  return jsonb_build_object('__erro', sqlerrm);
end $f$;

-- =========================================================================
-- 0. O motor da previsão (a tela não chama direto: só por get_title_prediction
--    e pelas prateleiras; aqui, como dono do banco)
-- =========================================================================
insert into _r (conferencia, ok, detalhe)
select 'predict_ratings: notas de 0 a 10 para títulos não vistos',
       count(*) > 0 and bool_and(p.predicted_rating between 0 and 10) and bool_and(p.chance_9plus between 0 and 1),
       count(*) || ' previsões, de ' || min(p.predicted_rating) || ' a ' || max(p.predicted_rating)
  from predict_ratings((select uid from _ctx), 'movie', (select candidates from _ctx), null) p;

-- =========================================================================
-- 1. Como a conta de teste
-- =========================================================================
select pg_temp.act((select uid from _ctx));
set local role authenticated;

-- a ida única da casca
insert into _r (conferencia, ok, detalhe)
select 'get_app_bootstrap: devolve as partes pedidas, sem erro',
       (b -> 'parts') ? 'unread' and (b -> 'parts') ? 'profile' and (b -> 'parts') ? 'premium'
         and coalesce(b -> 'errors', '{}'::jsonb) = '{}'::jsonb,
       'partes: ' || coalesce((select string_agg(k, ', ' order by k) from jsonb_object_keys(b -> 'parts') k), 'nenhuma')
         || '; erros: ' || coalesce(b ->> 'errors', '{}')
  from (select get_app_bootstrap(array['unread', 'profile', 'premium'], '{}'::jsonb) b) s;

-- convite: limite de 3
insert into _r (conferencia, ok, detalhe)
select 'get_my_invite: limite de 3 convites',
       coalesce((i ->> 'limit')::int = 3 and (i ->> 'left')::int between 0 and 3 and length(i ->> 'code') > 0, false),
       coalesce(i ->> '__erro', 'limit ' || (i ->> 'limit') || ', left ' || (i ->> 'left'))
  from (select pg_temp.safe('select get_my_invite()') i) s;

-- resumo do título (onda 3): as bolhas e a relação da pessoa com o título
insert into _r (conferencia, ok, detalhe)
select 'get_title_social: lista de até 5 bolhas',
       jsonb_typeof(s.j) = 'array' and jsonb_array_length(s.j) <= 5,
       jsonb_array_length(s.j) || ' bolhas'
  from (select get_title_social((select movie_id from _ctx), 'movie', 5) j) s;

insert into _r (conferencia, ok, detalhe)
select 'get_title_me: relação, prateleiras, comentários e previsão',
       s.j ? 'relation' and s.j ? 'episodes' and s.j ? 'pools' and s.j ? 'oracle_comments' and s.j ? 'prediction'
         and (s.j -> 'relation' ->> 'rating') is not null
         and jsonb_typeof(s.j -> 'prediction') = 'object',
       'nota ' || coalesce(s.j -> 'relation' ->> 'rating', 'nula') || '; previsão ' || coalesce(jsonb_typeof(s.j -> 'prediction'), 'ausente')
  from (select get_title_me((select movie_id from _ctx), 'movie', true) j) s;

insert into _r (conferencia, ok, detalhe)
select 'get_title_me (série): episódios vistos em lista',
       jsonb_typeof(s.j -> 'episodes') = 'array',
       jsonb_array_length(s.j -> 'episodes') || ' episódios'
  from (select get_title_me((select tv_id from _ctx), 'tv', false) j) s
 where (select tv_id from _ctx) is not null;

-- os números do Perfil (onda 3): batem com a contagem direta da biblioteca
insert into _r (conferencia, ok, detalhe)
select 'get_profile_stats_v2: contagem e distribuição batem com a biblioteca',
       (s.j ->> 'ratedMoviesCount')::int = d.n
         and (select sum(v::int) from jsonb_each_text(s.j -> 'ratingDistribution') e(k, v)) = d.n
         and (s.j ->> 'totalWatchTime')::numeric > 0
         and jsonb_typeof(s.j -> 'countries') = 'object',
       (s.j ->> 'ratedMoviesCount') || ' títulos, ' || (s.j ->> 'totalWatchTime') || ' min, '
         || (select count(*) from jsonb_object_keys(s.j -> 'countries')) || ' países'
  from (select get_profile_stats_v2((select uid from _ctx)) j) s,
       (select count(*)::int n from user_movies um where um.user_id = (select uid from _ctx) and um.rating is not null) d;

-- as tags calculadas no servidor (onda 3): o formato TagProgress e o registro
insert into _r (conferencia, ok, detalhe)
select 'get_tag_progress: o formato TagProgress, com a contagem da biblioteca',
       s.j ? 'basic' and s.j ? 'theme' and s.j ? 'oracle' and s.j ? 'specialTags' and s.j ? 'gameTags' and s.j ? 'pokerUpcomingTags'
         and (s.j ->> 'ratedCount')::int = d.n
         and (select count(*) from jsonb_object_keys(s.j -> 'basic')) > 0
         and (select count(*) from jsonb_object_keys(s.j -> 'theme')) > 0
         and (select count(*) from jsonb_object_keys(s.j -> 'oracle')) > 0,
       (s.j ->> 'ratedCount') || ' avaliados, ' || (s.j ->> 'followers') || ' amigos, '
         || jsonb_array_length(s.j -> 'gameTags') || ' tags de Jogos, ' || pg_column_size(s.j) || ' bytes'
  from (select get_tag_progress() j) s,
       (select count(*)::int n from user_movies um where um.user_id = (select uid from _ctx) and um.rating is not null) d;

-- (o rollback desfaz o registro e os avisos que esta chamada gerar)
insert into _r (conferencia, ok, detalhe)
select 'sync_my_tags: devolve um número (quantas tags novas viraram aviso)',
       jsonb_typeof(s.j) = 'number', s.j::text
  from (select pg_temp.safe('select to_jsonb(sync_my_tags())') j) s;

reset role;

-- =========================================================================
-- 2. Privacidade: visitante e conta sem amizade
-- =========================================================================
-- linhas de contas escondidas ou de perfis fechados que cada um enxerga (tem de ser 0)
select pg_temp.act(null);
set local role anon;
insert into _r (conferencia, ok, detalhe)
select 'user_movies: visitante não enxerga contas escondidas nem perfis fechados',
       count(*) = 0, count(*) || ' linhas indevidas'
  from user_movies um
 where um.user_id = any(private.rls_hidden_owner_ids());
insert into _r (conferencia, ok, detalhe)
select 'get_title_social: visitante não tem permissão de chamar',
       coalesce(s.j ->> '__erro', '') like 'permission denied%', left(s.j::text, 80)
  from (select pg_temp.safe(format('select get_title_social(%s, %L, 5)', (select movie_id from _ctx), 'movie')) j) s;
insert into _r (conferencia, ok, detalhe)
select 'get_title_me: visitante sem relação, sem episódios, sem previsão',
       (s.j -> 'relation') = 'null'::jsonb and (s.j -> 'episodes') = '[]'::jsonb and (s.j -> 'prediction') = 'null'::jsonb,
       left(s.j::text, 80)
  from (select get_title_me((select movie_id from _ctx), 'movie', true) j) s;
insert into _r (conferencia, ok, detalhe)
select 'get_tag_progress: visitante não tem permissão de chamar',
       coalesce(s.j ->> '__erro', '') like 'permission denied%', left(s.j::text, 80)
  from (select pg_temp.safe('select get_tag_progress()') j) s;
insert into _r (conferencia, ok, detalhe)
select 'get_profile_stats_v2: visitante recebe zeros de perfil que não pode ver',
       coalesce(bool_and((get_profile_stats_v2(h) ->> 'ratedMoviesCount')::int = 0), true),
       count(*) || ' perfil(is) fechado(s) ou escondido(s) conferido(s)'
  from unnest(private.rls_hidden_owner_ids()) h;
reset role;

select pg_temp.act((select stranger from _ctx));
set local role authenticated;
insert into _r (conferencia, ok, detalhe)
select 'user_movies: conta sem amizade não enxerga contas escondidas nem perfis fechados',
       count(*) = 0, count(*) || ' linhas indevidas'
  from user_movies um
 where um.user_id = any(private.rls_hidden_owner_ids());
reset role;

-- =========================================================================
-- 3. Sussurros ao vivo: o aviso sai, e só a própria pessoa entra no tópico
-- =========================================================================
insert into public.friend_indications (to_user_id, type, tag_name, tag_emoji, tag_category)
select uid, 'tag_unlocked', 'fumaça', '🧪', 'fumaça' from _ctx;

insert into _r (conferencia, ok, detalhe)
select 'sussurro novo gera o ping no tópico da pessoa',
       count(*) = 1 and bool_and(m.private) and max(m.event) = 'ping' and max(m.payload ->> 'kind') = 'whisper',
       count(*) || ' mensagem(ns), tipo ' || coalesce(max(m.payload ->> 'type'), '?')
  from realtime.messages m
 where m.topic = 'user:' || (select uid from _ctx)::text;

select pg_temp.act((select uid from _ctx));
select set_config('realtime.topic', 'user:' || (select uid from _ctx)::text, true);
set local role authenticated;
insert into _r (conferencia, ok, detalhe)
select 'a própria pessoa entra no tópico dela', count(*) = 1, count(*) || ' visível(is)'
  from realtime.messages m where m.topic = 'user:' || (select uid from _ctx)::text;
reset role;

select pg_temp.act((select stranger from _ctx));
set local role authenticated;
insert into _r (conferencia, ok, detalhe)
select 'outra conta não entra no tópico alheio', count(*) = 0, count(*) || ' visível(is)'
  from realtime.messages m where m.topic = 'user:' || (select uid from _ctx)::text;
reset role;

-- =========================================================================
create temp table _saida on commit drop as select conferencia, ok, detalhe from _r order by n;
select * from _saida;
rollback;
