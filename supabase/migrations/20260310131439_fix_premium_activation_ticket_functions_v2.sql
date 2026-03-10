/*
  # Fix Premium Activation Ticket Functions (v2)

  ## Problems Identified
  1. `activate_premium_for_stripe_customer` uses old 3000 tickets instead of 20
  2. `sync_customer_subscription_status` calls `sync_premium_status()` without user_id parameter

  ## Fixes
  1. Update `activate_premium_for_stripe_customer` to give 20 tickets (daily system)
  2. Fix `sync_customer_subscription_status` to pass user_id to `sync_premium_status`

  ## Impact
  - Premium users will now correctly receive 20 tickets upon activation
  - Subscription status sync will properly update user tickets
*/

-- Fix activate_premium_for_stripe_customer to use 20 tickets (daily system)
CREATE OR REPLACE FUNCTION public.activate_premium_for_stripe_customer(customer_id_param text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id_var uuid;
  profile_rows_affected int;
  ticket_rows_affected int;
  next_midnight timestamptz;
BEGIN
  next_midnight := get_next_daily_reset();

  SELECT user_id INTO user_id_var
  FROM stripe_customers
  WHERE customer_id = customer_id_param
    AND deleted_at IS NULL;
    
  IF user_id_var IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customer not found: ' || customer_id_param
    );
  END IF;
  
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = user_id_var;
  
  GET DIAGNOSTICS profile_rows_affected = ROW_COUNT;
  
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = 20,
    next_reset = next_midnight,
    last_reset_at = NOW(),
    updated_at = now()
  WHERE user_id = user_id_var;
  
  GET DIAGNOSTICS ticket_rows_affected = ROW_COUNT;

  IF ticket_rows_affected = 0 THEN
    INSERT INTO user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
    VALUES (user_id_var, 20, 'premium', NOW(), next_midnight);
  END IF;
  
  UPDATE stripe_subscriptions
  SET 
    status = 'active',
    updated_at = now()
  WHERE customer_id = customer_id_param
    AND (status IS NULL OR status <> 'active');
    
  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_id_var,
    'profiles_affected', profile_rows_affected,
    'tickets_affected', ticket_rows_affected,
    'tickets_granted', 20,
    'next_reset', next_midnight
  );
END;
$$;

-- Drop and recreate sync_customer_subscription_status with proper return type
DROP FUNCTION IF EXISTS public.sync_customer_subscription_status(text);

CREATE FUNCTION public.sync_customer_subscription_status(customer_id_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  result json;
BEGIN
  SELECT sc.user_id INTO v_user_id
  FROM stripe_customers sc
  WHERE sc.customer_id = customer_id_input;

  IF v_user_id IS NOT NULL THEN
    result := sync_premium_status(v_user_id);
    RETURN result;
  ELSE
    RETURN json_build_object(
      'success', false,
      'error', 'No user found for customer_id: ' || customer_id_input
    );
  END IF;
END;
$$;
