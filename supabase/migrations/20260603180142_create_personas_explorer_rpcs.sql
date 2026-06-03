/*
  # Persona explorer system

  ## What
  Adds two RPC functions to power the new "Ver Personas" feature in Profile.

  ## New functions
  1. `get_personas_global_stats()` — returns one row per archetype/subcategory
     combination (20 × 6 = 120 personas) with the count of users having that
     personalidade_completa. Includes localized names. Always returns all 120,
     even those with zero users.

  2. `get_persona_matching_users(persona_code, viewer_id)` — returns up to 50
     users who match the given persona code (e.g., "EIA") that the viewer
     follows OR whose profile is public. Used to show "friends with this persona".

  ## Security
  Both functions are SECURITY DEFINER but only return data the viewer is
  already entitled to see (own profile, public profiles, followed users).
*/

CREATE OR REPLACE FUNCTION public.get_personas_global_stats()
RETURNS TABLE (
  archetype_id text,
  subcategory_id text,
  persona_code text,
  archetype_name text,
  archetype_name_en text,
  subcategory_name text,
  subcategory_name_en text,
  primary_spectrum text,
  secondary_spectrum text,
  pair_name text,
  user_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH counts AS (
    SELECT
      personalidade_completa,
      COUNT(*) AS c
    FROM profiles
    WHERE personalidade_completa IS NOT NULL
      AND length(personalidade_completa) = 3
    GROUP BY personalidade_completa
  )
  SELECT
    a.id                                     AS archetype_id,
    s.id                                     AS subcategory_id,
    (a.id || s.id)                           AS persona_code,
    a.name                                   AS archetype_name,
    COALESCE(a.name_en, a.name)              AS archetype_name_en,
    s.name                                   AS subcategory_name,
    COALESCE(s.name_en, s.name)              AS subcategory_name_en,
    a.primary_spectrum,
    a.secondary_spectrum,
    s.pair_name,
    COALESCE(c.c, 0)                         AS user_count
  FROM cinematic_archetypes a
  CROSS JOIN antagonistic_subcategories s
  LEFT JOIN counts c ON c.personalidade_completa = a.id || s.id
  ORDER BY a.primary_spectrum, a.secondary_spectrum, s.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_personas_global_stats() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_persona_matching_users(
  persona_code text,
  viewer_id uuid
)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  avatar_frame text,
  plan_type text,
  is_followed boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    p.id              AS user_id,
    p.username,
    p.avatar_url,
    p.avatar_frame,
    p.plan_type,
    EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = viewer_id
        AND f.following_id = p.id
    )                 AS is_followed
  FROM profiles p
  WHERE p.personalidade_completa = persona_code
    AND p.id <> viewer_id
    AND (
      p.profile_visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = viewer_id AND f.following_id = p.id
      )
    )
  ORDER BY
    EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = viewer_id AND f.following_id = p.id
    ) DESC,
    p.username ASC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_persona_matching_users(text, uuid) TO authenticated;
