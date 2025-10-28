-- Add columns for frame and banner images
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS frame_image text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS banner_image text DEFAULT NULL;

-- Update public_profiles view
DROP VIEW IF EXISTS public_profiles CASCADE;

CREATE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.active_tag,
  ut.plan_type,
  p.avatar_frame,
  p.banner,
  p.frame_image,
  p.banner_image
FROM profiles p
LEFT JOIN user_tickets ut ON p.id = ut.user_id;

-- Grant access to authenticated users
GRANT SELECT ON public_profiles TO authenticated;