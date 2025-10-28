/*
  # Public Profile View for Premium Status

  1. Changes
    - Create a public view for profile data including plan type
    - Grant SELECT access to authenticated users
    - Include only necessary fields for public viewing
    - Add avatar_frame and banner fields
    - Fix plan_type column access from user_tickets

  2. Security
    - Ensures sensitive data remains protected
    - Only exposes required fields for public access
*/

-- Drop existing view if it exists
DROP VIEW IF EXISTS public_profiles;

-- Create public profile view with correct plan_type access
CREATE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.active_tag,
  p.avatar_frame,
  p.banner,
  COALESCE(ut.plan_type, 'free') as plan_type
FROM profiles p
LEFT JOIN user_tickets ut ON p.id = ut.user_id;

-- Grant access to authenticated users
GRANT SELECT ON public_profiles TO authenticated;