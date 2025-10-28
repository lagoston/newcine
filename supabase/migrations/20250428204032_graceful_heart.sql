/*
  # Public Profile View for Premium Status

  1. Changes
    - Create a public view for profile data including plan type
    - Grant SELECT access to authenticated users
    - Include only necessary fields for public viewing

  2. Security
    - Ensures sensitive data remains protected
    - Only exposes required fields for public access
*/

-- Create public profile view
CREATE OR REPLACE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.active_tag,
  ut.plan_type
FROM profiles p
LEFT JOIN user_tickets ut ON p.id = ut.user_id;

-- Grant access to authenticated users
GRANT SELECT ON public_profiles TO authenticated;