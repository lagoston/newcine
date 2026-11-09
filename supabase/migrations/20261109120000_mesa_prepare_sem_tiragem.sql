-- 09/11/2026: o cron das 06:40 (mesa-prepare-day) deixa de montar a tiragem do dia para todo mundo.
-- Por quê: as cartas saíram do site (o Acervo virou a página única da Mesa, commit 8183a7b), então a
-- tiragem pré-montada não é vista por ninguém no site e custava ~54 s por noite (a do Bruno ~15 s,
-- por causa da CTE refused_kw). O que o Acervo precisa é do vetor de previsões quente: isso continua.
-- A tiragem só continua para quem abriu a Mesa antiga nos últimos 3 dias — na prática, quem ainda está
-- no APK antigo (os assets vêm empacotados). Quando o APK novo sair, esse grupo some sozinho.
-- Só create or replace das duas funções; nada é apagado.

create or replace function public.mesa_prepare_day()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.mesa_prepare_day_for(array(
    select x.user_id from (
      -- quem abriu o Acervo (mesa_acervo2 grava last_visit_day na 1ª página) nas últimas duas semanas
      select st.user_id from public.mesa_user_state st where st.last_visit_day >= public.mesa_day() - 14
      union
      -- quem ainda usa a Mesa antiga (APK) nas últimas duas semanas
      select dr.user_id from public.mesa_draws dr where dr.day >= public.mesa_day() - 14
      union
      -- quem avaliou algo na última semana (o vetor muda com a nota)
      select um.user_id from public.user_movies um
       where um.rating is not null and coalesce(um.updated_at, um.created_at) >= now() - interval '7 days'
    ) x
    where not exists (select 1 from public.bot_accounts b where b.user_id = x.user_id)
    order by x.user_id))
$function$;

create or replace function public.mesa_prepare_day_for(p_users uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_t0 timestamptz := clock_timestamp();
  v_u uuid; v_mt text; v_fp text; v_at timestamptz;
  v_ok int := 0; v_fail int := 0; v_draws int := 0; v_err jsonb := '[]'::jsonb;
  v_day date := public.mesa_day();
begin
  foreach v_u in array coalesce(p_users, '{}'::uuid[]) loop
    continue when v_u is null or exists (select 1 from public.bot_accounts b where b.user_id = v_u);
    continue when not exists (select 1 from auth.users au where au.id = v_u);
    begin
      -- o vetor de previsões (filmes e séries) é o que o Acervo ordena; renova se mudou ou tem mais de 3 dias
      foreach v_mt in array array['movie','tv'] loop
        select uv.fingerprint, uv.computed_at into v_fp, v_at
          from public.mesa_user_vec uv where uv.user_id = v_u and uv.media_type = v_mt;
        if not found or v_fp is distinct from public.mesa_fingerprint(v_u) or v_at < now() - interval '3 days' then
          perform public.mesa_refresh_vec(v_u, v_mt);
        end if;
      end loop;
      -- 09/11/2026: tiragem só para quem virou carta da Mesa antiga nos últimos 3 dias (APK antigo)
      if exists (select 1 from public.mesa_cards c
                  where c.user_id = v_u and c.day >= v_day - 3 and c.flipped_at is not null) then
        perform public.mesa_draw_create(v_u, v_day, 'daily', 'all');
        v_draws := v_draws + 1;
      end if;
      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      v_err := v_err || jsonb_build_array(jsonb_build_object('user', v_u, 'error', left(sqlerrm, 300)));
    end;
  end loop;
  insert into public.mesa_meta (key, value, updated_at)
  values ('prepare_log', jsonb_build_object('at', now(), 'day', v_day, 'ok', v_ok, 'fail', v_fail, 'draws', v_draws,
                                            'errors', v_err, 'ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('ok', v_ok, 'fail', v_fail, 'draws', v_draws, 'ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $function$;
