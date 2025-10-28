/*
  # Fix Premium Subscription Sync Issues

  1. Purpose
    - Diagnose and fix issues with Stripe subscriptions not being properly reflected in the system
    - Repair premium status for users with active Stripe subscriptions
    - Ensure proper webhook event handling for subscription changes

  2. Changes
    - Add diagnostic queries to find mismatches between Stripe and user data
    - Create direct sync function to manually update subscription status
    - Improve webhook event handling for Stripe subscription events
    - Fix premium status propagation throughout the system
*/

-- First, create a function to diagnose subscription issues
CREATE OR REPLACE FUNCTION diagnose_subscription_issues()
RETURNS TABLE (
  user_id uuid,
  customer_id text,
  subscription_id text,
  subscription_status text,
  profile_plan_type text,
  user_tickets_plan_type text
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    p.id as user_id,
    sc.customer_id,
    ss.subscription_id,
    ss.status::text as subscription_status,
    p.plan_type as profile_plan_type,
    ut.plan_type as user_tickets_plan_type
  FROM 
    profiles p
  JOIN 
    stripe_customers sc ON p.id = sc.user_id
  LEFT JOIN 
    stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  LEFT JOIN 
    user_tickets ut ON p.id = ut.user_id
  WHERE 
    (ss.status = 'active' AND (p.plan_type <> 'premium' OR ut.plan_type <> 'premium'))
    OR
    (ss.status <> 'active' AND (p.plan_type = 'premium' OR ut.plan_type = 'premium'))
    OR
    (ss.status IS NULL AND (p.plan_type = 'premium' OR ut.plan_type = 'premium'));
$$;

-- Create a function to manually sync a customer's subscription status
CREATE OR REPLACE FUNCTION sync_customer_subscription_status(customer_id_input text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  subscription_status text;
  user_id_found uuid;
  affected_rows int;
BEGIN
  -- Get the subscription status and user_id
  SELECT 
    ss.status::text, 
    sc.user_id 
  INTO 
    subscription_status, 
    user_id_found 
  FROM 
    stripe_subscriptions ss
  JOIN 
    stripe_customers sc ON ss.customer_id = sc.customer_id
  WHERE 
    sc.customer_id = customer_id_input
    AND sc.deleted_at IS NULL
    AND ss.deleted_at IS NULL;

  -- If there's no subscription record, check if the customer exists
  IF subscription_status IS NULL THEN
    -- Just get the user_id if the customer exists
    SELECT user_id INTO user_id_found
    FROM stripe_customers
    WHERE customer_id = customer_id_input
      AND deleted_at IS NULL;
      
    IF user_id_found IS NULL THEN
      -- Instead of raising exception, just log a warning and exit gracefully
      RAISE WARNING 'Customer not found: %', customer_id_input;
      RETURN;
    END IF;
    
    -- Default to 'not_started' if no subscription exists
    subscription_status := 'not_started';
  END IF;

  -- Update profiles and user_tickets based on subscription status
  IF subscription_status = 'active' THEN
    -- Update profile to premium
    UPDATE profiles
    SET 
      plan_type = 'premium',
      updated_at = now()
    WHERE 
      id = user_id_found;
      
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE 'Updated % profile records to premium', affected_rows;
    
    -- Update user_tickets to premium with 3000 tickets
    UPDATE user_tickets
    SET 
      plan_type = 'premium',
      tickets_remaining = GREATEST(tickets_remaining, 3000),
      updated_at = now()
    WHERE 
      user_id = user_id_found;
      
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE 'Updated % user_tickets records to premium with 3000 tickets', affected_rows;
  ELSE
    -- Update profile to free
    UPDATE profiles
    SET 
      plan_type = 'free',
      updated_at = now()
    WHERE 
      id = user_id_found
      AND plan_type = 'premium';
      
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE 'Updated % profile records to free', affected_rows;
    
    -- Update user_tickets to free with max 300 tickets
    UPDATE user_tickets
    SET 
      plan_type = 'free',
      tickets_remaining = LEAST(tickets_remaining, 300),
      updated_at = now()
    WHERE 
      user_id = user_id_found
      AND plan_type = 'premium';
      
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE 'Updated % user_tickets records to free', affected_rows;
  END IF;
END;
$$;

-- Improve the handle_subscription_activated function to handle race conditions and ensure consistent state
CREATE OR REPLACE FUNCTION handle_subscription_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_user_id uuid;
  affected_rows_count int;
BEGIN
  -- Find the user associated with this customer
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id 
    AND deleted_at IS NULL;
    
  IF affected_user_id IS NULL THEN
    RAISE WARNING 'No user found for customer: %', NEW.customer_id;
    RETURN NEW; -- Continue instead of failing
  END IF;
  
  -- First update the profile
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows_count = ROW_COUNT;
  RAISE NOTICE 'Updated % profile records for user %', affected_rows_count, affected_user_id;
  
  -- Then update user_tickets
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows_count = ROW_COUNT;
  RAISE NOTICE 'Updated % user_tickets records for user %', affected_rows_count, affected_user_id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log detailed error message
  RAISE WARNING 'Error in handle_subscription_activated: % (for customer: %)', SQLERRM, NEW.customer_id;
  RETURN NULL;
END;
$$;

-- Create comprehensive webhook handler function for Stripe events
CREATE OR REPLACE FUNCTION process_stripe_webhook_event(
  event_type text,
  customer_id text,
  subscription_id text,
  status text DEFAULT NULL,
  price_id text DEFAULT NULL,
  current_period_start bigint DEFAULT NULL,
  current_period_end bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id_found uuid;
  result jsonb;
BEGIN
  -- Find the user ID associated with this customer
  SELECT user_id INTO user_id_found
  FROM stripe_customers
  WHERE customer_id = process_stripe_webhook_event.customer_id
    AND deleted_at IS NULL;
    
  IF user_id_found IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customer not found: ' || customer_id
    );
  END IF;
  
  CASE
    -- Handle checkout.session.completed event
    WHEN event_type = 'checkout.session.completed' THEN
      -- Customer successfully completed checkout
      -- Ensure subscription entry exists
      INSERT INTO stripe_subscriptions (
        customer_id,
        subscription_id,
        price_id,
        status
      ) VALUES (
        customer_id,
        subscription_id,
        price_id,
        'active'
      )
      ON CONFLICT (customer_id) 
      DO UPDATE SET
        subscription_id = EXCLUDED.subscription_id,
        price_id = EXCLUDED.price_id,
        status = EXCLUDED.status,
        updated_at = now();
      
      -- Update user status to premium
      UPDATE profiles
      SET 
        plan_type = 'premium',
        updated_at = now()
      WHERE id = user_id_found;
      
      UPDATE user_tickets
      SET 
        plan_type = 'premium',
        tickets_remaining = GREATEST(tickets_remaining, 3000),
        updated_at = now()
      WHERE user_id = user_id_found;
      
      result := jsonb_build_object(
        'success', true,
        'action', 'subscription_activated',
        'user_id', user_id_found
      );
      
    -- Handle customer.subscription.created event
    WHEN event_type = 'customer.subscription.created' THEN
      -- New subscription created
      INSERT INTO stripe_subscriptions (
        customer_id,
        subscription_id,
        price_id,
        current_period_start,
        current_period_end,
        status
      ) VALUES (
        customer_id,
        subscription_id,
        price_id,
        current_period_start,
        current_period_end,
        status
      )
      ON CONFLICT (customer_id) 
      DO UPDATE SET
        subscription_id = EXCLUDED.subscription_id,
        price_id = EXCLUDED.price_id,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        status = EXCLUDED.status,
        updated_at = now();
        
      -- If status is active, update user to premium
      IF status = 'active' THEN
        UPDATE profiles
        SET 
          plan_type = 'premium',
          updated_at = now()
        WHERE id = user_id_found;
        
        UPDATE user_tickets
        SET 
          plan_type = 'premium',
          tickets_remaining = GREATEST(tickets_remaining, 3000),
          updated_at = now()
        WHERE user_id = user_id_found;
      END IF;
      
      result := jsonb_build_object(
        'success', true,
        'action', 'subscription_created',
        'user_id', user_id_found,
        'status', status
      );
      
    -- Handle customer.subscription.updated event  
    WHEN event_type = 'customer.subscription.updated' THEN
      -- Subscription details updated
      UPDATE stripe_subscriptions
      SET 
        subscription_id = process_stripe_webhook_event.subscription_id,
        price_id = process_stripe_webhook_event.price_id,
        current_period_start = process_stripe_webhook_event.current_period_start,
        current_period_end = process_stripe_webhook_event.current_period_end,
        status = process_stripe_webhook_event.status,
        updated_at = now()
      WHERE customer_id = process_stripe_webhook_event.customer_id;
      
      -- Update user premium status based on subscription status
      IF status = 'active' THEN
        -- Upgrade to premium
        UPDATE profiles
        SET 
          plan_type = 'premium',
          updated_at = now()
        WHERE id = user_id_found;
        
        UPDATE user_tickets
        SET 
          plan_type = 'premium',
          tickets_remaining = GREATEST(tickets_remaining, 3000),
          updated_at = now()
        WHERE user_id = user_id_found;
      ELSIF status IN ('canceled', 'unpaid', 'incomplete_expired') THEN
        -- Downgrade to free
        UPDATE profiles
        SET 
          plan_type = 'free',
          updated_at = now()
        WHERE id = user_id_found;
        
        UPDATE user_tickets
        SET 
          plan_type = 'free',
          tickets_remaining = LEAST(tickets_remaining, 300),
          updated_at = now()
        WHERE user_id = user_id_found;
      END IF;
      
      result := jsonb_build_object(
        'success', true,
        'action', 'subscription_updated',
        'user_id', user_id_found,
        'status', status
      );
      
    -- Handle invoice.payment_succeeded event
    WHEN event_type = 'invoice.payment_succeeded' THEN
      -- Successful payment received
      UPDATE stripe_subscriptions
      SET 
        status = 'active',
        updated_at = now()
      WHERE customer_id = process_stripe_webhook_event.customer_id
        AND deleted_at IS NULL;
        
      -- Update user to premium
      UPDATE profiles
      SET 
        plan_type = 'premium',
        updated_at = now()
      WHERE id = user_id_found;
      
      UPDATE user_tickets
      SET 
        plan_type = 'premium',
        tickets_remaining = GREATEST(tickets_remaining, 3000),
        updated_at = now()
      WHERE user_id = user_id_found;
      
      result := jsonb_build_object(
        'success', true,
        'action', 'payment_succeeded',
        'user_id', user_id_found
      );
      
    ELSE
      result := jsonb_build_object(
        'success', true,
        'action', 'event_ignored',
        'event_type', event_type
      );
  END CASE;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'event_type', event_type,
    'customer_id', customer_id
  );
END;
$$;

-- Fix active subscriptions in the system
DO $$
DECLARE
  subscription_record RECORD;
BEGIN
  FOR subscription_record IN 
    SELECT sc.user_id, ss.customer_id
    FROM stripe_subscriptions ss
    JOIN stripe_customers sc ON ss.customer_id = sc.customer_id
    WHERE ss.status = 'active' 
      AND ss.deleted_at IS NULL
      AND sc.deleted_at IS NULL
  LOOP
    -- For each active subscription, update the profile and user_tickets
    UPDATE profiles
    SET 
      plan_type = 'premium',
      updated_at = now()
    WHERE id = subscription_record.user_id;
    
    UPDATE user_tickets
    SET 
      plan_type = 'premium',
      tickets_remaining = GREATEST(tickets_remaining, 3000),
      updated_at = now()
    WHERE user_id = subscription_record.user_id;
    
    RAISE NOTICE 'Updated premium status for user_id % (customer_id: %)', 
      subscription_record.user_id, subscription_record.customer_id;
  END LOOP;
END;
$$;

-- Create indexes for better Stripe data querying performance
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status_customer 
ON stripe_subscriptions(status, customer_id);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id
ON stripe_customers(user_id);

-- Grant execute permissions on the functions
GRANT EXECUTE ON FUNCTION diagnose_subscription_issues TO authenticated;
GRANT EXECUTE ON FUNCTION sync_customer_subscription_status TO service_role;
GRANT EXECUTE ON FUNCTION process_stripe_webhook_event TO service_role;