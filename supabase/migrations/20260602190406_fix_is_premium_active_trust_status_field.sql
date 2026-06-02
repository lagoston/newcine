/*
  # Fix is_premium_active to trust Stripe status field

  ## Problem
  When a Stripe subscription renews automatically, the webhook occasionally fails to
  update current_period_end in stripe_subscriptions. The old function required BOTH:
    - status IN ('active', 'trialing')
    - current_period_end > now()
  
  If current_period_end gets stale, the user loses premium even though Stripe
  considers the subscription active.

  ## Fix
  - If status = 'active' or 'trialing': grant premium unconditionally (trust Stripe status)
  - If status = 'canceled': check current_period_end for grace period (paid through end)
  - This way a stale current_period_end never causes a false-negative for active subs

  ## Tables modified
  - None (function only)

  ## Functions modified
  - is_premium_active: new split logic active vs canceled
*/

CREATE OR REPLACE FUNCTION public.is_premium_active(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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

  now_epoch := EXTRACT(EPOCH FROM NOW())::bigint;

  -- SECOND: Active or trialing subscription → trust status, ignore stale period_end
  -- Stripe marks status='active' only while subscription is truly active.
  -- current_period_end can lag behind if webhook failed to update it on renewal.
  SELECT ss.* INTO subscription_record
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE sc.user_id = user_id_input
    AND ss.status IN ('active', 'trialing')
  ORDER BY ss.current_period_end DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN true;
  END IF;

  -- THIRD: Canceled subscription → honor grace period until period_end
  -- User paid through period end; keep premium until then.
  SELECT ss.* INTO subscription_record
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE sc.user_id = user_id_input
    AND ss.status = 'canceled'
    AND ss.current_period_end IS NOT NULL
    AND ss.current_period_end > now_epoch
  ORDER BY ss.current_period_end DESC
  LIMIT 1;

  RETURN FOUND;
END;
$$;
