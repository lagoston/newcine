-- Escolhidos a dedo (Oracle Hub, 21/10/2026): o painel das três cartas passa a
-- mostrar, saindo de cada carta, os melhores títulos que aquele oráculo tem
-- nas três prateleiras favoritas da pessoa, pela nota prevista (a mesma
-- predict_ratings_v4 da Biblioteca dos Oráculos).
--
-- get_oracle_hub_picks() devolve, para cada oráculo, os 16 melhores filmes e
-- as 16 melhores séries (separados: a tela sorteia a proporção a cada
-- abertura). Prever ~2.500 títulos leva 1–2 s, então o resultado fica guardado
-- por 6 horas em oracle_hub_picks; na leitura, sai o que a pessoa adicionou à
-- biblioteca desde então. Muda de prateleiras favoritas, recalcula na hora.
--
-- Prateleiras favoritas: as três primeiras de profiles.persona_scores que têm
-- algum título avaliado. Quem ainda não tem três recebe as que faltam nesta
-- ordem: Aventuras, Mind-Blowing, Muitas Risadas... (e personal = false).

create table if not exists public.oracle_hub_picks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  moods text[] not null,
  picks jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.oracle_hub_picks enable row level security;
revoke all on public.oracle_hub_picks from anon, authenticated;

create or replace function public.get_oracle_hub_picks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_moods text[];
  v_personal boolean;
  v_cache record;
  v_picks jsonb;
  v_total integer;
  v_mids integer[];
  v_tids integer[];
  v_default text[] := array['adventures', 'mind-blowing', 'laugh-out-loud', 'catharsis', 'adrenaline', 'romantic', 'family-time', 'dark-and-scary', 'drug-trip'];
