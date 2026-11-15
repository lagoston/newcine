-- Persona viva · a parede com os pôsteres do Jackpot (14/11/2026, noite)
--
-- Correções do Bruno (14/11, 20h32) ao estúdio que subiu à tarde:
--   • "Ao clicar nos pôsteres dentro do estúdio deve abrir a coleção de pôsteres
--     do usuário, inclusive os 4 pixelados da parede devem ser imitações dos
--     últimos 4 ganhos; se o usuário não possuir nenhum, a parede fica vazia."
--   • "Remova o aquário": a Watchlist deixa de vir na cena.
--
-- O que muda em get_persona_world (v = 3):
--   • entra `posters`: os 4 últimos pôsteres que a pessoa ganhou no Poster
--     Jackpot e ainda tem (caminho da imagem, raridade e efeito), do mais novo
--     ao mais antigo. Só lê user_posters e poster_items; nada do sorteio é
--     tocado. Quem pode ver a cena é quem já podia (can_view_user_content).
--   • sai `watch` (era só do aquário, que durou uma tarde).
--   • `tens` continua vindo, por causa de quem ainda estiver com a versão
--     anterior do site ou do aplicativo aberta: nela a parede mostra as notas 10.
-- O resto é idêntico a 20261114210000. get_persona_history não muda.

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
    'v', 3,
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
                         limit 4) q)
  )
    into v_out
    from cnt;

  return v_out;
end;
$$;

revoke all on function public.get_persona_world(uuid) from public;
grant execute on function public.get_persona_world(uuid) to anon, authenticated;
