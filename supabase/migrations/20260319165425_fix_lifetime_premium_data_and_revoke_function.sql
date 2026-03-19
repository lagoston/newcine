/*
  # Fix Lifetime Premium Data and revoke_lifetime_premium Function

  ## Problem
  1. User "pache" has lifetime_premium = true but plan_type = 'free'
     - The previous migration's DO block only processed users with lifetime_premium = false,
       so pache was skipped and never got plan_type = 'premium' applied
  
  2. User "Tonico" has lifetime_premium = false but plan_type = 'premium'
     - The revoke_lifetime_premium function had a broken query referencing
       stripe_subscriptions.user_id which does not exist (correct column is via stripe_customers join)
     - This caused the plan_type to remain 'premium' after lifetime revocation
  
  ## Changes
  1. Fix revoke_lifetime_premium to use correct customer_id JOIN
  2. Fix grant_lifetime_premium to explicitly ensure plan_type = 'premium'
  3. Correct data for pache (lifetime user should be 'premium')
  4. Correct data for Tonico (no active subscription, should be 'free')
  5. Run sync for ALL lifetime users to ensure consistency
*/

-- Fix revoke_lifetime_premium with correct stripe join
CREATE OR REPLACE FUNCTION revoke_lifetime_premium(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_active_subscription boolean;
  new_plan_type text;
  now_epoch bigint;
BEGIN
  now_epoch := EXTRACT(EPOCH FROM NOW())::bigint;

  -- Check if user has an active Stripe subscription (correct join via stripe_customers)
  SELECT EXISTS (
    SELECT 1
    FROM stripe_customers sc
    JOIN stripe_subscriptions ss ON ss.customer_id = sc.customer_id
    WHERE sc.user_id = p_user_id
      AND ss.status IN ('active', 'trialing')
      AND ss.current_period_end IS NOT NULL
      AND ss.current_period_end > now_epoch
  ) INTO has_active_subscription;

  IF has_active_subscription THEN
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

-- Fix grant_lifetime_premium to explicitly set plan_type = 'premium'
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION revoke_lifetime_premium TO service_role;
GRANT EXECUTE ON FUNCTION grant_lifetime_premium TO service_role;

-- DATA FIX: Sync all users with lifetime_premium = true to ensure plan_type = 'premium'
UPDATE profiles
SET plan_type = 'premium', updated_at = NOW()
WHERE lifetime_premium = true AND plan_type != 'premium';

-- DATA FIX: Sync all non-lifetime users whose plan_type is 'premium'
-- but have no active Stripe subscription (set them to 'free')
DO $$
DECLARE
  user_rec RECORD;
  now_ts bigint;
BEGIN
  now_ts := EXTRACT(EPOCH FROM NOW())::bigint;

  FOR user_rec IN
    SELECT p.id, p.username
    FROM profiles p
    WHERE p.lifetime_premium = false
      AND p.plan_type = 'premium'
      AND NOT EXISTS (
        SELECT 1
        FROM stripe_customers sc
        JOIN stripe_subscriptions ss ON ss.customer_id = sc.customer_id
        WHERE sc.user_id = p.id
          AND ss.status IN ('active', 'trialing')
          AND ss.current_period_end IS NOT NULL
          AND ss.current_period_end > now_ts
      )
  LOOP
    UPDATE profiles
    SET plan_type = 'free', updated_at = NOW()
    WHERE id = user_rec.id;
  END LOOP;
END $$;