begin
  if v_uid is null then
    return null;
  end if;

  select coalesce(array_agg(x.mk order by x.ord), '{}') into v_moods
    from (
      select e.s ->> 'mood_key' as mk, e.ord
        from profiles p,
             jsonb_array_elements(coalesce(p.persona_scores, '[]'::jsonb)) with ordinality as e(s, ord)
       where p.id = v_uid
         and coalesce((e.s ->> 'films')::int, 0) > 0
         and e.s ->> 'mood_key' <> 'random-surprise'
       order by e.ord
       limit 3
    ) x;
  v_personal := cardinality(v_moods) = 3;
  if not v_personal then
    v_moods := v_moods || array(
      select d.m from unnest(v_default) with ordinality as d(m, o)
       where not (d.m = any(v_moods))
       order by d.o
       limit 3 - cardinality(v_moods)
    );
  end if;

  select * into v_cache from oracle_hub_picks where user_id = v_uid;
  if found and v_cache.moods = v_moods and v_cache.computed_at > now() - interval '6 hours' then
    v_picks := v_cache.picks;
  else
    -- Os títulos de cada tipo que a pessoa ainda não tem, primeiro em variáveis:
    -- passados como lista pronta, o predict_ratings_v4 roda como na Biblioteca
    -- (dentro da mesma consulta o planejador escolhia um caminho 3x mais lento).
    select coalesce(array_agg(distinct q.id), '{}') into v_mids
      from (
        select (jsonb_array_elements_text(coalesce(rp.movie_ids, '[]'::jsonb)))::int as id
          from recommendation_pools rp
         where rp.mood_key = any(v_moods) and rp.card_type in ('bogart', 'fincher', 'cypher')
      ) q
     where not exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = q.id and coalesce(um.media_type, 'movie') = 'movie');
    select coalesce(array_agg(distinct q.id), '{}') into v_tids
      from (
        select (jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)))::int as id
          from recommendation_pools rp
         where rp.mood_key = any(v_moods) and rp.card_type in ('bogart', 'fincher', 'cypher')
      ) q
     where not exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = q.id and um.media_type = 'tv');

    with pools as (
      select rp.card_type, rp.mood_key, 'movie'::text as mt, (jsonb_array_elements_text(coalesce(rp.movie_ids, '[]'::jsonb)))::int as id
        from recommendation_pools rp
       where rp.mood_key = any(v_moods) and rp.card_type in ('bogart', 'fincher', 'cypher')
      union all
      select rp.card_type, rp.mood_key, 'tv'::text, (jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)))::int
        from recommendation_pools rp
       where rp.mood_key = any(v_moods) and rp.card_type in ('bogart', 'fincher', 'cypher')
    ),
    fresh as (
      select distinct on (p.card_type, p.mt, p.id) p.*
        from pools p
       where not exists (
         select 1 from user_movies um
          where um.user_id = v_uid and um.movie_id = p.id and coalesce(um.media_type, 'movie') = p.mt
       )
    ),
    pm as materialized (
      select * from predict_ratings_v4(v_uid, 'movie', v_mids)
    ),
    pt as materialized (
      select * from predict_ratings_v4(v_uid, 'tv', v_tids)
    ),
    scored as (
      select f.card_type, f.mood_key, f.mt, f.id, x.mu, x.predicted_rating from fresh f join pm x on f.mt = 'movie' and x.id = f.id
      union all
      select f.card_type, f.mood_key, f.mt, f.id, x.mu, x.predicted_rating from fresh f join pt x on f.mt = 'tv' and x.id = f.id
    ),
    ranked as (
      select s.*, row_number() over (partition by s.card_type, s.mt order by s.mu desc nulls last, s.id) as rn
        from scored s
    )
    select coalesce(jsonb_object_agg(z.card_type, z.j), '{}'::jsonb) into v_picks
      from (
        select r.card_type,
               jsonb_build_object(
                 'movies', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'r', r.predicted_rating, 'mu', round(r.mu::numeric, 3), 'mood', r.mood_key) order by r.rn) filter (where r.mt = 'movie'), '[]'::jsonb),
                 'series', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'r', r.predicted_rating, 'mu', round(r.mu::numeric, 3), 'mood', r.mood_key) order by r.rn) filter (where r.mt = 'tv'), '[]'::jsonb)
               ) as j
          from ranked r
         where r.rn <= 16
         group by r.card_type
      ) z;

    insert into oracle_hub_picks (user_id, moods, picks, computed_at)
    values (v_uid, v_moods, v_picks, now())
    on conflict (user_id) do update set moods = excluded.moods, picks = excluded.picks, computed_at = excluded.computed_at;
  end if;

  -- O que entrou na biblioteca depois do cálculo sai da lista.
  select coalesce(jsonb_object_agg(o.key, jsonb_build_object(
           'movies', (select coalesce(jsonb_agg(e order by a.ord), '[]'::jsonb)
                        from jsonb_array_elements(o.value -> 'movies') with ordinality as a(e, ord)
                       where not exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = (a.e ->> 'id')::int and coalesce(um.media_type, 'movie') = 'movie')),
           'series', (select coalesce(jsonb_agg(e order by a.ord), '[]'::jsonb)
                        from jsonb_array_elements(o.value -> 'series') with ordinality as a(e, ord)
                       where not exists (select 1 from user_movies um where um.user_id = v_uid and um.movie_id = (a.e ->> 'id')::int and um.media_type = 'tv'))
         )), '{}'::jsonb)
    into v_picks
    from jsonb_each(v_picks) o;

  select count(*) into v_total
    from (
      select jsonb_array_elements_text(coalesce(rp.movie_ids, '[]'::jsonb)) from recommendation_pools rp
       where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart', 'fincher', 'cypher')
      union all
      select jsonb_array_elements_text(coalesce(rp.tv_ids, '[]'::jsonb)) from recommendation_pools rp
       where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart', 'fincher', 'cypher')
    ) t;

  return jsonb_build_object(
    'moods', to_jsonb(v_moods),
    'personal', v_personal,
    'total_titles', v_total,
    'shelves', (select count(*) from recommendation_pools rp where rp.mood_key <> 'random-surprise' and rp.card_type in ('bogart', 'fincher', 'cypher')),
    'oracles', v_picks
  );
end;
$$;

revoke all on function public.get_oracle_hub_picks() from public, anon;
grant execute on function public.get_oracle_hub_picks() to authenticated;
