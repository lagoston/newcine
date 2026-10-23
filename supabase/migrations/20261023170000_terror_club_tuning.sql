-- Clube do Terror, ajuste fino (23/10/2026), a pedido do Bruno:
--   - "Medidos no coração" passa a se chamar "Mais assustadores" e "Viradas",
--     "Plot-twists";
--   - em "Monstros reais", Peter Kürten e John Christie (os dois sem foto)
--     vão para o fim da fileira;
--   - as criptas: a primeira é a de quem está olhando (se tiver algum
--     sombrio com 7 ou mais), depois a de quem abriu o portal, os amigos e o
--     resto da comunidade (quem tem mais títulos na cripta primeiro). No
--     máximo 6 criptas;
--   - o medômetro saiu da página, então get_secret_room não calcula mais o
--     "me" (contagem, média e posição).

update public.secret_room_shelves
   set title_pt = 'Mais assustadores', title_en = 'Scariest'
 where room_key = 'clube-do-terror' and shelf_key = 'science';

update public.secret_room_shelves
   set title_pt = 'Plot-twists', title_en = 'Plot twists'
 where room_key = 'clube-do-terror' and shelf_key = 'twists';

-- Mantém a ordem dos outros e manda os dois sem foto para o fim.
update public.secret_room_shelves s
   set items = (
     select jsonb_agg(it order by (it -> 'person' ->> 'name') in ('Peter Kürten', 'John Christie'), ord)
       from jsonb_array_elements(s.items) with ordinality y(it, ord)
   )
 where s.room_key = 'clube-do-terror' and s.shelf_key = 'real';

