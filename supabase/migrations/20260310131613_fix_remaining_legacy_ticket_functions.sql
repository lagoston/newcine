/*
  # Fix Remaining Legacy Ticket Functions

  ## Problems Found
  More functions still using old 300/3000 ticket values:
  1. `get_user_tickets` - uses 300/3000 and calculate_next_reset()
  2. `handle_subscription_canceled` - uses LEAST(tickets_remaining, 300)
  3. `handle_subscription_renewed` - uses GREATEST(tickets_remaining, 3000)
  4. `handle_subscription_updated` - uses 300/3000
  5. `update_user_plan` - uses 300/3000

  ## Fixes
  All updated to use daily system (3/20 tickets, get_next_daily_reset())
*/

-- 1. Fix get_user_tickets
CREATE OR REPLACE FUNCTION public.get_user_tickets(uid uuid)
RETURNS jsonb
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
  is_premium := is_premium_active(uid);

  SELECT * INTO user_tickets_record
  FROM user_tickets
  WHERE user_id = uid;

  IF now() >= user_tickets_record.next_reset THEN
    UPDATE user_tickets
    SET 
      tickets_remaining = CASE WHEN is_premium THEN 20 ELSE 3 END,
      plan_type = CASE WHEN is_premium THEN 'premium' ELSE 'free' END,
      last_reset_at = now(),
      next_reset = next_midnight,
      updated_at = now()
    WHERE user_id = uid
    RETURNING * INTO user_tickets_record;
  END IF;

  RETURN jsonb_build_object(
    'ticketsRemaining', user_tickets_record.tickets_remaining,
    'nextResetMs', extract(epoch from user_tickets_record.next_reset) * 1000,
    'planType', user_tickets_record.plan_type
  );
END;
$$;

-- 2. Fix handle_subscription_canceled (trigger)
CREATE OR REPLACE FUNCTION public.handle_subscription_canceled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user_id uuid;
  affected_rows_count int;
  next_midnight timestamptz;
BEGIN
  next_midnight := get_next_daily_reset();

  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id 
    AND deleted_at IS NULL;
    
  IF affected_user_id IS NULL THEN
    RAISE LOG 'No user found for customer: % (subscription: %)', 
      NEW.customer_id, NEW.subscription_id;
    RETURN NEW;
  END IF;
  
  UPDATE profiles
  SET 
    plan_type = 'free',
    updated_at = now()
  WHERE id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows_count = ROW_COUNT;
  RAISE LOG 'Updated % profile records to free for user: %', affected_rows_count, affected_user_id;
  
  UPDATE user_tickets
  SET 
    plan_type = 'free',
    tickets_remaining = LEAST(tickets_remaining, 3),
    next_reset = next_midnight,
    updated_at = now()
  WHERE user_id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows_count = ROW_COUNT;
  RAISE LOG 'Updated % ticket records to free for user: %', affected_rows_count, affected_user_id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_canceled: % (customer: %)', SQLERRM, NEW.customer_id;
  RETURN NEW;
END;
$$;

-- 3. Fix handle_subscription_renewed (trigger)
CREATE OR REPLACE FUNCTION public.handle_subscription_renewed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user_id uuid;
  next_midnight timestamptz;
BEGIN
  next_midnight := get_next_daily_reset();

  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id 
    AND deleted_at IS NULL;
    
  IF affected_user_id IS NULL THEN
    RAISE LOG 'No user found for customer: % (subscription: %)', 
      NEW.customer_id, NEW.subscription_id;
    RETURN NEW;
  END IF;
  
  UPDATE user_tickets
  SET 
    tickets_remaining = 20,
    next_reset = next_midnight,
    last_reset_at = NOW(),
    updated_at = now()
  WHERE user_id = affected_user_id 
    AND plan_type = 'premium';
  
  RAISE LOG 'Renewed premium benefits for user: %', affected_user_id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_renewed: % (customer: %)', SQLERRM, NEW.customer_id;
  RETURN NEW;
END;
$$;

-- 4. Fix handle_subscription_updated (trigger)
CREATE OR REPLACE FUNCTION public.handle_subscription_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user_id uuid;
  affected_rows int;
  next_midnight timestamptz;
BEGIN
  next_midnight := get_next_daily_reset();

  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id 
    AND deleted_at IS NULL;
    
  IF affected_user_id IS NULL THEN
    RAISE LOG 'No user found for customer: % (subscription: %)', NEW.customer_id, NEW.subscription_id;
    RETURN NEW;
  END IF;
  
  RAISE LOG 'Subscription updated for user: % (customer: %, subscription: %, status: %)',
    affected_user_id, NEW.customer_id, NEW.subscription_id, NEW.status;
    
  IF NEW.status = 'active' THEN
    UPDATE profiles
    SET 
      plan_type = 'premium',
      updated_at = now()
    WHERE id = affected_user_id;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE LOG 'Updated % profile records to premium for user: %', affected_rows, affected_user_id;
    
    UPDATE user_tickets
    SET 
      plan_type = 'premium',
      tickets_remaining = 20,
      next_reset = next_midnight,
      last_reset_at = NOW(),
      updated_at = now()
    WHERE user_id = affected_user_id;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE LOG 'Updated % user_tickets records to premium for user: %', affected_rows, affected_user_id;
    
  ELSIF NEW.status IN ('canceled', 'incomplete_expired', 'unpaid') THEN
    UPDATE profiles
    SET 
      plan_type = 'free',
      updated_at = now()
    WHERE id = affected_user_id;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE LOG 'Updated % profile records to free for user: %', affected_rows, affected_user_id;
    
    UPDATE user_tickets
    SET 
      plan_type = 'free',
      tickets_remaining = LEAST(tickets_remaining, 3),
      next_reset = next_midnight,
      updated_at = now()
    WHERE user_id = affected_user_id;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE LOG 'Updated % user_tickets records to free for user: %', affected_rows, affected_user_id;
  ELSE
    RAISE LOG 'No status change needed for status: % (user: %)', NEW.status, affected_user_id;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_updated: % (customer: %)', SQLERRM, NEW.customer_id;
  RETURN NEW;
END;
$$;

-- 5. Fix update_user_plan
CREATE OR REPLACE FUNCTION public.update_user_plan(user_id_param uuid, new_plan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_ticket_count integer;
  next_midnight timestamptz;
BEGIN
  next_midnight := get_next_daily_reset();

  IF new_plan = 'premium' THEN
    new_ticket_count := 20;
  ELSE
    new_ticket_count := 3;
  END IF;

  UPDATE user_tickets
  SET 
    plan_type = new_plan,
    tickets_remaining = new_ticket_count,
    next_reset = next_midnight,
    last_reset_at = NOW(),
    updated_at = NOW()
  WHERE user_id = user_id_param;

  UPDATE profiles
  SET 
    plan_type = new_plan,
    updated_at = NOW()
  WHERE id = user_id_param;
END;
$$;
