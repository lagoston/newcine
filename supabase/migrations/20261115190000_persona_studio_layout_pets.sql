-- O estúdio da Persona: o arranjo dos objetos e os bichinhos (15/11/2026, tarde).
--
-- Dois pedidos do Bruno:
--   • "Antes você tinha deixado espaço para novos itens chegarem, né? Eu quero
--     que você volte esses espaços e deixe o usuário posicionar os itens que
--     ele já tem." O chão do estúdio voltou a ter lugares marcados, e cada
--     pessoa escolhe em que lugar fica cada objeto. O arranjo fica guardado
--     aqui (persona_studio_layouts) e vai junto com a cena.
--   • "As tags de 200 filmes dos três oráculos […] devem desbloquear um
--     animalzinho de estimação para o estúdio": o sapo (Bogart), a raposa
--     (Fincher) e a cobra no aquário (Cypher). A cena passa a dizer quantos
--     títulos da curadoria de cada oráculo a pessoa avaliou e em que nota o
--     200º de cada um entrou (é quando o bichinho chega; a barra da Evolução
--     usa isso para mostrar o estúdio de antes sem ele).
--
-- A conta dos oráculos é a mesma das tags (src/lib/tagProgress.ts): os filmes
-- e as séries de todas as prateleiras do oráculo, a surpresa aleatória
-- inclusive, cada título uma vez.

-- ---------------------------------------------------------------------------
-- O arranjo: um por pessoa. { "v": 1, "at": { "slot": 4, "fox": 7 } } (o nome
-- do objeto → o número do lugar; os nomes e os lugares moram no site, em
-- src/components/personaWorld/studio.ts).
-- ---------------------------------------------------------------------------
create table if not exists public.persona_studio_layouts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  layout jsonb not null,
  updated_at timestamptz not null default now()
);

-- Só as funções mexem na tabela (como nas do Poster Jackpot).
alter table public.persona_studio_layouts enable row level security;
revoke all on table public.persona_studio_layouts from anon, authenticated;

