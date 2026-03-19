/*
  # Fix Premium Functions - Restore Original Logic
  
  ## Problem
  The lifetime premium implementation incorrectly changed the Stripe subscription check from:
    - ORIGINAL: `current_period_end > now_timestamp` (strict)
    - BROKEN: `current_period_end IS NULL OR current_period_end > now_timestamp` (too permissive)
  
  This caused users with NULL current_period_end (incomplete/expired subscriptions) to appear as premium.
  
  ## Solution
  1. Restore the original strict logic for Stripe subscriptions
  2. Keep lifetime_premium as a SEPARATE first check
  3. Fix affected users (downgrade those who shouldn't be premium)
  
  ## Changes
  - is_premium_active: Restored original Stripe check logic
  - get_user_premium_status: Uses corrected is_premium_active
  - sync_premium_status: Restored original logic
  - All trigger functions: Corrected to use proper customer_id joins
*/

-- Drop all affected functions to recreate with correct logic
DROP FUNCTION IF EXISTS is_premium_active(uuid);
DROP FUNCTION IF EXISTS get_user_premium_status(uuid);
DROP FUNCTION IF EXISTS is_lifetime_premium(uuid);
DROP FUNCTION IF EXISTS sync_premium_status(uuid);

-- Recreate is_premium_active with CORRECT logic
-- This is the ORIGINAL logic + lifetime premium check at the beginning
CREATE OR REPLACE FUNCTION is_premium_active(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
  subscription_record RECORD;
  now_epoch bigint;
BEGIN
  -- FIRST: Check for lifetime premium (highest priority)
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = user_id_input;
  
  IF has_lifetime = true THEN
    RETURN true;
  END IF;
  
  -- SECOND: Check for active Stripe subscription using ORIGINAL logic
  -- IMPORTANT: current_period_end MUST be greater than now (no NULL check!)
  now_epoch := EXTRACT(EPOCH FROM NOW())::bigint;
  
  SELECT ss.* INTO subscription_record
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE sc.user_id = user_id_input
    AND ss.status IN ('active', 'trialing')
    AND ss.current_period_end IS NOT NULL
    AND ss.current_period_end > now_epoch
  ORDER BY ss.current_period_end DESC
  LIMIT 1;

  RETURN FOUND;
END;
$$;

-- Recreate get_user_premium_status (simple wrapper)
CREATE OR REPLACE FUNCTION get_user_premium_status(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN is_premium_active(user_id_input);
END;
$$;

-- Recreate is_lifetime_premium helper
CREATE OR REPLACE FUNCTION is_lifetime_premium(user_id_input uuid)
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
  WHERE id = user_id_input;
  
  RETURN COALESCE(has_lifetime, false);
END;
$$;

-- Recreate sync_premium_status with ORIGINAL logic + lifetime support
CREATE OR REPLACE FUNCTION sync_premium_status(user_id_input uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
  premium_active boolean;
  new_plan_type text;
  new_ticket_count integer;
  result json;
BEGIN
  -- Check for lifetime premium first
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = user_id_input;
  
  -- If lifetime premium, ensure plan_type is 'premium' and return
  IF has_lifetime = true THEN
    UPDATE profiles
    SET plan_type = 'premium', updated_at = NOW()
    WHERE id = user_id_input AND plan_type != 'premium';
    
    RETURN json_build_object(
      'success', true,
      'user_id', user_id_input,
      'plan_type', 'premium',
      'is_lifetime', true,
      'message', 'Lifetime premium active'
    );
  END IF;
  
  -- For non-lifetime users, check subscription status
  premium_active := is_premium_active(user_id_input);

  IF premium_active THEN
    new_plan_type := 'premium';
  ELSE
    new_plan_type := 'free';
  END IF;

  -- Update profile plan_type
  UPDATE profiles
  SET 
    plan_type = new_plan_type,
    updated_at = NOW()
  WHERE id = user_id_input;

  result := json_build_object(
    'success', true,
    'user_id', user_id_input,
    'plan_type', new_plan_type,
    'is_lifetime', false,
    'is_premium', premium_active,
    'synced_at', NOW()
  );

  RETURN result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_premium_active TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_premium_status TO authenticated;
GRANT EXECUTE ON FUNCTION is_lifetime_premium TO authenticated;
GRANT EXECUTE ON FUNCTION sync_premium_status TO authenticated;

-- Recreate trigger functions with correct logic (using customer_id join)
CREATE OR REPLACE FUNCTION handle_subscription_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_user_id uuid;
  has_lifetime boolean;
BEGIN
  -- Find the user via customer_id
  SELECT sc.user_id INTO affected_user_id
  FROM stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id;
  
  IF affected_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if user has lifetime premium (never touch their status)
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = affected_user_id;
  
  IF has_lifetime = true THEN
    RETURN NEW;
  END IF;
  
  -- Sync premium status based on subscription
  PERFORM sync_premium_status(affected_user_id);
  
  RETURN NEW;
END;
$$;

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
  -- Find user via customer_id
  SELECT sc.user_id INTO affected_user_id
  FROM stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id;
  
  IF affected_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if user has lifetime premium
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = affected_user_id;
  
  IF has_lifetime = true THEN
    RETURN NEW;
  END IF;
  
  -- Sync premium status
  PERFORM sync_premium_status(affected_user_id);
  
  RETURN NEW;
END;
$$;

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
  -- Find user via customer_id
  SELECT sc.user_id INTO affected_user_id
  FROM stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id;
  
  IF affected_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if user has lifetime premium (NEVER downgrade them)
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = affected_user_id;
  
  IF has_lifetime = true THEN
    RETURN NEW;
  END IF;
  
  -- Sync premium status (will downgrade if subscription expired)
  PERFORM sync_premium_status(affected_user_id);
  
  RETURN NEW;
END;
$$;

-- FIX ALL AFFECTED USERS
-- Sync every user who has stripe_customers record to ensure correct status
DO $$
DECLARE
  user_rec RECORD;
BEGIN
  FOR user_rec IN 
    SELECT DISTINCT p.id
    FROM profiles p
    LEFT JOIN stripe_customers sc ON sc.user_id = p.id
    WHERE p.lifetime_premium = false
      AND (sc.customer_id IS NOT NULL OR p.plan_type = 'premium')
  LOOP
    PERFORM sync_premium_status(user_rec.id);
  END LOOP;
END $$;
