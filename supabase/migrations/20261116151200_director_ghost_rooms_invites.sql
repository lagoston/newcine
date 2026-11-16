-- Conta Diretor, etapa A: o fantasma nas salas secretas e nos convites (16/11/2026).
--
-- Continuação de 20261116151000_director_ghost_people.sql. A conta escondida não
-- conta nem aparece como membro de sala; não tem código de convite ("Fulano te
-- convidou" revelaria a conta), o código dela vale como inexistente e ela não ganha
-- fichas por convite. Ponto de partida: as definições no ar (md5 conferido).

-- get_secret_room
CREATE OR REPLACE FUNCTION public.get_secret_room(p_room text, p_via text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and (p.id = v_uid or not public.is_hidden_account(p.id))  -- conta diretor escondida (16/11/2026)
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

-- get_invite_preview
create or replace function public.get_invite_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p.id is null then null
              else jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url, 'reward', 3) end
    from (select 1) one
    left join invite_codes ic on ic.code = lower(trim(p_code))
    left join profiles p on p.id = ic.user_id
                       and not public.is_hidden_account(ic.user_id);  -- conta diretor escondida (16/11/2026): código dela = inexistente
$$;

-- get_my_invite
create or replace function public.get_my_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not jackpot_enabled(v_uid) then
    raise exception 'jackpot_closed';
  end if;
  -- conta diretor escondida (16/11/2026): sem código ("Fulano te convidou" revelaria a conta)
  if public.is_hidden_account(v_uid) then
    raise exception 'ghost_no_invite';
  end if;
  select code into v_code from invite_codes where user_id = v_uid;
  if v_code is null then
    insert into invite_codes (user_id, code) values (v_uid, jackpot_new_invite_code()) on conflict (user_id) do nothing;
    select code into v_code from invite_codes where user_id = v_uid;
  end if;
  return jsonb_build_object(
    'code', v_code,
    'reward', 3,
    'joined', (select count(*) from invite_redemptions where inviter_id = v_uid),
    'rewarded', (select count(*) from invite_redemptions where inviter_id = v_uid and inviter_rewarded)
  );
end;
$$;

-- jackpot_apply_invite
create or replace function public.jackpot_apply_invite(p_invitee uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  v_inviter uuid;
  v_created timestamptz;
  v_rewarded boolean;
begin
  if p_invitee is null or v_code = '' then
    return 'no_code';
  end if;
  select user_id into v_inviter from invite_codes where code = v_code;
  if v_inviter is null then
    return 'invalid';
  end if;
  -- conta diretor escondida (16/11/2026): o código dela vale como inexistente, e ela
  -- também não ganha fichas por convite
  if public.is_hidden_account(v_inviter) or public.is_hidden_account(p_invitee) then
    return 'invalid';
  end if;
  if v_inviter = p_invitee then
    return 'self';
  end if;
  if exists (select 1 from invite_redemptions where invitee_id = p_invitee) then
    return 'already';
  end if;
  if exists (select 1 from bot_accounts where user_id = p_invitee) then
    return 'bot';
  end if;
  select created_at into v_created from auth.users where id = p_invitee;
  if v_created is null or v_created < now() - interval '7 days' then
    return 'not_new';
  end if;
  if not exists (select 1 from profiles where id = p_invitee) then
    return 'no_profile';
  end if;

  v_rewarded := (select count(*) from invite_redemptions
                  where inviter_id = v_inviter and inviter_rewarded and created_at > now() - interval '30 days') < 10;
  insert into invite_redemptions (invitee_id, inviter_id, code, inviter_rewarded)
  values (p_invitee, v_inviter, v_code, v_rewarded)
  on conflict (invitee_id) do nothing;
  if not found then
    return 'already';
  end if;

  perform jackpot_wallet_row(p_invitee);
  update jackpot_wallets set special_tickets = special_tickets + 3, updated_at = now() where user_id = p_invitee;
  if v_rewarded then
    perform jackpot_wallet_row(v_inviter);
    update jackpot_wallets set special_tickets = special_tickets + 3, updated_at = now() where user_id = v_inviter;
  end if;
  return 'ok';
end;
$$;
