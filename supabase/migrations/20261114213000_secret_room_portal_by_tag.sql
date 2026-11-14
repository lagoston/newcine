-- Clube do Terror: o portal passa a valer para quem TEM a tag (14/11/2026)
--
-- Pedido do Bruno (14/11, 17h23): "o portal de Halloween não é mais um item de
-- banner, agora ele é um item de estúdio liberado pela tag, pode ser o mesmo
-- portal agora dentro de uma caixa velha de papelão escrito com fita adesiva o
-- nome do modal".
--
-- Até hoje a porta do Clube do Terror, fora do Halloween, só abria para quem
-- estava USANDO a Deadly Sleeping no perfil, e o portal (a espiral no cartão do
-- perfil) só existia no perfil de quem estava usando a tag. Agora o portal é
-- um objeto do estúdio da pessoa (a caixa de papelão), e quem libera é a tag:
--
--   • membro: quem tem a tag entra a qualquer hora, usando-a ou não;
--   • convidado: entra pela caixa do estúdio de quem tem a tag (?via=<username>),
--     a qualquer hora;
--   • get_secret_room_portal diz "aberto" para quem tem a tag.
--
-- O motivo "need_tag_in_use" deixa de acontecer. O campo tag_in_use continua na
-- resposta (a sala ainda marca quem está usando a tag). O APK antigo segue
-- funcionando: ele só mostra o portal do banner para quem está usando a tag, e
-- a confirmação do servidor continua dizendo "aberto".

create or replace function public.secret_room_access(p_viewer uuid, p_room text, p_via text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.secret_rooms;
  v_live boolean;
  v_has boolean := false;
  v_in_use boolean := false;
  v_bearer public.profiles;
  v_bearer_open boolean := false;
  v_mode text := null;
  v_reason text := null;
begin
  select * into r from public.secret_rooms where key = p_room and is_active;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'not_found');
  end if;
  v_live := public.secret_room_event_live(r.event_id);
  if p_viewer is not null then
    v_has := public.secret_room_has_tag(p_viewer, r.unlock_base_tag);
    v_in_use := v_has and public.secret_room_tag_in_use(p_viewer, r.unlock_base_tag, r.unlock_tag_name);
  end if;
  if nullif(trim(coalesce(p_via, '')), '') is not null then
    select * into v_bearer from public.profiles where lower(username) = lower(trim(p_via)) limit 1;
    if found then
      -- 14/11/2026: a caixa do estúdio abre para quem TEM a tag (antes: quem a estava usando)
      v_bearer_open := public.secret_room_has_tag(v_bearer.id, r.unlock_base_tag);
    end if;
  end if;

  if p_viewer is null then
    v_reason := 'login';
  elsif v_has then
    -- 14/11/2026: ter a tag basta (antes: estar usando, ou ter durante o evento)
    v_mode := 'member';
  elsif v_bearer_open and v_bearer.id <> p_viewer then
    v_mode := 'portal';
  elsif p_via is not null and v_bearer.id is not null and not v_bearer_open then
    v_reason := 'portal_closed';
  elsif v_live then
    v_reason := 'need_tag';
  else
    v_reason := 'closed';
  end if;

  return jsonb_build_object(
    'room', r.key,
    'granted', v_mode is not null,
    'mode', v_mode,
    'reason', v_reason,
    'event', r.event_id,
    'event_live', v_live,
    'has_tag', v_has,
    'tag_in_use', v_in_use,
    -- a sala aparece durante o evento (aberta ou trancada) e, fora dele, para quem tem a tag
    'visible_in_oracle', v_live or v_has,
    'tag', jsonb_build_object('base', r.unlock_base_tag, 'name', r.unlock_tag_name, 'emoji', r.unlock_tag_emoji),
    'via', case when v_bearer.id is not null and v_bearer_open
                then jsonb_build_object('id', v_bearer.id, 'username', v_bearer.username, 'avatar_url', v_bearer.avatar_url, 'avatar_frame', v_bearer.avatar_frame)
                else null end
  );
end;
$$;

-- O portal de alguém: aberto quando a pessoa tem a tag de alguma sala.
create or replace function public.get_secret_room_portal(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object('room', r.key, 'open', true,
             'tag', jsonb_build_object('base', r.unlock_base_tag, 'name', r.unlock_tag_name, 'emoji', r.unlock_tag_emoji),
             'event_live', public.secret_room_event_live(r.event_id))
    from public.secret_rooms r
    where r.is_active and public.secret_room_has_tag(p_user_id, r.unlock_base_tag)
    order by r.created_at
    limit 1
  ) end;
$$;
