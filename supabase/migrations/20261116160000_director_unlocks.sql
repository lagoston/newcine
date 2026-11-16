-- Conta Diretor, etapa B: os desbloqueáveis e os menus (16/11/2026).
--
-- Continua 20261116150000_director_foundation.sql. Princípio dos agentes: liberar
-- no "está liberado?", nunca no "conceder". Nada é gravado nas tabelas de posse
-- (user_cosmetic_unlocks, user_special_tags, user_unlocked_tags), então não nasce
-- sussurro, story nem aviso, e não há o que desfazer quando a conta largar o papel.
--
--   * is_director_user(uid): papel ativo de uma conta pelo id. Só para dentro das
--     funções de "está liberado?" e dos gatilhos da própria conta; o site não chama;
--   * is_cosmetic_unlocked, is_progression_tag_unlocked e is_franchise_tag_unlocked
--     respondem sim para o diretor: molduras, banners, cartas, efeitos de nome,
--     kits da Cobra, Melhores da Década (Cine Elite). Cobrem set_user_cosmetic,
--     reconcile_user_cosmetics, equip_cobra_kit e enforce_library_layout;
--   * guard_games_active_tag deixa o diretor vestir tag de Jogos sem tê-la;
--   * get_poster_catalog_review (o menu /curadoria/posteres) abre também para o
--     diretor e não conta a conta escondida em "quantas pessoas têm";
--   * secret_room_access: o diretor entra em qualquer sala; o ?via= da conta
--     escondida não abre portal para ninguém;
--   * get_seasonal_event_state: a prévia de evento (?evento=natal) fica só para o
--     diretor e mostra também rascunhos.
--
-- Fora daqui, de propósito: os portões do Jackpot e do Pôquer (jackpot_enabled,
-- poker_enabled) não mudam. A conta já é testadora dos dois, e jackpot_enabled é
-- chamada pela função do giro, que não se toca. O Premium da conta é um dado,
-- gravado pelo console, não por código.
--
-- Ponto de partida de cada função: a definição no ar (md5 conferido); só as linhas
-- marcadas mudaram.

