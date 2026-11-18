-- 18/11/2026 — Protocolo Reborn, onda 2 do banco (achado A4 de
-- claude/otimizacao/banco.md e A2 / 4.3 / 4.4 de claude/otimizacao/rede.md).
--
-- A abertura do app pede a "casca" em rajada: premium, vitalício, diretor,
-- sussurros não lidos, evento sazonal, OVNI do Jackpot e a linha do próprio
-- perfil — ~11 pedidos (e os preflights deles), cada um numa conexão do
-- banco ao mesmo tempo. Medido em 18/11: funções de 10–165 ms sozinhas
-- levavam 0,4–2,7 s dentro da rajada.
--
-- get_app_bootstrap é uma RPC NOVA (só acréscimo: as antigas continuam
-- iguais para o APK antigo) que devolve as partes pedidas numa ida só.
--
-- O contrato, para a tela:
--   parts.<nome> é EXATAMENTE o que supabase.rpc('<original>', …).data
--   devolveria para quem chamou (o ensaio compara parte por parte):
--     premium        get_user_premium_status(eu)            boolean
--     lifetime       is_lifetime_premium(eu)                boolean
--     director       get_director_state()                   objeto
--     unread         count_unread_indications(eu)           número
--     seasonal       get_seasonal_event_state(args.preview) objeto ou null
--     ufo            jackpot_ufo_status()                   objeto
--     profile        a própria linha de profiles, com as colunas de
--                    src/lib/data/me.ts (MY_PROFILE_COLUMNS)  objeto ou null
--     -- as de baixo só vêm quando pedidas em p_parts (são as pesadas):
--     jackpot        get_jackpot_state()
--     poker          get_poker_home()
--     poker_friends  get_poker_friends_home()
--     persona_world  get_persona_world(eu)
--     feed           get_friends_feed(args.feed_limit ou 50[, args.feed_kinds])
--     trailer        get_home_trailer_pick()
--     tag_progress   get_my_game_tag_progress()
--     for_you_movie  get_for_you_titles('movie', args.for_you_limit ou 10)  lista
--     for_you_tv     get_for_you_titles('tv',    args.for_you_limit ou 10)  lista
--   Sem p_parts vêm as sete primeiras (a casca). Uso previsto: uma chamada
--   sem parâmetros ao abrir e, em paralelo, outra com as pesadas que a
--   primeira tela mostra — 2 idas no lugar de ~15.
--   errors.<nome> traz o erro de uma parte que falhou (ela vem null e as
--   outras vêm normais). ms.<nome> é o tempo de cada parte no servidor.
--   Visitante (sem login): só "seasonal" é calculada; as outras vêm null.
--
-- A função roda com a permissão de quem chama (SECURITY INVOKER): cada parte
-- é a RPC original, com as checagens dela; não abre nada novo. As partes que
-- gravam (o evento sazonal entrega tags, o OVNI anda) gravam como já gravavam
-- quando a tela as chamava uma a uma.

create or replace function public.get_app_bootstrap(
  p_parts text[] default null,
  p_args jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  c_core constant text[] := array['premium', 'lifetime', 'director', 'unread', 'seasonal', 'ufo', 'profile'];
  c_known constant text[] := c_core || array['jackpot', 'poker', 'poker_friends', 'persona_world', 'feed',
                                             'trailer', 'tag_progress', 'for_you_movie', 'for_you_tv'];
  v_uid uuid := auth.uid();
  v_parts text[] := coalesce(p_parts, c_core);
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_part text;
  v_val jsonb;
  v_out jsonb := '{}'::jsonb;
  v_err jsonb := '{}'::jsonb;
  v_ms jsonb := '{}'::jsonb;
  t0 timestamptz;
begin
  if cardinality(v_parts) > 24 then
    raise exception 'get_app_bootstrap: partes demais' using errcode = '22023';
  end if;

  foreach v_part in array v_parts loop
    continue when v_part is null or v_out ? v_part;
    t0 := clock_timestamp();
    v_val := null;
    -- cada parte na sua subtransação: a que falhar não derruba as outras
    begin
      if not (v_part = any(c_known)) then
        raise exception 'parte desconhecida' using errcode = '22023';
      elsif v_part = 'seasonal' then
        v_val := get_seasonal_event_state(v_args->>'preview');
      elsif v_uid is null then
        v_val := null;  -- visitante: sem login só existe o evento sazonal
      elsif v_part = 'premium' then
        v_val := to_jsonb(get_user_premium_status(v_uid));
      elsif v_part = 'lifetime' then
        v_val := to_jsonb(is_lifetime_premium(v_uid));
      elsif v_part = 'director' then
        v_val := get_director_state();
      elsif v_part = 'unread' then
        v_val := to_jsonb(count_unread_indications(v_uid));
      elsif v_part = 'ufo' then
        v_val := jackpot_ufo_status();
      elsif v_part = 'profile' then
        select to_jsonb(x) into v_val
          from (select p.id, p.username, p.avatar_url, p.bio, p.avatar_frame, p.banner, p.card_style,
                       p.text_effect, p.active_tag, p.tv_order, p.library_layout
                  from profiles p where p.id = v_uid) x;
      elsif v_part = 'jackpot' then
        v_val := get_jackpot_state();
      elsif v_part = 'poker' then
        v_val := get_poker_home();
      elsif v_part = 'poker_friends' then
        v_val := get_poker_friends_home();
      elsif v_part = 'persona_world' then
        v_val := get_persona_world(v_uid);
      elsif v_part = 'feed' then
        if v_args ? 'feed_kinds' then
          v_val := get_friends_feed(coalesce((v_args->>'feed_limit')::integer, 50),
                                    array(select jsonb_array_elements_text(v_args->'feed_kinds')));
        else
          v_val := get_friends_feed(coalesce((v_args->>'feed_limit')::integer, 50));
        end if;
      elsif v_part = 'trailer' then
        v_val := get_home_trailer_pick();
      elsif v_part = 'tag_progress' then
        v_val := get_my_game_tag_progress();
      elsif v_part in ('for_you_movie', 'for_you_tv') then
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_val
          from get_for_you_titles(case when v_part = 'for_you_tv' then 'tv' else 'movie' end,
                                  coalesce((v_args->>'for_you_limit')::integer, 10)) t;
      end if;
      v_out := v_out || jsonb_build_object(v_part, v_val);
    exception when others then
      v_out := v_out || jsonb_build_object(v_part, null);
      v_err := v_err || jsonb_build_object(v_part, sqlstate || ': ' || sqlerrm);
    end;
    v_ms := v_ms || jsonb_build_object(v_part, round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric, 1));
  end loop;

  return jsonb_build_object('v', 1, 'user_id', v_uid, 'at', now(), 'parts', v_out, 'errors', v_err, 'ms', v_ms);
end;
$function$;

revoke all on function public.get_app_bootstrap(text[], jsonb) from public;
grant execute on function public.get_app_bootstrap(text[], jsonb) to anon, authenticated, service_role;

comment on function public.get_app_bootstrap(text[], jsonb) is
  '18/11/2026 (Reborn): a casca do app numa ida só. parts.<nome> = o que a RPC original devolveria (premium, lifetime, director, unread, seasonal, ufo, profile; sob pedido: jackpot, poker, poker_friends, persona_world, feed, trailer, tag_progress, for_you_movie, for_you_tv). errors.<nome> = erro da parte; ms.<nome> = tempo no servidor. SECURITY INVOKER.';
