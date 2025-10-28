/*
  # Fix Premium Subscription System

  1. Changes
    - Create comprehensive subscription sync system
    - Add all necessary triggers and functions for premium status propagation
    - Add RPC function for manual premium activation
    - Fix data design issues causing payments to fail activating premium status

  2. Security
    - All functions use SECURITY DEFINER for proper permissions
    - Maintain RLS policies for subscription tables
    - Implement proper error handling and logging
*/

-- Create or replace functions for subscription status handling

-- Function to activate premium for a user
CREATE OR REPLACE FUNCTION activate_premium_for_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  affected_profile_rows int;
  affected_tickets_rows int;
BEGIN
  -- Update profile to premium
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = target_user_id;
  
  GET DIAGNOSTICS affected_profile_rows = ROW_COUNT;
  
  -- Update user tickets to premium with 3000 tickets
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = target_user_id;
  
  GET DIAGNOSTICS affected_tickets_rows = ROW_COUNT;
  
  -- Return results
  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'profiles_updated', affected_profile_rows,
    'tickets_updated', affected_tickets_rows
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'user_id', target_user_id
  );
END;
$$;

-- Function to handle subscription activation
CREATE OR REPLACE FUNCTION handle_subscription_activated()
RETURNS trigger AS $$
DECLARE
  affected_user_id uuid;
  activation_result jsonb;
BEGIN
  -- Find the user associated with this customer
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id 
    AND deleted_at IS NULL;
    
  IF affected_user_id IS NULL THEN
    RAISE LOG 'No user found for customer: % (subscription: %)', 
      NEW.customer_id, NEW.subscription_id;
    RETURN NEW;
  END IF;
  
  -- Use the activate_premium_for_user function
  SELECT * INTO activation_result
  FROM activate_premium_for_user(affected_user_id);
  
  IF (activation_result->>'success')::boolean THEN
    RAISE LOG 'Premium activated successfully for user: % via subscription update', affected_user_id;
  ELSE
    RAISE LOG 'Failed to activate premium for user: % - %', affected_user_id, activation_result->>'error';
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_activated: % (customer: %)', SQLERRM, NEW.customer_id;
  RETURN NEW; -- Return NEW even on error to not block the trigger chain
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle subscription cancellation
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger AS $$
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
    RAISE LOG 'No user found for customer: % (subscription: %)', 
      NEW.customer_id, NEW.subscription_id;
    RETURN NEW;
  END IF;
  
  -- Update profile to free
  UPDATE profiles
  SET 
    plan_type = 'free',
    updated_at = now()
  WHERE id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows_count = ROW_COUNT;
  RAISE LOG 'Updated % profile records to free for user: %', affected_rows_count, affected_user_id;
  
  -- Update user_tickets to free
  UPDATE user_tickets
  SET 
    plan_type = 'free',
    tickets_remaining = LEAST(tickets_remaining, 300),
    updated_at = now()
  WHERE user_id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows_count = ROW_COUNT;
  RAISE LOG 'Updated % ticket records to free for user: %', affected_rows_count, affected_user_id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_canceled: % (customer: %)', SQLERRM, NEW.customer_id;
  RETURN NEW; -- Return NEW even on error to not block the trigger chain
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle subscription renewals
CREATE OR REPLACE FUNCTION handle_subscription_renewed()
RETURNS trigger AS $$
DECLARE
  affected_user_id uuid;