create or replace function public.is_director_user(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null and exists (
    select 1 from director.accounts a where a.user_id = p_uid and a.revoked_at is null);
$$;
revoke all on function public.is_director_user(uuid) from public, anon, authenticated;

-- is_cosmetic_unlocked
CREATE OR REPLACE FUNCTION public.is_cosmetic_unlocked(p_user_id uuid, p_category text, p_cosmetic_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req RECORD;
  v_is_premium boolean;
BEGIN
  -- Conta Diretor (16/11/2026): tudo liberado na própria conta, sem gravar posse
  -- (nada vai para as tabelas de conquista: ao largar o papel, volta tudo ao normal)
  IF public.is_director_user(p_user_id) THEN
    RETURN true;
  END IF;

  -- 03/11/2026 (pôquer): moldura ou banner ganho fora de tag/Premium (prêmio
  -- da mesa) vale para sempre, com ou sem Premium.
  IF EXISTS (SELECT 1 FROM user_cosmetic_unlocks u
              WHERE u.user_id = p_user_id AND u.category = p_category AND u.cosmetic_id = p_cosmetic_id) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_req FROM cosmetic_requirements
  WHERE category = p_category AND cosmetic_id = p_cosmetic_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_req.is_premium THEN
    SELECT (plan_type = 'premium' OR COALESCE(lifetime_premium, false)) INTO v_is_premium
    FROM profiles WHERE id = p_user_id;
    IF NOT COALESCE(v_is_premium, false) THEN RETURN false; END IF;
  END IF;

  RETURN is_required_tag_met(p_user_id, v_req.required_tag);
END;
$function$;

-- is_progression_tag_unlocked
create or replace function public.is_progression_tag_unlocked(p_user_id uuid, p_tag_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_mood text;
begin
  -- Conta Diretor (16/11/2026): tudo liberado na própria conta, sem gravar posse
  -- (nada vai para as tabelas de conquista: ao largar o papel, volta tudo ao normal)
  if public.is_director_user(p_user_id) then
    return true;
  end if;

  v_mood := case p_tag_name
    when 'Enigmatic' then 'mind-blowing'
    when 'Bloody Mary' then 'dark-and-scary'
    when 'Dreamwalker' then 'drug-trip'
    when 'Trailblazer' then 'adventures'
    when 'Soul Collector' then 'catharsis'
    when 'Daredevil' then 'adrenaline'
    when 'Cine Cupid' then 'romantic'
    when 'Peter Pan' then 'family-time'
    when 'Punchliner' then 'laugh-out-loud'
    else null
  end;

  if v_mood is not null then
    select count(*) into v_count
      from (
        select distinct um.media_type, um.movie_id
          from user_movies um
          join shelf_titles() st on st.tmdb_id = um.movie_id and st.media_type = um.media_type
         where um.user_id = p_user_id
           and um.rating is not null
           and st.mood_key = v_mood
      ) t;
    return v_count >= 50;
  end if;

  if p_tag_name in ('Balcony Regular', 'Seat Warmer', 'Popcorn Pro', 'Reel Addict', 'Cine Elite', 'Projectionist Supreme', 'Cinematic Guru') then
    select count(*) into v_count
      from user_movies
     where user_id = p_user_id and rating is not null;
    return v_count >= (case p_tag_name
      when 'Balcony Regular' then 1
      when 'Seat Warmer' then 20
      when 'Popcorn Pro' then 50
      when 'Reel Addict' then 100
      when 'Cine Elite' then 200
      when 'Projectionist Supreme' then 500
      else 1000
    end);
  end if;

  if p_tag_name = 'CineHater' then
    select count(*) into v_count
      from user_movies
     where user_id = p_user_id and rating is not null and rating <= 3;
    return v_count >= 20;
  end if;

  if p_tag_name in ('Scribbler', 'Screenwriter', 'Memoirist') then
    select count(*) into v_count
      from reviews
     where user_id = p_user_id and is_ai_generated = false;
    return v_count >= (case p_tag_name when 'Scribbler' then 1 when 'Screenwriter' then 10 else 30 end);
  end if;

  return false;
end;
$$;

-- is_franchise_tag_unlocked
create or replace function public.is_franchise_tag_unlocked(p_user_id uuid, p_tag_id text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_movie_ids integer[];
  v_required_count integer;
  v_watched_count integer;
begin
  -- Conta Diretor (16/11/2026): tudo liberado na própria conta, sem gravar posse
  -- (nada vai para as tabelas de conquista: ao largar o papel, volta tudo ao normal)
  if public.is_director_user(p_user_id) then
    return true;
  end if;

  -- 11/11/2026: 'hell-rider' (Spirit of Vengeance) saiu; o Motoqueiro virou kit da Cobra.
  case p_tag_id
    when 'red-pill-adept'     then v_movie_ids := array[603,604,605];                                  v_required_count := 3;
    when 'visceral-gamer'     then v_movie_ids := array[176,215,214,663,11917,22804,41439,298250,602734,951491]; v_required_count := 10;
    when 'nuts'               then v_movie_ids := array[425,950,8355,57800,278154,774825];              v_required_count := 6;
    when 'flux-capacitor-fan' then v_movie_ids := array[105,165,196];                                   v_required_count := 3;
    when 'hogwarts-graduate'  then v_movie_ids := array[671,672,673,674,675,767,12444,12445];           v_required_count := 8;
    when 'cybertron-sentinel' then v_movie_ids := array[424783,1858,91314,667538,335988,8373,38356];    v_required_count := 7;
    when 'death-dodger'       then v_movie_ids := array[9532,9358,9286,19912,55779];                    v_required_count := 5;
    when 'casual-drinker'     then v_movie_ids := array[18785,45243,109439];                            v_required_count := 3;
    when 'infinity-gauntlet'  then v_movie_ids := array[24428,299536,99861,299534];                     v_required_count := 4;
    else return false;
  end case;

  select count(*) into v_watched_count
  from user_movies
  where user_id = p_user_id and rating is not null and movie_id = any(v_movie_ids);

  return v_watched_count >= v_required_count;
end;
$function$;

-- guard_games_active_tag
create or replace function public.guard_games_active_tag()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.active_tag is null or coalesce(new.active_tag ->> 'category', '') <> 'games' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.active_tag is not distinct from old.active_tag then
    return new;
  end if;
  -- Conta Diretor (16/11/2026): veste qualquer tag de Jogos para ver como fica, sem ganhá-la
  if public.is_director_user(new.id) then
    return new;
  end if;
  if not exists (
    select 1
      from user_special_tags ust
      join special_tags st on st.id = ust.tag_id
     where ust.user_id = new.id
       and st.category = 'games'
       and st.name = new.active_tag ->> 'name'
  ) then
    raise exception 'tag_not_owned' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- get_poster_catalog_review
create or replace function public.get_poster_catalog_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Conta Diretor (16/11/2026): o menu de curadoria abre para os testadores e para o diretor
  if v_uid is null or not (exists (select 1 from poster_jackpot_settings s where s.id and v_uid = any (coalesce(s.testers, '{}')))
                           or public.is_director(1)) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'goal', jsonb_build_object('common', 80, 'rare', 60, 'epic', 40, 'legendary', 20),
    'posters', (
      select coalesce(jsonb_agg(poster_item_json(pi) || jsonb_build_object(
               'is_active', pi.is_active,
               'exclusive', pi.exclusive,
               'batch', b.batch,
               'added_at', pi.created_at,
               'owners', (select count(distinct up.user_id) from user_posters up
                           where up.item_id = pi.id and up.reset_at is null
                             and not public.is_hidden_account(up.user_id)))  -- conta diretor escondida (16/11/2026)
             order by array_position(array['legendary', 'epic', 'rare', 'common'], pi.rarity), pi.serial), '[]'::jsonb)
        from poster_items pi
        left join (select x.created_at, dense_rank() over (order by x.created_at)::int as batch
                     from (select distinct created_at from poster_items where exclusive is null) x) b
          on b.created_at = pi.created_at and pi.exclusive is null));
end;
$$;

-- secret_room_access
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
    select * into v_bearer from public.profiles where lower(username) = lower(trim(p_via))
       and not public.is_hidden_account(id) limit 1;  -- conta diretor escondida (16/11/2026): o ?via= dela não abre portal
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
  elsif public.is_director_user(p_viewer) then
    -- Conta Diretor (16/11/2026): entra em qualquer sala, sem a tag (e sem aparecer como membro)
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
    'visible_in_oracle', v_live or v_has or v_mode = 'member',
    'tag', jsonb_build_object('base', r.unlock_base_tag, 'name', r.unlock_tag_name, 'emoji', r.unlock_tag_emoji),
    'via', case when v_bearer.id is not null and v_bearer_open
                then jsonb_build_object('id', v_bearer.id, 'username', v_bearer.username, 'avatar_url', v_bearer.avatar_url, 'avatar_frame', v_bearer.avatar_frame)
                else null end
  );
end;
$$;

-- get_seasonal_event_state
CREATE OR REPLACE FUNCTION public.get_seasonal_event_state(p_preview text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  e public.seasonal_events%rowtype;
  w record;
  chosen boolean := false;
  lst jsonb;
  steps_out jsonb;
  items jsonb;
  actions jsonb;
  pre int := 0;
  lvl int;
  deco text;
begin
  perform public.finalize_seasonal_tags();

  -- Conta Diretor (16/11/2026): a prévia de um evento fora da época passa a ser só
  -- dela (antes qualquer um via com ?evento=natal) e mostra também rascunhos
  -- (enabled = false). Para os outros, p_preview é ignorado.
  if p_preview is not null and public.is_director(1) then
    select * into e from public.seasonal_events se where se.id = p_preview;
    if found then
      chosen := true;
      select * into w from public.seasonal_event_window(e.id);
    end if;
  end if;

  if not chosen then
    for e in select * from public.seasonal_events se where se.enabled order by se.created_at, se.id loop
      select * into w from public.seasonal_event_window(e.id);
      if w.is_active then
        chosen := true;
        exit;
      end if;
    end loop;
  end if;

  if not chosen then
    return null;
  end if;

  lvl := greatest(1, w.edition - e.first_edition + 1);
  deco := case when e.decoration_tag is null then null else public.seasonal_edition_tag(e.decoration_tag, lvl) end;

  -- rascunho (16/11/2026): mesmo na época, a prévia de um evento desligado é só visual
  if w.is_active and e.enabled then
    perform public.ensure_seasonal_edition_tags(e.id, w.edition);
    if uid is not null then
      perform public.grant_seasonal_tags(uid, e.id, w.edition);
    end if;
    update public.special_tags t
    set starts_at = w.starts_at, ends_at = w.ends_at
    where t.id in (select public.seasonal_edition_tag(s.value->>'tag', lvl) from jsonb_array_elements(e.steps) s)
      and (t.starts_at is distinct from w.starts_at or t.ends_at is distinct from w.ends_at);
  end if;

  lst := public.seasonal_event_list(e.id, w.edition);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.mid,
           'oracle', (select rp.card_type from public.recommendation_pools rp
                      where rp.mood_key <> 'random-surprise' and rp.movie_ids @> to_jsonb(x.mid)
                      order by rp.card_type limit 1)
         ) order by x.ord), '[]'::jsonb)
  into items
  from (
    select (v #>> '{}')::int mid, ord
    from jsonb_array_elements(lst) with ordinality as t(v, ord)
  ) x;

  select coalesce(jsonb_object_agg(k.kind, k.ids), '{}'::jsonb)
  into actions
  from (
    select a.kind, jsonb_agg(a.movie_id order by a.created_at) ids
    from public.seasonal_event_actions a
    where uid is not null and a.user_id = uid and a.event_id = e.id and a.edition = w.edition
      and public.seasonal_action_valid(uid, a.kind, a.movie_id)
    group by a.kind
  ) k;

  if uid is not null then
    pre := public.seasonal_pre_rated(uid, e.id, w.edition);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'index', z.idx,
           'tag', z.tag,
           'base_tag', z.base_tag,
           'name', coalesce(z.tag_name, z.base_name || case when lvl > 1 then ' ' || public.roman_numeral(lvl) else '' end),
           'emoji', coalesce(z.tag_emoji, z.base_emoji),
           'kind', z.kind,
           'count', z.cnt,
           'progress', z.progress,
           'credited', z.credited,
           'unlocked', z.owned_at is not null,
           'unlocked_at', z.owned_at,
           'available', coalesce(z.prev_owned, true)
         ) order by z.idx), '[]'::jsonb)
  into steps_out
  from (
    select s.*, sb.base_tag, t.name tag_name, t.emoji tag_emoji, b.name base_name, b.emoji base_emoji,
           bool_and(s.owned_at is not null) over (order by s.idx rows between unbounded preceding and 1 preceding) prev_owned
    from public.seasonal_step_states(uid, e.id, w.edition) s
    cross join lateral (select e.steps -> (s.idx - 1) ->> 'tag' as base_tag) sb
    left join public.special_tags t on t.id = s.tag
    left join public.special_tags b on b.id = sb.base_tag
  ) z;

  return jsonb_build_object(
    'id', e.id,
    'edition', w.edition,
    'level', lvl,
    'starts_at', w.starts_at,
    'ends_at', w.ends_at,
    'is_active', w.is_active and e.enabled,
    'is_preview', not (w.is_active and e.enabled),
    'now', now(),
    'items', items,
    'actions', actions,
    'steps', steps_out,
    'pre_rated', pre,
    'list_size', jsonb_array_length(lst),
    'bonus_moods', to_jsonb(coalesce(e.bonus_moods, '{}'::text[])),
    'decoration_tag', deco,
    'decoration_unlocked', uid is not null and deco is not null and exists (
      select 1 from public.user_special_tags ust where ust.user_id = uid and ust.tag_id = deco)
  );
end;
$function$;
