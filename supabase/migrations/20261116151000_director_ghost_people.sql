-- Conta Diretor, etapa A: o fantasma nas funções (16/11/2026).
--
-- As políticas da migração anterior escondem a conta na leitura crua das tabelas,
-- mas as funções SECURITY DEFINER passam por cima da RLS. Cada uma que lista,
-- busca, conta ou mostra pessoas ganha aqui a regra public.is_hidden_account
-- (mapeamento dos agentes da área social, da casa e dos oráculos):
--
--   * can_view_user_content: uma linha que fecha biblioteca, estúdio, temas,
--     listas, Conexão, Top 100, ordem das décadas e pôsteres equipados para os
--     outros (3 políticas e mais de 10 funções usam esta regra);
--   * Comunidade: get_visible_profiles, count_visible_profiles (juntas, para a
--     paginação não errar) e search_visible_profiles;
--   * /profile/<@>: get_profile_by_username responde como @ inexistente;
--   * Persona: get_user_persona (regra própria, chamada pelo APK antigo), as
--     contagens de get_personas_catalog e get_personas_global_stats, e "quem
--     também é" em get_persona_matching_users__impl;
--   * séries no perfil: get_tv_progress_batch_for_profile e
--     get_watched_episodes_for_profile passam também por can_view_user_content;
--   * salas secretas: get_secret_room não conta nem mostra a conta como membro;
--   * previsão: predict_ratings e predict_ratings_outside tiram as notas de
--     teste da conta da média global e do termo de comunidade dos outros; o
--     placar (trigger_log_prediction_accuracy) e o laboratório (lab_export_text)
--     ignoram a conta, como já fazem com os bots;
--   * convites: a conta não tem código, o código dela vale como inexistente e
--     ela não ganha fichas por convite.
--
-- Esta migração cobre as pessoas (comunidade, perfil, Persona, séries); a previsão
-- e as salas/convites vêm em 20261116151100 e 20261116151200.
--
-- O ponto de partida de cada função é a definição que está no ar (conferida por
-- md5 do corpo antes desta migração); só as linhas marcadas mudaram. Filtros de
-- esconder usam auth.uid(), nunca um parâmetro de "quem está vendo". Nas
-- varreduras grandes (previsão, laboratório) o filtro consulta director.accounts
-- direto, em vez de chamar a função linha a linha.

