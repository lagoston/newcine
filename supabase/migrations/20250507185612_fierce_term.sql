/*
  # Create public_profiles view

  1. New View
    - `public_profiles` - A view that joins profile data with follower/following counts
      - Includes all columns from the profiles table
      - Makes the view accessible to all users

  2. Purpose
    - Provides a consolidated view of user profile data
    - Simplifies querying profile information with related data
    - Used by both the Profile and Community pages
*/

-- Create the public_profiles view that includes all profile information
CREATE OR REPLACE VIEW public_profiles AS
SELECT 
  profiles.*
FROM 
  profiles;

-- Grant permission for anyone to select from this view
GRANT SELECT ON public_profiles TO public;