BEGIN
  -- Find the user associated with this customer
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id 
    AND deleted_at IS NULL;
    
  IF affected_user_id IS NULL THEN
    RAISE LOG 'No user found for customer: % (subscription: %)', 
      NEW.customer_id, NEW.subscription_id;
    RETURN NEW;
  END IF;
  
  -- Update tickets to ensure proper premium allowance
  UPDATE user_tickets
  SET 
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = affected_user_id 
    AND plan_type = 'premium';
  
  RAISE LOG 'Renewed premium benefits for user: %', affected_user_id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_renewed: % (customer: %)', SQLERRM, NEW.customer_id;
  RETURN NEW; -- Return NEW even on error to not block the trigger chain
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync customer subscription status
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
    -- Use the activate_premium_for_user function
    PERFORM activate_premium_for_user(user_id_found);
    RAISE LOG 'Successfully activated premium for user %', user_id_found;
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
    IF affected_rows > 0 THEN
      RAISE LOG 'Updated profile to free for user %', user_id_found;
    END IF;
    
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
    IF affected_rows > 0 THEN
      RAISE LOG 'Updated tickets to free for user %', user_id_found;
    END IF;
  END IF;
END;
$$;

-- Function to process webhook events
CREATE OR REPLACE FUNCTION process_stripe_webhook_event(
  event_type text,
  customer_id text,
  subscription_id text = NULL,
  status text = NULL,
  price_id text = NULL,
  current_period_start bigint = NULL,
  current_period_end bigint = NULL
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
        status,
        current_period_start,
        current_period_end
      ) VALUES (
        customer_id,
        subscription_id,
        price_id,
        COALESCE(status, 'active'),
        current_period_start,
        current_period_end
      )
      ON CONFLICT (customer_id) 
      DO UPDATE SET
        subscription_id = EXCLUDED.subscription_id,
        price_id = EXCLUDED.price_id,
        status = COALESCE(EXCLUDED.status, 'active'),
        current_period_start = NULLIF(EXCLUDED.current_period_start, 0),
        current_period_end = NULLIF(EXCLUDED.current_period_end, 0),
        updated_at = now();
      
      -- Directly activate premium to ensure immediate effect
      PERFORM activate_premium_for_user(user_id_found);
      
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
        PERFORM activate_premium_for_user(user_id_found);
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
        price_id = NULLIF(process_stripe_webhook_event.price_id, ''),
        current_period_start = NULLIF(process_stripe_webhook_event.current_period_start, 0),
        current_period_end = NULLIF(process_stripe_webhook_event.current_period_end, 0),
        status = process_stripe_webhook_event.status,
        updated_at = now()
      WHERE customer_id = process_stripe_webhook_event.customer_id;
      
      -- Update user premium status based on subscription status
      IF status = 'active' THEN
        -- Upgrade to premium
        PERFORM activate_premium_for_user(user_id_found);
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
        
      -- Ensure user has premium status
      PERFORM activate_premium_for_user(user_id_found);
      
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

-- Create new triggers or replace existing ones
DROP TRIGGER IF EXISTS on_subscription_activated ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_canceled ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_renewed ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_updated ON stripe_subscriptions;

-- Trigger for subscription activation
CREATE TRIGGER on_subscription_activated
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND OLD.status != 'active')
  EXECUTE FUNCTION handle_subscription_activated();

-- Trigger for subscription cancellation
CREATE TRIGGER on_subscription_canceled
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN ((NEW.status = 'canceled' AND OLD.status != 'canceled') OR
        (NEW.status = 'incomplete_expired' AND OLD.status != 'incomplete_expired'))
  EXECUTE FUNCTION handle_subscription_canceled();

-- Trigger for subscription renewal
CREATE TRIGGER on_subscription_renewed
  AFTER UPDATE OF current_period_start ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION handle_subscription_renewed();

-- Trigger for general subscription updates
CREATE TRIGGER on_subscription_updated
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION handle_subscription_updated();

-- Fix any existing premium accounts
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
    -- For each active subscription, ensure premium status is correct
    PERFORM activate_premium_for_user(subscription_record.user_id);
    RAISE NOTICE 'Fixed premium status for user_id % (customer_id: %)', 
      subscription_record.user_id, subscription_record.customer_id;
  END LOOP;
END $$;

-- Create or update indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status_customer
ON stripe_subscriptions(status, customer_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id
ON stripe_customers(user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_plan_type 
ON profiles(plan_type);

CREATE INDEX IF NOT EXISTS idx_user_tickets_plan_type 
ON user_tickets(plan_type);