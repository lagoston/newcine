-- WP-DB · bloco de aceite (§8.4). Roda inteiro e termina em raise exception:
-- nada fica gravado (nem a nota de teste, nem tiragens). Os números saem na
-- mensagem do erro "DRYRUN {...}".
do $dry$
declare
  v_bruno uuid := '17bef49a-2c3f-40c9-a9b5-a741946b1b1b';
  v_tonico uuid := '2e15d9d0-cca4-4c63-92da-495dc1346826';
  v_bot uuid;
  v_out jsonb := '{}'::jsonb;
  v_t0 timestamptz; v_p jsonb; v_p2 jsonb; v_r jsonb; v_r2 jsonb; v_b jsonb;
  v_bog uuid; v_fin uuid; v_cyp uuid; v_c jsonb; v_x jsonb; v_id int; v_mt text; v_n int;
begin
  -- 0) catálogo (só se ainda não foi construído nesta transação)
  if not exists (select 1 from public.mesa_titles) then
    v_t0 := clock_timestamp();
    v_b := public.mesa_build_titles();
    v_out := v_out || jsonb_build_object('build', v_b, 'build_wall_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
  end if;
  v_out := v_out || jsonb_build_object('titles', (select count(*) from public.mesa_titles),
                                       'title_kw', (select count(*) from public.mesa_title_kw),
                                       'kw', (select count(*) from public.mesa_kw),
                                       'title_occ', (select count(*) from public.mesa_title_occasions));

  -- 1) Bruno: primeira abertura (sem vetor, se não aquecido), segunda (gravada)
  perform set_config('request.jwt.claims', json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_t0 := clock_timestamp();
  v_p := public.mesa_get();
  v_out := v_out || jsonb_build_object('bruno_first_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
  v_t0 := clock_timestamp();
  v_p2 := public.mesa_get();
  v_out := v_out || jsonb_build_object('bruno_stored_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int,
    'det_same_draw', (v_p->>'draw_id') = (v_p2->>'draw_id'),
    'det_same_ids', (select jsonb_agg(c->'title'->'tmdb_id') from jsonb_array_elements(v_p->'cards') c)
                    = (select jsonb_agg(c->'title'->'tmdb_id') from jsonb_array_elements(v_p2->'cards') c),
    'bruno', jsonb_build_object('mode', v_p->'mode', 'host', v_p->'host', 'passed', v_p->'passed', 'facts', v_p->'facts',
       'me', v_p->'me', 'asks', v_p->'asks', 'book', v_p->'book', 'verdicts', v_p->'verdicts',
       'cards', (select jsonb_agg(jsonb_build_object('seat', c->'seat', 'kind', c->'kind', 'id', c->'title'->'tmdb_id', 'mt', c->'title'->'media_type',
                   't', c->'title'->>'title_pt', 'mood', c->'title'->'mood', 'dir', c->'title'->'director', 'pred', c->'pred', 'sealed', c->'sealed',
                   'reason', c->'reason', 'ev', c->'evidence', 'cm', left(c->'comment'->>'pt', 30), 'lf', c->'line_facts'))
                 from jsonb_array_elements(v_p->'cards') c),
       'card0_keys', (select jsonb_agg(k) from jsonb_object_keys(v_p->'cards'->0) k),
       'title_keys', (select jsonb_agg(k) from jsonb_object_keys(v_p->'cards'->0->'title') k)));

  -- pisos (conferidos no servidor, com os dados gravados)
  execute 'reset role';
  select jsonb_build_object(
    'bogart_pred', (select c.pred from public.mesa_cards c where c.draw_id = (v_p->>'draw_id')::uuid and c.seat = 'bogart' and c.gen = 0),
    'cypher_mu', (select c.mu from public.mesa_cards c where c.draw_id = (v_p->>'draw_id')::uuid and c.seat = 'cypher' and c.gen = 0),
    'cypher_mood_in_top3', (select c.mood = any(public.mesa_top3(v_bruno)) from public.mesa_cards c where c.draw_id = (v_p->>'draw_id')::uuid and c.seat = 'cypher' and c.gen = 0),
    'any_rated', exists (select 1 from public.mesa_cards c join public.user_movies um on um.user_id = v_bruno and um.movie_id = c.tmdb_id and um.media_type = c.media_type and um.rating is not null
                          where c.draw_id = (v_p->>'draw_id')::uuid and c.gen = 0),
    'dirs_distinct', (select count(distinct t.director_key) = count(t.director_key) from public.mesa_cards c join public.mesa_titles t on t.media_type = c.media_type and t.tmdb_id = c.tmdb_id
                       where c.draw_id = (v_p->>'draw_id')::uuid and c.seat <> 'espelho'),
    'series', (select count(*) from public.mesa_cards c where c.draw_id = (v_p->>'draw_id')::uuid and c.media_type = 'tv' and c.seat <> 'espelho'),
    'reserves', (select jsonb_object_agg(e.key, jsonb_array_length(e.value)) from public.mesa_draws d cross join lateral jsonb_each(d.reserves) e where d.id = (v_p->>'draw_id')::uuid),
    'vec', (select jsonb_object_agg(uv.media_type, jsonb_build_object('n', cardinality(uv.ids), 'ms', uv.ms)) from public.mesa_user_vec uv where uv.user_id = v_bruno))
    into v_x;
  v_out := v_out || jsonb_build_object('floors', v_x);
  execute 'set local role authenticated';

  -- 2) pergunta de humor (com vetor pronto) e repetição
  v_t0 := clock_timestamp();
  v_r := public.mesa_get('mood:romantic');
  v_out := v_out || jsonb_build_object('ask_mood_first_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
  v_r2 := public.mesa_get('mood:romantic');
  v_out := v_out || jsonb_build_object('ask_mood_same', (select jsonb_agg(c->'title'->'tmdb_id') from jsonb_array_elements(v_r->'cards') c)
                                                       = (select jsonb_agg(c->'title'->'tmdb_id') from jsonb_array_elements(v_r2->'cards') c),
    'ask_mood', jsonb_build_object('ask', v_r->'ask', 'passed', v_r->'passed',
       'cards', (select jsonb_agg(jsonb_build_object('seat', c->'seat', 'id', c->'title'->'tmdb_id', 't', c->'title'->>'title_pt', 'mt', c->'title'->'media_type',
                   'mood', c->'title'->'mood', 'pred', c->'pred'->'value', 'r', c->'reason'->>'type', 'ev', (select jsonb_agg(e->>'type') from jsonb_array_elements(c->'evidence') e)))
                 from jsonb_array_elements(v_r->'cards') c)));
  v_t0 := clock_timestamp();
  v_r := public.mesa_get('occ:chuva');
  v_out := v_out || jsonb_build_object('ask_occ_chuva_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int,
    'ask_occ_chuva', case when v_r ? 'error' then v_r else jsonb_build_object('passed', v_r->'passed',
       'cards', (select jsonb_agg(jsonb_build_object('seat', c->'seat', 't', c->'title'->>'title_pt', 'rt', c->'title'->'runtime', 'r', c->'reason'))
                 from jsonb_array_elements(v_r->'cards') c)) end,
    'ask_bad', public.mesa_get('xx:yy'), 'ask_season_off', public.mesa_get('season:christmas'));

  -- 3) Acervo e Livro
  v_t0 := clock_timestamp();
  v_r := public.mesa_acervo('fincher', 'dark-and-scary', 'movie', 0, 30);
  v_out := v_out || jsonb_build_object('acervo_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int,
    'acervo', jsonb_build_object('total', v_r->'total', 'unrated', v_r->'unrated_total', 'next', v_r->'next_offset', 'label', v_r->'pred_label',
                                 'n', jsonb_array_length(v_r->'items'), 'first', v_r->'items'->0),
    'acervo_bad', public.mesa_acervo('zz', 'dark-and-scary'));

  -- 4) segurança como authenticated
  begin
    perform count(*) from public.mesa_cards;
    v_out := v_out || jsonb_build_object('sec_select_cards', 'ALLOWED');
  exception when others then
    v_out := v_out || jsonb_build_object('sec_select_cards', sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform public.mesa_build_titles();
    v_out := v_out || jsonb_build_object('sec_internal', 'ALLOWED');
  exception when others then
    v_out := v_out || jsonb_build_object('sec_internal', sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform * from public.predict_ratings(v_bruno, 'movie', array[694], null);
    v_out := v_out || jsonb_build_object('sec_predict', 'ALLOWED');
  exception when others then
    v_out := v_out || jsonb_build_object('sec_predict', sqlstate || ' ' || sqlerrm);
  end;

  -- 5) o selo e os gestos
  select (c->>'id')::uuid into v_bog from jsonb_array_elements(v_p->'cards') c where c->>'seat' = 'bogart';
  select (c->>'id')::uuid into v_fin from jsonb_array_elements(v_p->'cards') c where c->>'seat' = 'fincher';
  select (c->>'id')::uuid into v_cyp from jsonb_array_elements(v_p->'cards') c where c->>'seat' = 'cypher';
  v_out := v_out || jsonb_build_object('seal_before', public.mesa_react(v_cyp, 'flip'));
  v_r := public.mesa_react(v_bog, 'flip');
  v_r2 := public.mesa_react(v_fin, 'flip');
  v_out := v_out || jsonb_build_object('flip_bog_ok', v_r->'ok', 'flip_fin_ok', v_r2->'ok', 'react_keys', (select jsonb_agg(k) from jsonb_object_keys(v_r) k),
                                       'seal_after', public.mesa_react(v_cyp, 'flip')->'ok',
                                       'seen_unrated', public.mesa_react(v_bog, 'seen'),
                                       'want_unlisted', public.mesa_react(v_bog, 'want'),
                                       'bad_action', public.mesa_react(v_bog, 'boom'));

  -- 6) o gatilho: a nota gravada pelo caminho de sempre preenche a profecia
  execute 'reset role';
  select c.tmdb_id, c.media_type into v_id, v_mt from public.mesa_cards c where c.id = v_bog;
  insert into public.user_movies (user_id, movie_id, media_type, rating) values (v_bruno, v_id, v_mt, 9);
  v_out := v_out || jsonb_build_object('trigger_card', (select jsonb_build_object('rating', c.rating, 'verdict', c.verdict, 'ack', c.verdict_ack, 'pred', c.pred)
                                                         from public.mesa_cards c where c.id = v_bog),
                                       'trigger_dirty', exists (select 1 from public.mesa_vec_dirty q where q.user_id = v_bruno));
  execute 'set local role authenticated';
  v_t0 := clock_timestamp();
  v_r := public.mesa_react(v_bog, 'seen');
  v_out := v_out || jsonb_build_object('seen_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int,
    'seen', jsonb_build_object('ok', v_r->'ok', 'card_state', v_r->'card'->'state', 'verdict', v_r->'verdict',
       'repl', jsonb_build_object('state', v_r->'replacement'->'state', 'gen', v_r->'replacement'->'gen', 'seat', v_r->'replacement'->'seat',
                                  't', v_r->'replacement'->'title'->>'title_pt', 'r', v_r->'replacement'->'reason'->>'type'),
       'me', v_r->'me', 'persona', v_r->'persona'));

  -- 7) recusa: 1ª traz a 2ª opinião, 2ª passa a vez
  v_r := public.mesa_react(v_fin, 'refuse');
  v_r2 := public.mesa_react((v_r->'replacement'->>'id')::uuid, 'refuse');
  v_out := v_out || jsonb_build_object('refuse1', jsonb_build_object('ok', v_r->'ok', 'second_opinion', v_r->'replacement'->'second_opinion',
                                                                     'state', v_r->'replacement'->'state', 'pass', v_r->'pass'),
                                       'refuse2', jsonb_build_object('ok', v_r2->'ok', 'replacement', v_r2->'replacement', 'pass', v_r2->'pass'));
  v_out := v_out || jsonb_build_object('payload_after', (select jsonb_build_object('passed', x->'passed',
        'cards', (select jsonb_agg(jsonb_build_object('seat', c->'seat', 'gen', c->'gen', 'state', c->'state')) from jsonb_array_elements(x->'cards') c))
      from (select public.mesa_get() as x) z));

  -- 8) Livro e ack
  v_r := public.mesa_book();
  v_out := v_out || jsonb_build_object('book', jsonb_build_object('wkb', v_r->'who_knows_best', 'next', v_r->'next_before', 'days', jsonb_array_length(v_r->'days'),
                                       'entries', (select jsonb_agg(jsonb_build_object('seat', e->'seat', 'state', e->'state', 'rating', e->'rating', 'verdict', e->'verdict', 'keys', (select jsonb_agg(k) from jsonb_object_keys(e) k)))
                                                     from jsonb_array_elements(v_r->'days'->0->'entries') e)),
                                       'ack', public.mesa_ack(array[v_bog]));

  -- 9) outra pessoa: Tonico (reconhecimento) e a carta alheia
  perform set_config('request.jwt.claims', json_build_object('sub', v_tonico, 'role', 'authenticated')::text, true);
  v_t0 := clock_timestamp();
  v_r := public.mesa_get();
  v_out := v_out || jsonb_build_object('tonico_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int,
    'tonico', jsonb_build_object('mode', v_r->'mode', 'host', v_r->'host', 'passed', v_r->'passed', 'me', v_r->'me',
      'cards', (select jsonb_agg(jsonb_build_object('seat', c->'seat', 'kind', c->'kind', 'id', c->'title'->'tmdb_id', 't', c->'title'->>'title_pt',
                   'mood', c->'title'->'mood', 'pred', c->'pred', 'sealed', c->'sealed', 'reason', c->'reason')) from jsonb_array_elements(v_r->'cards') c)),
    'foreign_card', public.mesa_react(v_cyp, 'flip'));
  select (c->>'id')::uuid into v_bog from jsonb_array_elements(v_r->'cards') c where c->>'seat' = 'bogart';
  perform public.mesa_react(v_bog, 'flip');
  v_r2 := public.mesa_react(v_bog, 'not_seen');
  v_out := v_out || jsonb_build_object('tonico_not_seen', jsonb_build_object('ok', v_r2->'ok', 'repl_kind', v_r2->'replacement'->'kind',
                                       'repl_state', v_r2->'replacement'->'state', 't', v_r2->'replacement'->'title'->>'title_pt'));

  -- 10) anon não chama nada
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform public.mesa_get();
    v_out := v_out || jsonb_build_object('sec_anon', 'ALLOWED');
  exception when others then
    v_out := v_out || jsonb_build_object('sec_anon', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- 11) nota de bot não mexe em nada
  select b.user_id into v_bot from public.bot_accounts b order by b.created_at limit 1;
  select n into v_n from (select count(*) as n from public.mesa_vec_dirty) z;
  insert into public.user_movies (user_id, movie_id, media_type, rating)
  select v_bot, t.tmdb_id, t.media_type, 8 from public.mesa_titles t
   where not exists (select 1 from public.user_movies um where um.user_id = v_bot and um.movie_id = t.tmdb_id and um.media_type = t.media_type)
   order by t.tmdb_id limit 1;
  v_out := v_out || jsonb_build_object('bot_dirty', exists (select 1 from public.mesa_vec_dirty q where q.user_id = v_bot));

  -- 12) erro dentro do gatilho não bloqueia a nota (raise simulado no bloco)
  create or replace function public.mesa_on_rating()
  returns trigger language plpgsql security definer set search_path = public, pg_temp as $f$
  begin
    begin
      raise exception 'simulado';
    exception when others then
      null;
    end;
    return null;
  end $f$;
  insert into public.user_movies (user_id, movie_id, media_type, rating)
  select v_tonico, t.tmdb_id, t.media_type, 7 from public.mesa_titles t
   where not exists (select 1 from public.user_movies um where um.user_id = v_tonico and um.movie_id = t.tmdb_id and um.media_type = t.media_type)
   order by t.tmdb_id limit 1;
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('trigger_error_rating_saved', v_n = 1);

  raise exception 'DRYRUN %', v_out::text;
end $dry$;