-- Grava o arranjo de quem chama e devolve o que ficou guardado.
-- Não confere se a pessoa tem cada objeto (isso é do site, e um objeto que ela
-- ainda não tem é só ignorado na cena); confere a forma: no máximo 24 objetos,
-- nomes curtos em minúsculas, lugares de 0 a 31 e nenhum lugar repetido.
create or replace function public.set_persona_studio_layout(p_layout jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_at jsonb;
  v_clean jsonb;
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v_at := p_layout -> 'at';
  if v_at is null or jsonb_typeof(v_at) <> 'object' then
    raise exception 'bad_layout' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_each(v_at)) > 24
     or exists (
       select 1 from jsonb_each(v_at) e
        where e.key !~ '^[a-z]{2,16}$'
           or jsonb_typeof(e.value) <> 'number'
           or (e.value #>> '{}') !~ '^[0-9]{1,2}$'
           or (e.value #>> '{}')::int > 31
     )
     or (select count(*) from jsonb_each(v_at)) <> (select count(distinct (e.value #>> '{}')) from jsonb_each(v_at) e) then
    raise exception 'bad_layout' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(e.key, (e.value #>> '{}')::int), '{}'::jsonb) into v_clean from jsonb_each(v_at) e;
  v_out := jsonb_build_object('v', 1, 'at', v_clean);

  insert into persona_studio_layouts (user_id, layout, updated_at)
  values (v_uid, v_out, now())
  on conflict (user_id) do update set layout = excluded.layout, updated_at = now();
  return v_out;
end;
$function$;

revoke all on function public.set_persona_studio_layout(jsonb) from public, anon;
grant execute on function public.set_persona_studio_layout(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- A cena (v4): a de antes (v3) mais o arranjo, os títulos de cada oráculo e a
-- chegada dos bichinhos.
-- ---------------------------------------------------------------------------
create or replace function public.get_persona_world(p_user_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_code text;
  v_out jsonb;
begin
  if p_user_id is null then
    return null;
  end if;
  select p.personalidade_completa into v_code from profiles p where p.id = p_user_id;
  if not found or not can_view_user_content(p_user_id) then
    return null;
  end if;

  with st as (
    select distinct x.mood_key, x.media_type, x.tmdb_id from shelf_titles() x where x.mood_key <> 'random-surprise'
  ),
  r as materialized (
    select um.rating::numeric as rating, um.media_type, um.movie_id, m.letter,
           (row_number() over (order by um.created_at, um.id))::integer as no
      from user_movies um
      left join st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
      left join cine_moods m on m.mood_key = st.mood_key
     where um.user_id = p_user_id and um.rating is not null and um.media_type in ('movie', 'tv')
  ),
  shelf as materialized (
    select r.*,
           row_number() over (order by r.no desc) as back,
           row_number() over (partition by r.letter order by r.no desc) as mback,
           row_number() over (partition by r.letter order by r.rating desc, r.no desc) as mbest
      from r
     where r.letter is not null
  ),
  cnt as (
    select count(*)::integer as rated,
           (count(*) filter (where letter is null))::integer as out_n,
           (count(*) filter (where letter is not null))::integer as counted
      from r
  ),
  -- os títulos que a cena mostra pelo nome (poucos): nome e pôster do cache
  eyes as (
    select s.* from shelf s, cnt
     where s.rating >= 9 and (cnt.counted < 45 or s.back <= 30)
     order by s.no desc limit 6
  ),
  tens as (select r.* from r where r.rating >= 10 order by r.no desc limit 4),
  best as (select s.* from shelf s where s.mbest <= 4),
  lastn as (select r.* from r order by r.no desc limit 6),
  -- os bichinhos (15/11/2026): os títulos avaliados da curadoria de cada oráculo, na ordem em
  -- que entraram (k = o 1º, o 2º… daquele oráculo; no = a nota em que entrou)
  ot as (
    select distinct x.card_type, x.media_type, x.tmdb_id from shelf_titles() x where x.card_type in ('bogart', 'fincher', 'cypher')
  ),
  orc as materialized (
    select q.card_type, q.no, (row_number() over (partition by q.card_type order by q.no))::integer as k
      from (select distinct ot.card_type, r.no from r join ot on ot.tmdb_id = r.movie_id and ot.media_type = r.media_type) q
  )
  select jsonb_build_object(
    'v', 4,
    'rated', cnt.rated,
    'out', cnt.out_n,
    'counted', cnt.counted,
    -- as asas: os últimos 30 títulos de prateleira, do mais antigo ao mais novo: [letra, nota]
    'window', (select coalesce(jsonb_agg(jsonb_build_array(s.letter, s.rating) order by s.no), '[]'::jsonb) from shelf s where s.back <= 30),
    -- as tampas: as notas dos últimos 9 títulos de cada prateleira
    'recent', (select coalesce(jsonb_object_agg(q.letter, q.arr), '{}'::jsonb)
                 from (select s.letter, jsonb_agg(s.rating order by s.no) as arr from shelf s where s.mback <= 9 group by s.letter) q),
    -- a lagarta: as prateleiras dos primeiros 12 títulos (só antes de a Persona nascer)
    'first', case when v_code is null
                  then (select coalesce(jsonb_agg(f.letter order by f.no), '[]'::jsonb)
                          from (select s.letter, s.no from shelf s order by s.no limit 12) f)
                  else '[]'::jsonb end,
    'eyes', (select coalesce(jsonb_agg(jsonb_build_object('id', e.movie_id, 'type', e.media_type, 'r', e.rating, 'm', e.letter,
                      'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path)) order by e.no desc), '[]'::jsonb)
               from eyes e left join movie_cache mc on mc.tmdb_id = e.movie_id and mc.media_type = e.media_type),
    'tens', (select coalesce(jsonb_agg(jsonb_build_object('id', e.movie_id, 'type', e.media_type, 'r', e.rating, 'm', e.letter,
                      'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path)) order by e.no desc), '[]'::jsonb)
               from tens e left join movie_cache mc on mc.tmdb_id = e.movie_id and mc.media_type = e.media_type),
    'last', (select coalesce(jsonb_agg(jsonb_build_object('id', e.movie_id, 'type', e.media_type, 'r', e.rating, 'm', e.letter,
                      'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path)) order by e.no desc), '[]'::jsonb)
               from lastn e left join movie_cache mc on mc.tmdb_id = e.movie_id and mc.media_type = e.media_type),
    'best', (select coalesce(jsonb_object_agg(q.letter, q.arr), '{}'::jsonb)
               from (select e.letter, jsonb_agg(jsonb_build_object('id', e.movie_id, 'type', e.media_type, 'r', e.rating, 'm', e.letter,
                              'title_pt', mc.title_pt, 'title_en', mc.title_en, 'poster', coalesce(mc.poster_path_pt, mc.poster_path)) order by e.mbest) as arr
                       from best e left join movie_cache mc on mc.tmdb_id = e.movie_id and mc.media_type = e.media_type
                      group by e.letter) q),
    'molts', (select coalesce(jsonb_agg(jsonb_build_object('at', pm.molted_at, 'from', pm.from_code, 'to', pm.to_code, 'no', pm.rating_no) order by pm.molted_at, pm.id), '[]'::jsonb)
                from (select * from persona_molts x where x.user_id = p_user_id order by x.molted_at desc, x.id desc limit 24) pm),
    'persona', get_user_persona(p_user_id),
    -- o estúdio (14/11/2026): as tags especiais e de jogos que a pessoa conquistou, da mais
    -- antiga à mais nova (os objetos de evento: a abóbora, a árvore de Natal…)
    'tags', (select coalesce(jsonb_agg(jsonb_build_object('id', ut.tag_id, 'at', ut.unlocked_at) order by ut.unlocked_at, ut.tag_id), '[]'::jsonb)
               from user_special_tags ut where ut.user_id = p_user_id),
    -- a parede (14/11/2026, noite): os 4 últimos pôsteres que a pessoa ganhou no Poster Jackpot,
    -- do mais novo ao mais antigo (os que ela ainda tem: reset_at nulo, como em get_my_posters)
    'posters', (select coalesce(jsonb_agg(jsonb_build_object('path', q.file_path, 'rarity', q.rarity, 'effect', q.effect)
                                          order by q.first_pulled_at desc, q.item_id desc), '[]'::jsonb)
                  from (select pi.file_path, pi.rarity, up.effect, up.first_pulled_at, up.item_id
                          from user_posters up
                          join poster_items pi on pi.id = up.item_id
                         where up.user_id = p_user_id and up.reset_at is null
                         order by up.first_pulled_at desc, up.item_id desc
                         limit 4) q),
    -- o arranjo (15/11/2026): em que lugar a pessoa pôs cada objeto (null = tudo no lugar de costume)
    'layout', (select l.layout from persona_studio_layouts l where l.user_id = p_user_id),
    -- os bichinhos (15/11/2026): quantos títulos de cada oráculo, e em que nota entrou o 200º
    -- (null = ainda não chegou): o sapo é do Bogart, a raposa do Fincher e a cobra da Cypher
    'oracle', jsonb_build_object(
      'bogart', (select count(*) from orc o where o.card_type = 'bogart'),
      'fincher', (select count(*) from orc o where o.card_type = 'fincher'),
      'cypher', (select count(*) from orc o where o.card_type = 'cypher')),
    'pets', jsonb_build_object(
      'frog', (select o.no from orc o where o.card_type = 'bogart' and o.k = 200),
      'fox', (select o.no from orc o where o.card_type = 'fincher' and o.k = 200),
      'snake', (select o.no from orc o where o.card_type = 'cypher' and o.k = 200))
  )
    into v_out
    from cnt;

  return v_out;
end;
$function$;
