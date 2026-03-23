/*
  # Clear Legacy Avatar References (SQL Fallback)

  ## Purpose
  Safety fallback for the legacy avatar migration. Clears avatar_url from
  profiles where the stored URL does not point to a .webp file.

  ## What this does
  - Creates a helper function `clear_non_webp_avatar_urls()` (admin use only)
  - The function NULLs out avatar_url for any profile whose avatar is not WebP
  - Storage files are NOT deleted here (use the cleanup-legacy-avatars Edge Function
    to also remove the actual files from the avatars bucket)

  ## Usage
  Run from the Supabase SQL editor:
    SELECT clear_non_webp_avatar_urls();

  ## Security
  - Function is SECURITY DEFINER with restricted search_path
  - Only affects profiles with non-WebP avatar URLs
  - Returns a count of affected rows
*/

CREATE OR REPLACE FUNCTION public.clear_non_webp_avatar_urls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE profiles
  SET avatar_url = NULL
  WHERE avatar_url IS NOT NULL
    AND avatar_url NOT LIKE '%.webp'
    AND avatar_url NOT LIKE '%.webp?%';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_non_webp_avatar_urls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_non_webp_avatar_urls() TO service_role;
