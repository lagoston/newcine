-- A afinidade da pessoa com cada oráculo (25/11/2026).
--
-- Pedido do Bruno para o Acervo: "assim como a borboleta que se metamorfa em
-- suas cores de acordo com as prateleiras do usuário, os mini oráculos (...) os
-- verá adaptados com suas cores as prateleiras que os usuários mais buscam
-- aquele oráculo. Podemos ter um sapo adrenalina, uma raposa catártica mas uma
-- cobra sensorial. As ordens das prateleiras devem se adaptar."
--
-- get_oracle_affinity() devolve, para quem está logado e para cada um dos três
-- oráculos, as 9 prateleiras em ordem: a primeira é a cor que o mentor veste
-- no salão do Acervo, e a ordem inteira é a ordem das runas (as letras) dele.
--
-- A regra (decidida com o Bruno: "a prateleira que a própria pessoa mais
-- avalia naquele oráculo; com poucas notas, o gosto geral"):
--   * conta os títulos que a pessoa JÁ AVALIOU e que moram naquele oráculo e
--     naquela prateleira (pool_titles, filmes e séries juntos);
--   * com 5 ou mais avaliados naquele oráculo, a ordem é a dela: mais títulos
--     primeiro; no empate, a soma das notas; depois o gosto geral; por fim a
--     ordem de sempre das prateleiras;
--   * com menos de 5, vale o gosto geral: a soma de todo mundo (só gente de
--     verdade: robôs da comunidade e contas escondidas ficam de fora);
--   * os três mentores nunca vestem a mesma cor. Se dois teriam a mesma
--     prateleira no topo, fica com ela aquele em que a pessoa mais a procura;
--     o outro veste a seguinte da ordem dele (quem só vê Mind-Blowing teria
--     três mentores cor-de-rosa, e a cor deixaria de dizer alguma coisa). A
--     prateleira que o mentor veste vai para a frente da ordem dele; as outras
--     oito seguem como estavam.
--
-- Devolve só chaves de prateleira e dois números por oráculo. Nenhum título,
-- nenhuma contagem do acervo (o Bruno pediu o acervo "infinito e secreto").
-- É só leitura; nada aqui muda dado nenhum, e o APK antigo nem chama.
create or replace function public.get_oracle_affinity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_min constant integer := 5;
  -- por oráculo: { pos, rated, own, order: [{ k, n, pts, g }, ...] }
  v_base jsonb;
  v_left text[] := array['bogart', 'fincher', 'cypher'];
  v_taken text[] := '{}';
  v_top jsonb := '{}'::jsonb;
  v_pick_id text;
  v_pick_key text;
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  with oracles(id, pos) as (
    values ('bogart', 1), ('fincher', 2), ('cypher', 3)
  ),
  mine as (
    select p.card_type, p.mood_key, count(*) as n, sum(um.rating) as pts
      from public.user_movies um
      join public.pool_titles p on p.media_type = um.media_type and p.tmdb_id = um.movie_id
     where um.user_id = v_uid
       and um.rating is not null
       and p.mood_key <> 'random-surprise'
     group by p.card_type, p.mood_key
  ),
  everyone as (
    select p.card_type, p.mood_key, count(*) as n
      from public.user_movies um
      join public.pool_titles p on p.media_type = um.media_type and p.tmdb_id = um.movie_id
     where um.rating is not null
       and p.mood_key <> 'random-surprise'
       and not exists (select 1 from public.bot_accounts b where b.user_id = um.user_id)
       and not exists (select 1 from director.accounts d where d.user_id = um.user_id and d.hidden)
     group by p.card_type, p.mood_key
  ),
  totals as (
    select o.id, o.pos, coalesce((select sum(m.n) from mine m where m.card_type = o.id), 0)::integer as rated
      from oracles o
  )
  select jsonb_object_agg(
           t.id,
           jsonb_build_object(
             'pos', t.pos,
             'rated', t.rated,
             'own', t.rated >= v_min,
             'order', (
               select jsonb_agg(
                        jsonb_build_object(
                          'k', cm.mood_key,
                          -- sem notas suficientes neste oráculo, as contas da pessoa não entram
                          'n', case when t.rated >= v_min then coalesce(m.n, 0) else 0 end,
                          'pts', case when t.rated >= v_min then coalesce(m.pts, 0) else 0 end,
                          'g', coalesce(e.n, 0)
                        )
                        order by
                          case when t.rated >= v_min then coalesce(m.n, 0) else 0 end desc,
                          case when t.rated >= v_min then coalesce(m.pts, 0) else 0 end desc,
                          coalesce(e.n, 0) desc,
                          cm.sort_order
                      )
                 from public.cine_moods cm
                 left join mine m on m.card_type = t.id and m.mood_key = cm.mood_key
                 left join everyone e on e.card_type = t.id and e.mood_key = cm.mood_key
             )
           )
         )
    into v_base
    from totals t;

  -- A prateleira que cada mentor veste: a cada volta, entre os mentores que
  -- faltam, ganha a vez aquele cuja melhor prateleira ainda livre é a mais
  -- forte (primeiro quem tem ordem própria; depois mais títulos, mais pontos,
  -- o gosto geral e, por fim, sapo, raposa, cobra).
  while cardinality(v_left) > 0 loop
    select x.id, x.k
      into v_pick_id, v_pick_key
      from (
        select o.id,
               (v_base -> o.id ->> 'own')::boolean as own,
               (v_base -> o.id ->> 'pos')::integer as pos,
               c.k, c.n, c.pts, c.g
          from unnest(v_left) as o(id)
          cross join lateral (
            select a.e ->> 'k' as k,
                   (a.e ->> 'n')::integer as n,
                   (a.e ->> 'pts')::numeric as pts,
                   (a.e ->> 'g')::integer as g
              from jsonb_array_elements(v_base -> o.id -> 'order') with ordinality as a(e, i)
             where not ((a.e ->> 'k') = any (v_taken))
             order by a.i
             limit 1
          ) c
      ) x
     order by x.own desc, x.n desc, x.pts desc, x.g desc, x.pos
     limit 1;
    exit when v_pick_id is null;
    v_taken := v_taken || v_pick_key;
    v_left := array_remove(v_left, v_pick_id);
    v_top := v_top || jsonb_build_object(v_pick_id, v_pick_key);
  end loop;

  select jsonb_build_object(
           'v', 1,
           'min', v_min,
           'oracles', jsonb_object_agg(
             o.id,
             jsonb_build_object(
               'own', (v_base -> o.id ->> 'own')::boolean,
               'rated', (v_base -> o.id ->> 'rated')::integer,
               'order', (
                 select jsonb_agg(a.e ->> 'k' order by ((a.e ->> 'k') = (v_top ->> o.id)) desc, a.i)
                   from jsonb_array_elements(v_base -> o.id -> 'order') with ordinality as a(e, i)
               )
             )
           )
         )
    into v_out
    from (values ('bogart'), ('fincher'), ('cypher')) as o(id);

  return v_out;
end;
$fn$;

revoke all on function public.get_oracle_affinity() from public, anon;
grant execute on function public.get_oracle_affinity() to authenticated, service_role;
