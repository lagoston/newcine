/*
  # Add Lifetime Premium Support
  
  1. Changes to profiles table
    - Add `lifetime_premium` boolean column (default false)
    - When true, grants all premium benefits without Stripe subscription
  
  2. Updated functions
    - `is_premium_active`: Now also returns true for lifetime premium users
    - `get_user_premium_status`: Now returns lifetime premium info
  
  3. Security
    - Lifetime premium users are immune to subscription checks
    - Cannot be downgraded by Stripe webhook events
    - Manual activation only via database (admin)
*/

-- Add lifetime_premium column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'lifetime_premium'
  ) THEN
    ALTER TABLE profiles ADD COLUMN lifetime_premium boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_lifetime_premium ON profiles(lifetime_premium) WHERE lifetime_premium = true;

-- Drop existing functions to recreate with correct parameter names
DROP FUNCTION IF EXISTS is_premium_active(uuid);
DROP FUNCTION IF EXISTS get_user_premium_status(uuid);
DROP FUNCTION IF EXISTS sync_premium_status(uuid);

-- Recreate is_premium_active to check lifetime premium FIRST
CREATE OR REPLACE FUNCTION is_premium_active(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
  has_subscription boolean;
BEGIN
  -- First check for lifetime premium (highest priority)
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = p_user_id;
  
  -- If lifetime premium, immediately return true
  IF has_lifetime = true THEN
    RETURN true;
  END IF;
  
  -- Otherwise check for active Stripe subscription
  SELECT EXISTS (
    SELECT 1
    FROM stripe_subscriptions
    WHERE user_id = p_user_id
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > NOW())
  ) INTO has_subscription;

  RETURN COALESCE(has_subscription, false);
END;
$$;

-- Recreate get_user_premium_status
CREATE OR REPLACE FUNCTION get_user_premium_status(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN is_premium_active(p_user_id);
END;
$$;

-- Create helper function to check if user has lifetime premium
CREATE OR REPLACE FUNCTION is_lifetime_premium(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
BEGIN
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = p_user_id;
  
  RETURN COALESCE(has_lifetime, false);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_premium_active TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_premium_status TO authenticated;
GRANT EXECUTE ON FUNCTION is_lifetime_premium TO authenticated;

-- Recreate sync_premium_status to respect lifetime premium
CREATE OR REPLACE FUNCTION sync_premium_status(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
  premium_active boolean;
  new_plan_type text;
BEGIN
  -- Check for lifetime premium first
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = p_user_id;
  
  -- If lifetime premium, ensure plan_type is 'premium' and return
  IF has_lifetime = true THEN
    UPDATE profiles
    SET plan_type = 'premium', updated_at = NOW()
    WHERE id = p_user_id AND plan_type != 'premium';
    
    RETURN json_build_object(
      'success', true,
      'plan_type', 'premium',
      'is_lifetime', true,
      'message', 'Lifetime premium - no changes needed'
    );
  END IF;
  
  -- For non-lifetime users, check subscription status
  premium_active := is_premium_active(p_user_id);
  
  IF premium_active THEN
    new_plan_type := 'premium';
  ELSE
    new_plan_type := 'free';
  END IF;
  
  -- Update plan_type if needed
  UPDATE profiles
  SET plan_type = new_plan_type, updated_at = NOW()
  WHERE id = p_user_id AND plan_type != new_plan_type;
  
  RETURN json_build_object(
    'success', true,
    'plan_type', new_plan_type,
    'is_lifetime', false,
    'message', 'Premium status synced'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_premium_status TO authenticated;

-- Update handle_subscription_updated to skip lifetime premium users
CREATE OR REPLACE FUNCTION handle_subscription_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_user_id uuid;
  has_lifetime boolean;
  new_plan_type text;
BEGIN
  -- Find the user associated with this subscription
  SELECT user_id INTO affected_user_id
  FROM stripe_subscriptions
  WHERE id = NEW.id;
  
  IF affected_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if user has lifetime premium
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = affected_user_id;
  
  -- If lifetime premium, don't modify their status
  IF has_lifetime = true THEN
    RETURN NEW;
  END IF;
  
  -- Determine new plan type based on subscription status
  IF NEW.status = 'active' THEN
    new_plan_type := 'premium';
  ELSIF NEW.status IN ('canceled', 'incomplete_expired', 'past_due', 'unpaid') THEN
    new_plan_type := 'free';
  ELSE
    RETURN NEW;
  END IF;
  
  -- Update the user's plan
  UPDATE profiles
  SET plan_type = new_plan_type, updated_at = NOW()
  WHERE id = affected_user_id;
  
  RETURN NEW;
END;
$$;

-- Update handle_subscription_activated to skip lifetime premium users  
CREATE OR REPLACE FUNCTION handle_subscription_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_user_id uuid;
  has_lifetime boolean;
BEGIN
  -- Find user from subscription
  SELECT user_id INTO affected_user_id
  FROM stripe_subscriptions
  WHERE id = NEW.id;
  
  IF affected_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if user has lifetime premium
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = affected_user_id;
  
  -- If lifetime premium, don't modify their status (they already have premium)
  IF has_lifetime = true THEN
    RETURN NEW;
  END IF;
  
  -- Activate premium for non-lifetime user
  IF NEW.status = 'active' THEN
    UPDATE profiles
    SET plan_type = 'premium', updated_at = NOW()
    WHERE id = affected_user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update handle_subscription_canceled to skip lifetime premium users
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_user_id uuid;
  has_lifetime boolean;
BEGIN
  -- Find user from subscription
  SELECT user_id INTO affected_user_id
  FROM stripe_subscriptions
  WHERE id = NEW.id;
  
  IF affected_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if user has lifetime premium
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = affected_user_id;
  
  -- CRITICAL: Never downgrade lifetime premium users
  IF has_lifetime = true THEN
    RETURN NEW;
  END IF;
  
  -- Only downgrade non-lifetime users
  IF NEW.status IN ('canceled', 'incomplete_expired', 'past_due', 'unpaid') THEN
    UPDATE profiles
    SET plan_type = 'free', updated_at = NOW()
    WHERE id = affected_user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Admin function to grant lifetime premium (service_role only)
CREATE OR REPLACE FUNCTION grant_lifetime_premium(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE profiles
  SET 
    lifetime_premium = true,
    plan_type = 'premium',
    updated_at = NOW()
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'message', 'Lifetime premium granted successfully'
  );
END;
$$;

-- Admin function to revoke lifetime premium (service_role only)
CREATE OR REPLACE FUNCTION revoke_lifetime_premium(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_subscription boolean;
  new_plan_type text;
BEGIN
  -- Check if user has active subscription
  SELECT EXISTS (
    SELECT 1
    FROM stripe_subscriptions
    WHERE user_id = p_user_id
    AND status = 'active'
  ) INTO has_subscription;
  
  -- Determine new plan type
  IF has_subscription THEN
    new_plan_type := 'premium';
  ELSE
    new_plan_type := 'free';
  END IF;
  
  UPDATE profiles
  SET 
    lifetime_premium = false,
    plan_type = new_plan_type,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'new_plan_type', new_plan_type,
    'message', 'Lifetime premium revoked'
  );
END;
$$;

-- Grant admin functions to service_role only
GRANT EXECUTE ON FUNCTION grant_lifetime_premium TO service_role;
GRANT EXECUTE ON FUNCTION revoke_lifetime_premium TO service_role;
