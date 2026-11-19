-- 19/11/2026 — Protocolo Reborn, onda 3 do banco (rede.md, A3 e 4.3).
--
-- Ao abrir um título, a ficha pede em separado o que é "da pessoa com o
-- título": a linha da biblioteca (useTitleRelation), os episódios vistos
-- (useTitleEpisodes, leitura inicial), as prateleiras/humor (useTitleMood →
-- get_pools_containing_title), os comentários dos oráculos (useOracleComments
-- → get_title_oracle_comments) e a nota prevista (get_title_prediction).
-- São 4 a 5 pedidos (e os preflights) por título aberto.
--
-- get_title_me devolve tudo numa ida, cada parte no formato que o hook
-- correspondente já consome:
--   relation         { id, rating } da linha de user_movies, ou null se o
--                    título não está na biblioteca (rating null = watchlist)
--   episodes         [{ season_number, episode_number }] (só séries; [] em filme)
--   pools            o que get_pools_containing_title devolve, na mesma ordem
--   oracle_comments  o que get_title_oracle_comments devolve
--   prediction       o que get_title_prediction devolve — só quando pedido
--                    (p_with_prediction); senão vem null
-- A previsão custa ~90 ms no banco e o resto ~1 ms: por isso ela é opcional.
-- A tela pede junto quando não tem a previsão guardada (economiza uma ida) e
-- pede sem ela quando já tem (a nota e os episódios não esperam os 90 ms).
--
-- RPC NOVA (só acréscimo). SECURITY INVOKER: a linha da biblioteca e os
-- episódios são lidos com a política de quem chama (só os próprios); as três
-- RPCs de dentro são as de sempre, com as checagens delas. Sem login:
-- relation null, episodes [], prediction null; prateleiras e comentários
-- vêm (são públicos, o visitante já podia chamar as duas RPCs).
-- Nenhum índice novo: user_movies (user_id, movie_id, media_type) e
-- watched_episodes (user_id, tmdb_id) já existem.

create or replace function public.get_title_me(
  p_id integer,
  p_media_type text default 'movie',
  p_with_prediction boolean default false
)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_mt text := case when p_media_type = 'tv' then 'tv' else 'movie' end;
  v_relation jsonb;
  v_episodes jsonb := '[]'::jsonb;
  v_pools jsonb;
  v_comments jsonb;
  v_prediction jsonb;
begin
  if v_uid is not null then
    select jsonb_build_object('id', um.id, 'rating', um.rating)
      into v_relation
      from user_movies um
     where um.user_id = v_uid and um.movie_id = p_id and um.media_type = v_mt;

    if v_mt = 'tv' then
      select coalesce(jsonb_agg(jsonb_build_object('season_number', we.season_number, 'episode_number', we.episode_number)
                                order by we.season_number, we.episode_number), '[]'::jsonb)
        into v_episodes
        from watched_episodes we
       where we.user_id = v_uid and we.tmdb_id = p_id;
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    into v_pools
    from get_pools_containing_title(p_id, v_mt) t;

  v_comments := coalesce(get_title_oracle_comments(p_id, v_mt), '[]'::jsonb);

  if coalesce(p_with_prediction, false) and v_uid is not null then
    begin
      v_prediction := get_title_prediction(p_id, v_mt);
    exception when others then
      v_prediction := null;  -- a previsão não derruba o resto da ficha
    end;
  end if;

  return jsonb_build_object('v', 1, 'relation', v_relation, 'episodes', v_episodes, 'pools', v_pools,
                            'oracle_comments', v_comments, 'prediction', v_prediction);
end;
$function$;

revoke all on function public.get_title_me(integer, text, boolean) from public;
grant execute on function public.get_title_me(integer, text, boolean) to anon, authenticated, service_role;

comment on function public.get_title_me(integer, text, boolean) is
  '19/11/2026 (Reborn): a relação da pessoa com um título numa ida só — relation { id, rating } | null, episodes, pools, oracle_comments e, se pedido, prediction. Cada parte no formato da consulta/RPC original. SECURITY INVOKER.';
