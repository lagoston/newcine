-- Persona viva · o estúdio (14/11/2026, noite)
--
-- Pedido do Bruno (14/11, 17h08): o botão "Sua Persona" da home vira o estúdio
-- inteiro da pessoa, no lugar das portas do Jackpot e do Pôquer, que passam a
-- ser objetos dentro dele (uma máquina caça-níquel e uma mesa); o estúdio ganha
-- lugares para objetos conquistados ("uma árvore de Natal em futuros eventos"),
-- o aquário, uma estante com o livro da evolução, e a barra "Reviver desde o
-- início" do protótipo. Plano e decisões em claude/persona-viva.md.
--
-- O que este arquivo faz (só acrescenta; nada é apagado):
--
--   1. get_persona_world ganha dois campos (e passa a dizer v = 2):
--        • tags  — as tags que a pessoa conquistou (id e quando). O site
--          transforma as de evento em objetos: a abóbora do Halloween, a árvore
--          de Natal. As tags já são públicas no perfil.
--        • watch — a Watchlist para o aquário: quantos títulos esperam e a
--          prateleira dos 8 mais novos (um peixe por título).
--      O resto é idêntico ao da Fase 1 (20261114010000). O APK antigo ignora
--      os campos novos.
--
--   2. get_persona_history(uid) — a história da própria pessoa, nota a nota e
--      em ordem (dia, nota, prateleira, tipo, id, nomes e pôster), para a
--      barra "Reviver desde o início". Só a própria pessoa recebe a dela: no
--      estúdio de um amigo não há essa barra.

-- ---------------------------------------------------------------------------
-- 1. A cena, com as tags e a Watchlist
-- ---------------------------------------------------------------------------

create or replace function public.get_persona_world(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
  lastn as (select r.* from r order by r.no desc limit 6)
  select jsonb_build_object(
    'v', 2,
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
    -- o aquário: quantos títulos esperam na Watchlist e a prateleira dos 8 mais novos
    -- (um peixe por título; sem prateleira, o peixe é creme)
    'watch', (select jsonb_build_object(
                       'n', count(*),
                       'fish', coalesce(jsonb_agg(w.letter order by w.created_at desc, w.id desc) filter (where w.back <= 8), '[]'::jsonb))
                from (select um.id, um.created_at, m.letter, row_number() over (order by um.created_at desc, um.id desc) as back
                        from user_movies um
                        left join st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
                        left join cine_moods m on m.mood_key = st.mood_key
                       where um.user_id = p_user_id and um.rating is null and um.media_type in ('movie', 'tv')) w)
  )
    into v_out
    from cnt;

  return v_out;
end;
$$;

revoke all on function public.get_persona_world(uuid) from public;
grant execute on function public.get_persona_world(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A história, para reviver
-- ---------------------------------------------------------------------------

create or replace function public.get_persona_history(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  -- só a própria pessoa revive a própria história
  if p_user_id is null or auth.uid() is null or auth.uid() <> p_user_id then
    return null;
  end if;

  with st as (
    select distinct x.mood_key, x.media_type, x.tmdb_id from shelf_titles() x where x.mood_key <> 'random-surprise'
  ),
  r as (
    -- a mesma ordem de get_persona_world e de persona_replay: pela data em que o título entrou
    select um.created_at, um.id as row_id, um.rating::numeric as rating, um.media_type, um.movie_id, m.letter
      from user_movies um
      left join st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
      left join cine_moods m on m.mood_key = st.mood_key
     where um.user_id = p_user_id and um.rating is not null and um.media_type in ('movie', 'tv')
  )
  select jsonb_build_object(
           'v', 1,
           -- cada linha: [dia (Brasília), nota, letra da prateleira ou null, tipo, id, nome pt, nome en, pôster]
           'rows', coalesce(jsonb_agg(jsonb_build_array(
                     to_char(r.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), r.rating, r.letter, r.media_type, r.movie_id,
                     mc.title_pt, mc.title_en, coalesce(mc.poster_path_pt, mc.poster_path)) order by r.created_at, r.row_id), '[]'::jsonb))
    into v_out
    from r
    left join movie_cache mc on mc.tmdb_id = r.movie_id and mc.media_type = r.media_type;

  return v_out;
end;
$$;

revoke all on function public.get_persona_history(uuid) from public;
grant execute on function public.get_persona_history(uuid) to authenticated;
