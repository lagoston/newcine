/*
  # Fix All Legacy Ticket Functions to Daily System

  ## Problems Found
  Multiple functions still use the old monthly system with 300/3000 tickets:
  1. `activate_premium_for_user` - uses 3000 tickets
  2. `create_user_tickets_safely` - uses 300 tickets, 30 days
  3. `init_user_tickets` - uses 300 tickets, 30 days
  4. `initialize_user_tickets` - uses 300 tickets, 30 days
  5. `reset_weekly_tickets` - uses 300/3000 tickets (obsolete)
  6. `spend_tickets` - uses 300/3000 tickets
  7. `activate_premium_for_customer` - needs to use sync_premium_status properly

  ## Fixes
  All functions updated to use:
  - Free: 3 tickets per day
  - Premium: 20 tickets per day
  - Reset at midnight Brasilia (get_next_daily_reset())

  ## Note
  Some of these functions may be obsolete but are fixed for safety.
  The authoritative functions are: check_and_reset_tickets, sync_premium_status, handle_new_user
*/

-- 1. Fix activate_premium_for_user
CREATE OR REPLACE FUNCTION public.activate_premium_for_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  affected_profile_rows int;
  affected_tickets_rows int;
  next_midnight timestamptz;
BEGIN
  next_midnight := get_next_daily_reset();

  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = target_user_id;
  
  GET DIAGNOSTICS affected_profile_rows = ROW_COUNT;
  
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = 20,
    next_reset = next_midnight,
    last_reset_at = NOW(),
    updated_at = now()
  WHERE user_id = target_user_id;
  
  GET DIAGNOSTICS affected_tickets_rows = ROW_COUNT;

  IF affected_tickets_rows = 0 THEN
    INSERT INTO user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
    VALUES (target_user_id, 20, 'premium', NOW(), next_midnight);
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'profiles_updated', affected_profile_rows,
    'tickets_updated', affected_tickets_rows,
    'tickets_granted', 20
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'user_id', target_user_id
  );
END;
$$;

-- 2. Fix create_user_tickets_safely
CREATE OR REPLACE FUNCTION public.create_user_tickets_safely(user_id_input uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_tickets (
    user_id,
    plan_type,
    tickets_remaining,
    last_reset_at,
    next_reset
  )
  VALUES (
    user_id_input,
    'free',
    3,
    now(),
    get_next_daily_reset()
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- 3. Fix init_user_tickets (trigger function)
CREATE OR REPLACE FUNCTION public.init_user_tickets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_tickets (
      user_id,
      plan_type,
      tickets_remaining,
      last_reset_at,
      next_reset,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'free',
      3,
      NOW(),
      get_next_daily_reset(),
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Error in init_user_tickets for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 4. Fix initialize_user_tickets (trigger function)
CREATE OR REPLACE FUNCTION public.initialize_user_tickets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_tickets (
      user_id,
      plan_type,
      tickets_remaining,
      last_reset_at,
      next_reset,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'free',
      3,
      NOW(),
      get_next_daily_reset(),
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Error in initialize_user_tickets for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 5. Fix reset_weekly_tickets (now reset_daily_tickets)
CREATE OR REPLACE FUNCTION public.reset_weekly_tickets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_tickets
  SET 
    tickets_remaining = CASE WHEN plan_type = 'premium' THEN 20 ELSE 3 END,
    last_reset_at = now(),
    next_reset = get_next_daily_reset(),
    updated_at = now()
  WHERE now() >= next_reset;
END;
$$;

-- 6. Fix spend_tickets
CREATE OR REPLACE FUNCTION public.spend_tickets(user_id_input uuid, amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tickets_record record;
  is_premium boolean;
  next_midnight timestamptz;
BEGIN
  next_midnight := get_next_daily_reset();
  is_premium := is_premium_active(user_id_input);

  SELECT * INTO user_tickets_record
  FROM user_tickets
  WHERE user_id = user_id_input
  FOR UPDATE;

  IF now() >= user_tickets_record.next_reset THEN
    UPDATE user_tickets
    SET 
      tickets_remaining = CASE WHEN is_premium THEN 20 ELSE 3 END,
      plan_type = CASE WHEN is_premium THEN 'premium' ELSE 'free' END,
      last_reset_at = now(),
      next_reset = next_midnight,
      updated_at = now()
    WHERE user_id = user_id_input
    RETURNING * INTO user_tickets_record;
  END IF;

  IF user_tickets_record.tickets_remaining < amount THEN
    RETURN false;
  END IF;

  UPDATE user_tickets
  SET 
    tickets_remaining = tickets_remaining - amount,
    updated_at = now()
  WHERE user_id = user_id_input;

  RETURN true;
END;
$$;

-- 7. Fix both versions of activate_premium_for_customer
DROP FUNCTION IF EXISTS public.activate_premium_for_customer(text);
DROP FUNCTION IF EXISTS public.activate_premium_for_customer(text, text, bigint);

CREATE FUNCTION public.activate_premium_for_customer(customer_id_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id_var uuid;
  result json;
BEGIN
  SELECT user_id INTO user_id_var
  FROM stripe_customers
  WHERE customer_id = customer_id_input;

  IF user_id_var IS NULL THEN
    RAISE EXCEPTION 'No user found for customer_id: %', customer_id_input;
  END IF;

  INSERT INTO stripe_subscriptions (
    customer_id,
    subscription_id,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    customer_id_input,
    'direct_' || gen_random_uuid()::text,
    'active',
    EXTRACT(EPOCH FROM NOW())::bigint,
    EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint,
    NOW(),
    NOW()
  )
  ON CONFLICT (customer_id) 
  DO UPDATE SET
    status = 'active',
    current_period_end = EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint,
    updated_at = NOW();

  result := sync_premium_status(user_id_var);
  RETURN result;
END;
$$;

CREATE FUNCTION public.activate_premium_for_customer(
  customer_id_input text, 
  subscription_id_input text, 
  period_end_input bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id_var uuid;
  calculated_period_end bigint;
  result json;
BEGIN
  SELECT user_id INTO user_id_var
  FROM stripe_customers
  WHERE customer_id = customer_id_input;

  IF user_id_var IS NULL THEN
    RAISE EXCEPTION 'No user found for customer_id: %', customer_id_input;
  END IF;

  IF period_end_input IS NOT NULL THEN
    calculated_period_end := period_end_input;
  ELSE
    calculated_period_end := EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint;
  END IF;

  IF subscription_id_input IS NOT NULL THEN
    INSERT INTO stripe_subscriptions (
      customer_id,
      subscription_id,
      status,
      current_period_start,
      current_period_end,
      created_at,
      updated_at
    ) VALUES (
      customer_id_input,
      subscription_id_input,
      'active',
      EXTRACT(EPOCH FROM NOW())::bigint,
      calculated_period_end,
      NOW(),
      NOW()
    )
    ON CONFLICT (customer_id) 
    DO UPDATE SET
      subscription_id = subscription_id_input,
      status = 'active',
      current_period_end = calculated_period_end,
      updated_at = NOW();
  END IF;

  result := sync_premium_status(user_id_var);
  RETURN result;
END;
$$;
