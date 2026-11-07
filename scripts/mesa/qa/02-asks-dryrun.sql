-- WP-QA · 05/11/2026 · todas as perguntas da mão para uma pessoa, em dry-run.
-- Por que: o aceite do WP-DB só testou occ:chuva e mood:romantic; o QA precisa
-- ver as 3 cartas de cada ocasião/humor para julgar se o tom bate (família sem
-- título pesado, 90 min ≤ 90, episódio curto...). Termina em raise exception:
-- nenhuma tiragem fica gravada. Trocar :uid e a lista de :asks antes de rodar.
do $dry$
declare
  v_uid uuid := '17bef49a-2c3f-40c9-a9b5-a741946b1b1b';   -- Bruno (ou Tonico 2e15d9d0-cca4-4c63-92da-495dc1346826)
  v_asks text[] := array['occ:chuva','occ:amor','occ:familia','occ:galera','occ:noventa','occ:episodio',
                         'occ:maratona','occ:chorar','occ:rir','occ:susto','occ:no','occ:colo'];
  v_ask text; v_p jsonb; v_t0 timestamptz; v_ms int; v_out jsonb := '{}'::jsonb; v_line text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach v_ask in array v_asks loop
    v_t0 := clock_timestamp();
    v_p := public.mesa_get(v_ask);
    v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::int;
    if v_p ? 'error' then
      v_out := v_out || jsonb_build_object(v_ask, v_p);
      continue;
    end if;
    select string_agg(format('%s|%s|%s|%s|rt%s|ep%s|s%s|%s|%s|p%s',
             c->>'seat', c->'title'->>'title_pt', c->'title'->>'year', c->'title'->>'media_type',
             coalesce(c->'title'->>'runtime','-'), coalesce(c->'title'->>'ep_runtime','-'), coalesce(c->'title'->>'seasons','-'),
             c->'title'->>'mood', c->'reason'->>'type', coalesce(c->'pred'->>'value','-')), ' ;; ')
      into v_line from jsonb_array_elements(v_p->'cards') c;
    v_out := v_out || jsonb_build_object(v_ask, jsonb_build_object('ms', v_ms, 'passed', v_p->'passed', 'c', v_line));
  end loop;
  raise exception 'DRYRUN %', v_out::text;
end $dry$;
