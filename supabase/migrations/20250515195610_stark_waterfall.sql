/*
  # Fix Premium Crown Visibility Issues

  1. Purpose
    - Ensure premium status is properly visible across all profile views
    - Fix any data inconsistencies between profiles and user_tickets tables
    - Create appropriate indexes for better query performance

  2. Changes
    - Synchronize premium status between profiles and user_tickets tables
    - Add missing premium status data to profiles table
    - Ensure plan_type column exists in profiles with correct values
    - Update active subscriptions to set premium status correctly
*/

-- First ensure plan_type column exists in profiles table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE profiles ADD COLUMN plan_type text DEFAULT 'free';
  END IF;
END $$;

-- Synchronize plan_type between tables - first from profiles to user_tickets
UPDATE user_tickets ut
SET plan_type = p.plan_type
FROM profiles p
WHERE ut.user_id = p.id
  AND p.plan_type = 'premium'
  AND ut.plan_type <> 'premium';

-- Then from user_tickets to profiles
UPDATE profiles p
SET plan_type = ut.plan_type
FROM user_tickets ut
WHERE p.id = ut.user_id
  AND ut.plan_type = 'premium'
  AND (p.plan_type IS NULL OR p.plan_type <> 'premium');

-- Update all active subscriptions to ensure premium status
UPDATE profiles p
SET plan_type = 'premium'
FROM stripe_customers sc
JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
WHERE sc.user_id = p.id
  AND ss.status = 'active'
  AND sc.deleted_at IS NULL
  AND ss.deleted_at IS NULL;

-- Update user_tickets for active subscribers
UPDATE user_tickets ut
SET plan_type = 'premium'
FROM stripe_customers sc
JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
WHERE ut.user_id = sc.user_id
  AND ss.status = 'active'
  AND sc.deleted_at IS NULL
  AND ss.deleted_at IS NULL;

-- Make plan_type values consistent
UPDATE profiles 
SET plan_type = 'free' 
WHERE plan_type IS NULL OR plan_type = '';

-- Create or update public_profiles view to include plan_type
DROP VIEW IF EXISTS public_profiles;

CREATE VIEW public_profiles AS
SELECT 
  id,
  username,
  avatar_url,
  bio,
  created_at,
  updated_at,
  plan_type,
  avatar_frame,
  banner,
  active_tag
FROM profiles;

-- Grant access to the view
GRANT SELECT ON public_profiles TO public;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON profiles(plan_type);
CREATE INDEX IF NOT EXISTS idx_user_tickets_plan_type ON user_tickets(plan_type);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status ON stripe_subscriptions(status) 
WHERE deleted_at IS NULL;