-- can_view_user_content
CREATE OR REPLACE FUNCTION public.can_view_user_content(p_owner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_vis text; v_uid uuid := auth.uid(); v_role text := auth.role();
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN RETURN true; END IF;
  IF v_uid IS NOT NULL AND v_uid = p_owner THEN RETURN true; END IF;
  -- Conta diretor escondida (16/11/2026): para os outros, como se não existisse.
  IF public.is_hidden_account(p_owner) THEN RETURN false; END IF;
  SELECT profile_visibility INTO v_vis FROM profiles WHERE id = p_owner;
  IF v_vis IS NULL OR v_vis = 'public' THEN RETURN true; END IF;
  IF v_vis = 'friends_only' AND v_uid IS NOT NULL AND public.are_friends(v_uid, p_owner) THEN RETURN true; END IF;
  RETURN false;
END; $function$;

-- get_visible_profiles
CREATE OR REPLACE FUNCTION public.get_visible_profiles(p_user_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, username text, avatar_url text, bio text, plan_type text, avatar_frame text, banner text, text_effect text, active_tag jsonb, profile_visibility text, friends_count bigint, real_review_count bigint, is_premium boolean, mutual_friends_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_caller_is(p_user_id);
RETURN QUERY
WITH my_friends AS (
  SELECT CASE WHEN requester_id = p_user_id THEN addressee_id ELSE requester_id END AS friend_id
  FROM friendships
  WHERE status = 'accepted' AND (requester_id = p_user_id OR addressee_id = p_user_id)
),
fof AS (
  SELECT DISTINCT
    CASE WHEN f.requester_id = mf.friend_id THEN f.addressee_id ELSE f.requester_id END AS fof_id
  FROM friendships f
  JOIN my_friends mf ON f.requester_id = mf.friend_id OR f.addressee_id = mf.friend_id
  WHERE f.status = 'accepted'
)
SELECT
p.id,
p.username,
p.avatar_url,
p.bio,
p.plan_type,
p.avatar_frame,
p.banner,
p.text_effect,
p.active_tag,
p.profile_visibility,
(SELECT count(*) FROM friendships WHERE status = 'accepted' AND (requester_id = p.id OR addressee_id = p.id)) as friends_count,
(SELECT count(*) FROM reviews r WHERE r.user_id = p.id AND r.is_ai_generated = false) as real_review_count,
(p.plan_type = 'premium' OR COALESCE(p.lifetime_premium, false)) as is_premium,
(SELECT count(*) FROM my_friends mf
 JOIN friendships f2 ON (f2.requester_id = mf.friend_id AND f2.addressee_id = p.id) OR (f2.addressee_id = mf.friend_id AND f2.requester_id = p.id)
 WHERE f2.status = 'accepted'
) as mutual_friends_count
FROM profiles p
INNER JOIN auth.users u ON p.id = u.id
WHERE
(u.email_confirmed_at IS NOT NULL OR p.id = p_user_id)
-- conta diretor escondida (16/11/2026): só ela mesma se vê
AND (p.id = (SELECT auth.uid()) OR NOT public.is_hidden_account(p.id))
AND
(
p.id = p_user_id
OR
p.profile_visibility = 'public'
OR
(
p.profile_visibility = 'friends_only'
AND are_friends(p_user_id, p.id)
)
)
ORDER BY
  (p.id IN (SELECT fof_id FROM fof)) DESC,
  p.created_at DESC
LIMIT p_limit
OFFSET p_offset;
END;
$function$;

-- count_visible_profiles
CREATE OR REPLACE FUNCTION public.count_visible_profiles(p_user_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total bigint;
BEGIN
  PERFORM public.assert_caller_is(p_user_id);
  SELECT count(*)
  INTO total
  FROM profiles p
  INNER JOIN auth.users u ON p.id = u.id
  WHERE
    (u.email_confirmed_at IS NOT NULL OR p.id = p_user_id)
    -- conta diretor escondida (16/11/2026): só ela mesma se vê
    AND (p.id = (SELECT auth.uid()) OR NOT public.is_hidden_account(p.id))
    AND
    (
      p.id = p_user_id
      OR
      p.profile_visibility = 'public'
      OR
      (
        p.profile_visibility = 'friends_only'
        AND are_friends(p_user_id, p.id)
      )
    );

  RETURN total;
END;
$function$;

-- search_visible_profiles
CREATE OR REPLACE FUNCTION public.search_visible_profiles(p_user_id uuid, p_search_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, username text, avatar_url text, bio text, plan_type text, avatar_frame text, banner text, text_effect text, active_tag jsonb, profile_visibility text, friends_count bigint, real_review_count bigint, is_premium boolean, mutual_friends_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_caller_is(p_user_id);
RETURN QUERY
WITH my_friends AS (
  SELECT CASE WHEN requester_id = p_user_id THEN addressee_id ELSE requester_id END AS friend_id
  FROM friendships
  WHERE status = 'accepted' AND (requester_id = p_user_id OR addressee_id = p_user_id)
)
SELECT
p.id,
p.username,
p.avatar_url,
p.bio,
p.plan_type,
p.avatar_frame,
p.banner,
p.text_effect,
p.active_tag,
p.profile_visibility,
(SELECT count(*) FROM friendships WHERE status = 'accepted' AND (requester_id = p.id OR addressee_id = p.id)) as friends_count,
(SELECT count(*) FROM reviews r WHERE r.user_id = p.id AND r.is_ai_generated = false) as real_review_count,
(p.plan_type = 'premium' OR COALESCE(p.lifetime_premium, false)) as is_premium,
(SELECT count(*) FROM my_friends mf
 JOIN friendships f2 ON (f2.requester_id = mf.friend_id AND f2.addressee_id = p.id) OR (f2.addressee_id = mf.friend_id AND f2.requester_id = p.id)
 WHERE f2.status = 'accepted'
) as mutual_friends_count
FROM profiles p
INNER JOIN auth.users u ON p.id = u.id
WHERE
(u.email_confirmed_at IS NOT NULL OR p.id = p_user_id)
-- conta diretor escondida (16/11/2026): só ela mesma se vê
AND (p.id = (SELECT auth.uid()) OR NOT public.is_hidden_account(p.id))
AND
(
p.id = p_user_id
OR
p.profile_visibility = 'public'
OR
(
p.profile_visibility = 'friends_only'
AND are_friends(p_user_id, p.id)
)
)
AND
(
p.username ILIKE '%' || p_search_query || '%'
OR
p.bio ILIKE '%' || p_search_query || '%'
)
ORDER BY p.username
LIMIT p_limit;
END;
$function$;

-- get_profile_by_username
CREATE OR REPLACE FUNCTION public.get_profile_by_username(p_username text, p_viewer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, username text, avatar_url text, bio text, created_at timestamp with time zone, plan_type text, avatar_frame text, banner text, text_effect text, active_tag jsonb, is_premium boolean, chroma_box_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_viewer_is(p_viewer_id);
  RETURN QUERY
  SELECT p.id, p.username, p.avatar_url, p.bio, p.created_at, p.plan_type, p.avatar_frame, p.banner, p.text_effect, p.active_tag,
  (p.plan_type = 'premium' OR COALESCE(p.lifetime_premium, false)) as is_premium,
  COALESCE(p.chroma_box_enabled, true) as chroma_box_enabled
  FROM profiles p
  INNER JOIN auth.users u ON p.id = u.id
  WHERE p.username = p_username
  AND (u.email_confirmed_at IS NOT NULL OR p.id = p_viewer_id)
  -- conta diretor escondida (16/11/2026): para os outros, "perfil não encontrado"
  AND (p.id = (SELECT auth.uid()) OR NOT public.is_hidden_account(p.id))
  AND (
    p.id = p_viewer_id
    OR p.profile_visibility = 'public'
    OR (
      p.profile_visibility = 'friends_only'
      AND p_viewer_id IS NOT NULL
      AND are_friends(p_viewer_id, p.id)
    )
  );
END;
$function$;

-- get_user_persona
create or replace function public.get_user_persona(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_prof record;
  v_persona jsonb;
  v_seen jsonb := '{}'::jsonb;
begin
  select p.id, p.personalidade_completa, p.persona_scores, p.persona_counted, p.profile_visibility
    into v_prof
    from profiles p
   where p.id = p_user_id;
  if not found then
    return null;
  end if;

  -- Conta diretor escondida (16/11/2026): a Persona dela só aparece para ela mesma.
  -- Esta função tem regra própria (o APK antigo chama) e não passa por
  -- can_view_user_content. Banco direto e service_role continuam vendo.
  if v_viewer is distinct from p_user_id
     and coalesce(auth.role(), '') not in ('', 'service_role')
     and public.is_hidden_account(p_user_id) then
    return null;
  end if;

  if v_viewer is distinct from p_user_id
     and coalesce(v_prof.profile_visibility, 'public') <> 'public'
     and not (v_prof.profile_visibility = 'friends_only' and v_viewer is not null and are_friends(v_viewer, p_user_id)) then
    return null;
  end if;

  select to_jsonb(cp) into v_persona from cine_personas cp where cp.code = v_prof.personalidade_completa;

  if v_persona is not null and v_viewer is not null then
    select coalesce(jsonb_object_agg(um.media_type || ':' || um.movie_id, um.rating), '{}'::jsonb)
      into v_seen
      from jsonb_array_elements(coalesce(v_persona -> 'works', '[]'::jsonb)) w
      join user_movies um on um.user_id = v_viewer and um.movie_id = (w ->> 'id')::int and um.media_type = (w ->> 'type');
  end if;

  return jsonb_build_object(
    'code', case when v_persona is not null then v_prof.personalidade_completa end,
    'counted', coalesce(v_prof.persona_counted, 0),
    'threshold', 10,
    'scores', coalesce(v_prof.persona_scores, '[]'::jsonb),
    'persona', v_persona,
    'works_seen', v_seen
  );
end;
$$;

-- get_personas_catalog
create or replace function public.get_personas_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(cp) || jsonb_build_object('user_count', coalesce(c.n, 0)) order by cp.sort_order), '[]'::jsonb)
    from cine_personas cp
    left join (
      select p.personalidade_completa, count(*) as n
        from profiles p
       where p.personalidade_completa is not null
         and not public.is_hidden_account(p.id)  -- conta diretor escondida (16/11/2026)
       group by p.personalidade_completa
    ) c on c.personalidade_completa = cp.code;
$$;

-- get_personas_global_stats
CREATE OR REPLACE FUNCTION public.get_personas_global_stats()
 RETURNS TABLE(code text, sort_order smallint, mood_keys text[], title_pt text, title_en text, character_pt text, character_en text, film_title_pt text, film_title_en text, film_year smallint, tmdb_id integer, poster_path text, blurb_pt text, blurb_en text, user_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cp.code, cp.sort_order, cp.mood_keys,
         cp.title_pt, cp.title_en, cp.character_pt, cp.character_en,
         cp.film_title_pt, cp.film_title_en, cp.film_year,
         cp.tmdb_id, cp.poster_path, cp.blurb_pt, cp.blurb_en,
         coalesce(c.n, 0) as user_count
    from cine_personas cp
    left join (
      select p.personalidade_completa, count(*) as n
        from profiles p
       where p.personalidade_completa is not null
         and not public.is_hidden_account(p.id)  -- conta diretor escondida (16/11/2026)
       group by p.personalidade_completa
    ) c on c.personalidade_completa = cp.code
   order by cp.sort_order;
$function$;

-- get_persona_matching_users__impl
CREATE OR REPLACE FUNCTION public.get_persona_matching_users__impl(persona_code text, viewer_id uuid)
 RETURNS TABLE(user_id uuid, username text, avatar_url text, avatar_frame text, plan_type text, is_friend boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
SELECT
p.id              AS user_id,
p.username,
p.avatar_url,
p.avatar_frame,
p.plan_type,
are_friends(viewer_id, p.id) AS is_friend
FROM profiles p
WHERE p.personalidade_completa = persona_code
AND p.id <> viewer_id
AND NOT public.is_hidden_account(p.id)  -- conta diretor escondida (16/11/2026)
AND (
p.profile_visibility = 'public'
OR are_friends(viewer_id, p.id)
)
ORDER BY
are_friends(viewer_id, p.id) DESC,
p.username ASC
LIMIT 50;
$function$;

-- get_tv_progress_batch_for_profile
CREATE OR REPLACE FUNCTION public.get_tv_progress_batch_for_profile(p_viewer_id uuid, p_profile_user_id uuid, p_tmdb_ids integer[])
 RETURNS TABLE(tmdb_id integer, watched_count bigint, aired_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  can_view boolean;
BEGIN
  PERFORM public.assert_viewer_is(p_viewer_id);
  SELECT
    p.id = p_viewer_id
    OR p.profile_visibility = 'public'
    OR (
      p.profile_visibility = 'friends_only'
      AND are_friends(p_viewer_id, p.id)
    )
  INTO can_view
  FROM profiles p
  WHERE p.id = p_profile_user_id;

  IF NOT COALESCE(can_view, false) THEN
    RETURN;
  END IF;

  -- conta diretor escondida (16/11/2026): a mesma regra da biblioteca
  IF NOT public.can_view_user_content(p_profile_user_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH aired AS (
    SELECT
      mc.tmdb_id,
      COUNT(*) FILTER (
        WHERE (episode->>'air_date') IS NOT NULL
          AND (episode->>'air_date')::date <= CURRENT_DATE
      ) AS aired_count
    FROM movie_cache mc
    CROSS JOIN LATERAL jsonb_array_elements(mc.seasons_data) AS season
    CROSS JOIN LATERAL jsonb_array_elements(season->'episodes') AS episode
    WHERE mc.media_type = 'tv'
      AND mc.tmdb_id = ANY(p_tmdb_ids)
      AND mc.seasons_data IS NOT NULL
    GROUP BY mc.tmdb_id
  ),
  watched AS (
    SELECT we.tmdb_id, COUNT(*) AS watched_count
    FROM watched_episodes we
    WHERE we.user_id = p_profile_user_id
      AND we.tmdb_id = ANY(p_tmdb_ids)
    GROUP BY we.tmdb_id
  )
  SELECT
    ids.tmdb_id,
    COALESCE(w.watched_count, 0) AS watched_count,
    COALESCE(a.aired_count, 0) AS aired_count
  FROM unnest(p_tmdb_ids) AS ids(tmdb_id)
  LEFT JOIN watched w ON w.tmdb_id = ids.tmdb_id
  LEFT JOIN aired a ON a.tmdb_id = ids.tmdb_id;
END;
$function$;

-- get_watched_episodes_for_profile
CREATE OR REPLACE FUNCTION public.get_watched_episodes_for_profile(p_viewer_id uuid, p_profile_user_id uuid, p_tmdb_id integer)
 RETURNS TABLE(season_number integer, episode_number integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  can_view boolean;
BEGIN
  PERFORM public.assert_viewer_is(p_viewer_id);
  SELECT
    p.id = p_viewer_id
    OR p.profile_visibility = 'public'
    OR (
      p.profile_visibility = 'friends_only'
      AND are_friends(p_viewer_id, p.id)
    )
  INTO can_view
  FROM profiles p
  WHERE p.id = p_profile_user_id;

  IF NOT COALESCE(can_view, false) THEN
    RETURN;
  END IF;

  -- conta diretor escondida (16/11/2026): a mesma regra da biblioteca
  IF NOT public.can_view_user_content(p_profile_user_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT we.season_number, we.episode_number
  FROM watched_episodes we
  WHERE we.user_id = p_profile_user_id
    AND we.tmdb_id = p_tmdb_id;
END;
$function$;
