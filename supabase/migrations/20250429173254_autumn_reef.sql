/*
  # Update public_profiles view to include avatar_frame

  1. Changes
    - Drop existing view
    - Recreate view with avatar_frame column
    - Maintain all existing columns and joins
    - Grant SELECT permission to authenticated users
*/

-- Drop existing view
DROP VIEW IF EXISTS public_profiles CASCADE;

-- Recreate view with avatar_frame
CREATE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.active_tag,
  ut.plan_type,
  p.avatar_frame
FROM profiles p
LEFT JOIN user_tickets ut ON p.id = ut.user_id;

-- Grant access to authenticated users
GRANT SELECT ON public_profiles TO authenticated;