create or replace function public.get_secret_room(p_room text, p_via text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_access jsonb;
  r public.secret_rooms;
  v_shelves jsonb;
  v_ritual jsonb := null;
  v_edition integer;
  w record;
  v_members jsonb;
  v_member_shelves jsonb;
  v_via_id uuid;
  v_max_crypts constant integer := 6;
begin
  v_access := public.secret_room_access(v_uid, p_room, p_via);
  if not coalesce((v_access ->> 'granted')::boolean, false) then
    return jsonb_build_object('access', v_access);
  end if;
  select * into r from public.secret_rooms where key = p_room;
  v_via_id := nullif(v_access #>> '{via,id}', '')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.shelf_key, 'kind', s.kind,
           'title_pt', s.title_pt, 'title_en', s.title_en, 'hint_pt', s.hint_pt, 'hint_en', s.hint_en,
           'items', case when s.kind = 'real' then (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'person', it -> 'person',
                        'titles', (select coalesce(jsonb_agg(c.card || jsonb_build_object('rel', tt ->> 'rel') order by tord), '[]'::jsonb)
                                   from jsonb_array_elements(it -> 'titles') with ordinality x(tt, tord)
                                   cross join lateral (select public.secret_room_card((tt ->> 'id')::int, tt ->> 'type') card) c
                                   where c.card is not null)) order by ord), '[]'::jsonb)
               from jsonb_array_elements(s.items) with ordinality y(it, ord))
             else (
               select coalesce(jsonb_agg(c.card || (it - 'id' - 'type') order by ord), '[]'::jsonb)
               from jsonb_array_elements(s.items) with ordinality y(it, ord)
               cross join lateral (select public.secret_room_card((it ->> 'id')::int, coalesce(it ->> 'type', 'movie')) card) c
               where c.card is not null)
             end) order by s.sort_order), '[]'::jsonb)
    into v_shelves
  from public.secret_room_shelves s
  where s.room_key = p_room and s.is_active;

  select * into w from public.seasonal_event_window(r.event_id, now()) limit 1;
  if found then
    v_edition := w.edition - case when not w.is_active and w.starts_at > now() then 1 else 0 end;
    select jsonb_build_object('edition', v_edition, 'live', w.is_active and v_edition = w.edition,
             'items', coalesce(jsonb_agg(c.card order by ord), '[]'::jsonb))
      into v_ritual
    from jsonb_array_elements_text(coalesce(public.seasonal_event_list(r.event_id, v_edition), '[]'::jsonb)) with ordinality l(mid, ord)
    cross join lateral (select public.secret_room_card(l.mid::int, 'movie') card) c
    where c.card is not null;
  end if;

  with holders as (
    select t.user_id, min(t.unlocked_at) since
    from public.user_special_tags t
    where t.tag_id = r.unlock_base_tag or t.tag_id ~ ('^' || r.unlock_base_tag || '-[0-9]+$')
    group by t.user_id
  ),
  members as (
    select p.id, p.username, p.avatar_url, p.avatar_frame, p.profile_visibility, h.since,
           coalesce(p.active_tag ->> 'name', '') ~ ('^' || r.unlock_tag_name || '( [IVXLCDM]+)?$') in_use,
           exists (select 1 from public.friendships f where f.status = 'accepted'
                    and ((f.requester_id = v_uid and f.addressee_id = p.id) or (f.addressee_id = v_uid and f.requester_id = p.id))) is_friend
    from holders h
    join public.profiles p on p.id = h.user_id
    where not exists (select 1 from public.bot_accounts b where b.user_id = p.id)
  ),
  visible as (
    select m.* from members m
    where m.id = v_uid or m.is_friend or coalesce(m.profile_visibility, 'public') = 'public' or m.id = v_via_id
  )
  select jsonb_build_object(
           'count', (select count(*) from members),
           'people', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'username', v.username, 'avatar_url', v.avatar_url,
                                 'avatar_frame', v.avatar_frame, 'in_use', v.in_use, 'is_friend', v.is_friend, 'is_me', v.id = v_uid, 'since', v.since)
                                 order by (v.id = v_via_id) desc, (v.id = v_uid) desc, v.is_friend desc, v.since)
                               from visible v), '[]'::jsonb))
    into v_members;

  -- As criptas: a sua (mesmo entrando como convidado), quem abriu o portal,
  -- os amigos e o resto, até v_max_crypts.
  with x as (select * from public.secret_room_mood_titles(r.mood_key)),
  people as (
    select (pp ->> 'id')::uuid id, pp ->> 'username' username, pp ->> 'avatar_url' avatar_url, pp ->> 'avatar_frame' avatar_frame,
           coalesce((pp ->> 'id')::uuid = v_via_id, false) is_via, coalesce((pp ->> 'is_friend')::boolean, false) is_friend, false is_me
    from jsonb_array_elements(v_members -> 'people') pp
    where (pp ->> 'id')::uuid <> v_uid
    union all
    select p.id, p.username, p.avatar_url, p.avatar_frame, false, false, true
    from public.profiles p
    where p.id = v_uid
  ),
  rated as (
    select pe.id uid, um.movie_id, coalesce(um.media_type, 'movie') mt, um.rating,
           row_number() over (partition by pe.id order by um.rating desc, coalesce(um.updated_at, um.created_at) desc) rn,
           count(*) over (partition by pe.id) n
    from people pe
    join public.user_movies um on um.user_id = pe.id and um.rating is not null and um.rating >= 7
    join x on x.id = um.movie_id and x.media_type = coalesce(um.media_type, 'movie')
  ),
  chosen as (
    select pe.*, (select max(ra.n) from rated ra where ra.uid = pe.id) n
    from people pe
    where exists (select 1 from rated ra where ra.uid = pe.id)
    order by pe.is_me desc, pe.is_via desc, pe.is_friend desc, n desc, pe.username
    limit v_max_crypts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user', jsonb_build_object('id', pe.id, 'username', pe.username, 'avatar_url', pe.avatar_url, 'avatar_frame', pe.avatar_frame,
                                      'is_via', pe.is_via, 'is_me', pe.is_me, 'is_friend', pe.is_friend),
           'items', (select jsonb_agg(c.card || jsonb_build_object('rating', ra.rating) order by ra.rn)
                     from rated ra cross join lateral (select public.secret_room_card(ra.movie_id, ra.mt) card) c
                     where ra.uid = pe.id and ra.rn <= 14 and c.card is not null))
           order by pe.is_me desc, pe.is_via desc, pe.is_friend desc, pe.n desc, pe.username), '[]'::jsonb)
    into v_member_shelves
  from chosen pe;

  return jsonb_build_object(
    'access', v_access,
    'room', jsonb_build_object('key', r.key, 'event', r.event_id, 'mood', r.mood_key),
    'shelves', v_shelves,
    'ritual', v_ritual,
    'members', v_members,
    'member_shelves', v_member_shelves
  );
end;
$function$;
