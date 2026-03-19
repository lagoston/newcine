/*
  # Fix Subscription Triggers for Lifetime Premium
  
  Atualiza os triggers de subscription para:
  1. Nunca rebaixar usuarios com lifetime_premium = true
  2. Manter funcionamento normal para usuarios com assinatura Stripe
*/

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
  -- Find the user associated with this subscription via customer_id
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
  -- Find user from subscription via customer_id
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
  -- Find user from subscription via customer_id
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

-- Sync all current premium users to ensure none lost their status
-- This fixes any users who may have been incorrectly downgraded

-- First: restore lifetime premium users
UPDATE profiles
SET plan_type = 'premium', updated_at = NOW()
WHERE lifetime_premium = true AND plan_type != 'premium';

-- Second: restore premium for users with active Stripe subscriptions
-- Note: current_period_end is stored as bigint (epoch seconds)
UPDATE profiles p
SET plan_type = 'premium', updated_at = NOW()
WHERE p.plan_type != 'premium'
AND p.lifetime_premium = false
AND EXISTS (
  SELECT 1 
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON ss.customer_id = sc.customer_id
  WHERE sc.user_id = p.id
  AND ss.status = 'active'
  AND (ss.current_period_end IS NULL OR ss.current_period_end > EXTRACT(EPOCH FROM NOW())::bigint)
);
