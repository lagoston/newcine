/*
  # Fix is_premium_active epoch comparison
  
  Corrige a comparacao de current_period_end que e bigint (epoch) nao timestamp
*/

DROP FUNCTION IF EXISTS is_premium_active(uuid);

CREATE OR REPLACE FUNCTION is_premium_active(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
  has_subscription boolean;
  now_epoch bigint;
BEGIN
  -- First check for lifetime premium (highest priority - immediate return)
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = user_id_input;
  
  IF has_lifetime = true THEN
    RETURN true;
  END IF;
  
  -- Get current epoch time for comparison
  now_epoch := EXTRACT(EPOCH FROM NOW())::bigint;
  
  -- Check for active Stripe subscription
  -- current_period_end is stored as bigint (epoch seconds)
  SELECT EXISTS (
    SELECT 1
    FROM stripe_customers sc
    JOIN stripe_subscriptions ss ON ss.customer_id = sc.customer_id
    WHERE sc.user_id = user_id_input
    AND ss.status = 'active'
    AND (ss.current_period_end IS NULL OR ss.current_period_end > now_epoch)
  ) INTO has_subscription;

  RETURN COALESCE(has_subscription, false);
END;
$$;

GRANT EXECUTE ON FUNCTION is_premium_active TO authenticated;
