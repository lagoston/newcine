-- Drop existing functions that need to be modified
DROP FUNCTION IF EXISTS activate_premium_for_customer(text);
DROP FUNCTION IF EXISTS sync_customer_subscription_status(text);
DROP FUNCTION IF EXISTS process_stripe_webhook_event(text, text, text, text, text, bigint, bigint);

-- Create function to activate premium for a specific customer ID
CREATE OR REPLACE FUNCTION activate_premium_for_customer(
  customer_id_input text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id_found uuid;
  profile_rows_affected int;
  tickets_rows_affected int;
  result jsonb;
BEGIN
  RAISE LOG 'activate_premium_for_customer called for customer: %', customer_id_input;

  -- Find the user ID associated with this customer
  SELECT user_id INTO user_id_found
  FROM stripe_customers
  WHERE customer_id = customer_id_input
    AND deleted_at IS NULL;
    
  IF user_id_found IS NULL THEN
    RAISE LOG 'Customer not found in database: %', customer_id_input;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customer not found: ' || customer_id_input
    );
  END IF;

  RAISE LOG 'Found user_id: % for customer: %', user_id_found, customer_id_input;
  
  -- Update profile to premium
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = user_id_found;
  
  GET DIAGNOSTICS profile_rows_affected = ROW_COUNT;
  RAISE LOG 'Updated % profile rows to premium for user: %', profile_rows_affected, user_id_found;
  
  -- Update user_tickets to premium with 3000 tickets
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = user_id_found;
  
  GET DIAGNOSTICS tickets_rows_affected = ROW_COUNT;
  RAISE LOG 'Updated % user_tickets rows to premium for user: %', tickets_rows_affected, user_id_found;
  
  -- Ensure subscription record exists and is marked as active
  INSERT INTO stripe_subscriptions (
    customer_id,
    status,
    price_id
  ) VALUES (
    customer_id_input,
    'active',
    'price_1RKUv4ElYXeJYKCBpd7qimYp' -- Default to yearly price
  )
  ON CONFLICT (customer_id) 
  DO UPDATE SET
    status = 'active',
    updated_at = now();
  
  RAISE LOG 'Ensured active subscription record for customer: %', customer_id_input;
  
  -- Return success result
  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_id_found,
    'profile_updated', profile_rows_affected > 0,
    'tickets_updated', tickets_rows_affected > 0,
    'customer_id', customer_id_input
  );
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in activate_premium_for_customer: % (customer: %)', SQLERRM, customer_id_input;
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'customer_id', customer_id_input
  );
END;
$$;

-- Create function to sync customer subscription status
CREATE OR REPLACE FUNCTION sync_customer_subscription_status(customer_id_input text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  subscription_status text;
  user_id_found uuid;
  result jsonb;
BEGIN
  RAISE LOG 'sync_customer_subscription_status called for customer: %', customer_id_input;

  -- Get the subscription status
  SELECT status::text INTO subscription_status
  FROM stripe_subscriptions
  WHERE customer_id = customer_id_input
    AND deleted_at IS NULL;

  -- If subscription is active, use the dedicated function
  IF subscription_status = 'active' THEN
    RAISE LOG 'Customer % has active subscription, activating premium', customer_id_input;
    RETURN activate_premium_for_customer(customer_id_input);
  ELSE
    -- Find the user associated with this customer
    SELECT user_id INTO user_id_found
    FROM stripe_customers
    WHERE customer_id = customer_id_input
      AND deleted_at IS NULL;
      
    IF user_id_found IS NULL THEN
      RAISE LOG 'Customer not found in database: %', customer_id_input;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Customer not found: ' || customer_id_input
      );
    END IF;
    
    RAISE LOG 'Customer % has inactive subscription (% status), downgrading to free', 
      customer_id_input, subscription_status;
    
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
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'downgraded_to_free',
      'user_id', user_id_found
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in sync_customer_subscription_status: % (customer: %)', SQLERRM, customer_id_input;
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'customer_id', customer_id_input
  );
END;
$$;

-- Create function to process webhook events
CREATE OR REPLACE FUNCTION process_stripe_webhook_event(
  event_type text,
  customer_id text,
  subscription_id text DEFAULT NULL,
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
  affected_rows int;
BEGIN
  RAISE LOG 'process_stripe_webhook_event called - Event: %, Customer: %, Subscription: %',
    event_type, customer_id, subscription_id;
    
  -- Find the user ID associated with this customer
  SELECT user_id INTO user_id_found
  FROM stripe_customers
  WHERE customer_id = process_stripe_webhook_event.customer_id
    AND deleted_at IS NULL;
    
  IF user_id_found IS NULL THEN
    RAISE LOG 'Customer not found in database: %', customer_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customer not found: ' || customer_id
    );
  END IF;
  
  RAISE LOG 'Processing webhook event % for user % (customer %)', 
    event_type, user_id_found, customer_id;
  
  CASE
    -- Handle checkout.session.completed event
    WHEN event_type = 'checkout.session.completed' THEN
      -- For checkout.session.completed, directly activate premium
      -- This is the most reliable approach
      RAISE LOG 'Activating premium via checkout.session.completed for customer: %', customer_id;
      
      -- If we have subscription details, update the subscription record first
      IF subscription_id IS NOT NULL THEN
        RAISE LOG 'Updating subscription record with ID: % for customer: %', 
          subscription_id, customer_id;
          
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
          COALESCE(status, 'active')
        )
        ON CONFLICT (customer_id) 
        DO UPDATE SET
          subscription_id = EXCLUDED.subscription_id,
          price_id = EXCLUDED.price_id,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          status = COALESCE(EXCLUDED.status, 'active'),
          updated_at = now();
      END IF;
      
      -- Now activate premium
      RETURN activate_premium_for_customer(customer_id);
      
    -- Handle customer.subscription.created event
    WHEN event_type = 'customer.subscription.created' THEN
      -- New subscription created
      RAISE LOG 'Creating new subscription record - ID: %, Customer: %', 
        subscription_id, customer_id;
        
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
        -- Use the dedicated function for reliability
        RAISE LOG 'New subscription is active, activating premium for customer: %', customer_id;
        RETURN activate_premium_for_customer(customer_id);
      ELSE
        RAISE LOG 'New subscription is not active (status: %), not activating premium', status;
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
      RAISE LOG 'Updating subscription - ID: %, Customer: %, Status: %', 
        subscription_id, customer_id, status;
        
      UPDATE stripe_subscriptions
      SET 
        subscription_id = process_stripe_webhook_event.subscription_id,
        price_id = process_stripe_webhook_event.price_id,
        current_period_start = process_stripe_webhook_event.current_period_start,
        current_period_end = process_stripe_webhook_event.current_period_end,
        status = process_stripe_webhook_event.status,
        updated_at = now()
      WHERE customer_id = process_stripe_webhook_event.customer_id;
      
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE LOG 'Updated % subscription rows for customer: %', affected_rows, customer_id;
      
      -- Update user premium status based on subscription status
      IF status = 'active' THEN
        -- Upgrade to premium using the dedicated function
        RAISE LOG 'Subscription status is active, activating premium for customer: %', customer_id;
        RETURN activate_premium_for_customer(customer_id);
      ELSIF status IN ('canceled', 'unpaid', 'incomplete_expired') THEN
        -- Downgrade to free
        RAISE LOG 'Subscription status is %, downgrading to free for user: %', 
          status, user_id_found;
          
        UPDATE profiles
        SET 
          plan_type = 'free',
          updated_at = now()
        WHERE id = user_id_found;
        
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        RAISE LOG 'Updated % profile records to free plan', affected_rows;
        
        UPDATE user_tickets
        SET 
          plan_type = 'free',
          tickets_remaining = LEAST(tickets_remaining, 300),
          updated_at = now()
        WHERE user_id = user_id_found;
        
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        RAISE LOG 'Updated % user_tickets records to free plan', affected_rows;
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
      RAISE LOG 'Invoice payment succeeded for customer: %', customer_id;
      
      UPDATE stripe_subscriptions
      SET 
        status = 'active',
        updated_at = now()
      WHERE customer_id = process_stripe_webhook_event.customer_id
        AND deleted_at IS NULL;
      
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE LOG 'Updated % subscription rows to active for customer: %', 
        affected_rows, customer_id;
        
      -- Update user to premium using the dedicated function
      RETURN activate_premium_for_customer(customer_id);
      
    ELSE
      RAISE LOG 'Ignoring event type: %', event_type;
      
      result := jsonb_build_object(
        'success', true,
        'action', 'event_ignored',
        'event_type', event_type
      );
  END CASE;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in process_stripe_webhook_event: % (event: %, customer: %)',
    SQLERRM, event_type, customer_id;
    
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'event_type', event_type,
    'customer_id', customer_id
  );
END;
$$;

-- Fix premium status for specific users - Ítalo and Ikeda
DO $$
DECLARE
  italo_user_id uuid := '67e1f0c1-585a-40b5-a871-c7cd2f473838';
  ikeda_user_id uuid := '7e644f43-38ab-44d8-8c46-65df73a490bb';
  result_italo jsonb;
  result_ikeda jsonb;
BEGIN
  RAISE LOG 'Starting manual premium fixes for Ítalo and Ikeda';

  -- Fix Ítalo's premium status
  SELECT * INTO result_italo FROM activate_premium_for_customer('cus_SKTDOtypnrFw8w');
  RAISE LOG 'Result of activating premium for Ítalo: %', result_italo;
  
  -- Fix Ikeda's premium status
  SELECT * INTO result_ikeda FROM activate_premium_for_customer('cus_SKoQpvJOODE4g');
  RAISE LOG 'Result of activating premium for Ikeda: %', result_ikeda;
  
  -- Direct update as a fallback for Ítalo
  UPDATE profiles
  SET plan_type = 'premium', updated_at = now()
  WHERE id = italo_user_id;
  
  UPDATE user_tickets
  SET plan_type = 'premium', tickets_remaining = 3000, updated_at = now()
  WHERE user_id = italo_user_id;
  
  -- Direct update as a fallback for Ikeda
  UPDATE profiles
  SET plan_type = 'premium', updated_at = now()
  WHERE id = ikeda_user_id;
  
  UPDATE user_tickets
  SET plan_type = 'premium', tickets_remaining = 3000, updated_at = now()
  WHERE user_id = ikeda_user_id;
  
  RAISE LOG 'Completed manual premium fixes for Ítalo and Ikeda';
END $$;

-- Fix specific customer record for Ikeda - SAFER VERSION
DO $$
DECLARE
  ikeda_user_id uuid := '7e644f43-38ab-44d8-8c46-65df73a490bb';
  ikeda_customer_id text := 'cus_SKoQpvJOODE4g';
  customer_exists boolean;
BEGIN
  -- Check if a customer record with this customer_id already exists
  SELECT EXISTS (
    SELECT 1 FROM stripe_customers 
    WHERE customer_id = ikeda_customer_id
  ) INTO customer_exists;
  
  IF customer_exists THEN
    -- Update existing record
    UPDATE stripe_customers
    SET 
      user_id = ikeda_user_id,
      updated_at = now(),
      deleted_at = NULL  -- Ensure record is not soft-deleted
    WHERE customer_id = ikeda_customer_id;
    
    RAISE LOG 'Updated existing customer record for Ikeda with customer_id: %', ikeda_customer_id;
  ELSE
    -- Check if user already has a different customer_id
    SELECT EXISTS (
      SELECT 1 FROM stripe_customers 
      WHERE user_id = ikeda_user_id
    ) INTO customer_exists;
    
    IF customer_exists THEN
      -- Update user's existing customer record
      UPDATE stripe_customers
      SET 
        customer_id = ikeda_customer_id,
        updated_at = now(),
        deleted_at = NULL
      WHERE user_id = ikeda_user_id;
      
      RAISE LOG 'Updated existing user record for Ikeda to customer_id: %', ikeda_customer_id;
    ELSE
      -- No conflicts, safe to insert
      INSERT INTO stripe_customers (user_id, customer_id)
      VALUES (ikeda_user_id, ikeda_customer_id);
      
      RAISE LOG 'Created new customer record for Ikeda: % -> %', ikeda_user_id, ikeda_customer_id;
    END IF;
  END IF;
END $$;

-- Create an RPC function to directly check premium status
CREATE OR REPLACE FUNCTION get_user_premium_status(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_premium boolean;
BEGIN
  -- Check both the profiles and user_tickets tables to ensure consistency
  SELECT 
    CASE
      WHEN p.plan_type = 'premium' AND ut.plan_type = 'premium' THEN true
      WHEN p.plan_type = 'premium' THEN true
      WHEN ut.plan_type = 'premium' THEN true
      ELSE false
    END INTO is_premium
  FROM profiles p
  JOIN user_tickets ut ON p.id = ut.user_id
  WHERE p.id = user_id_input;
  
  -- If we don't find a record, default to false
  RETURN COALESCE(is_premium, false);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION activate_premium_for_customer TO service_role;
GRANT EXECUTE ON FUNCTION process_stripe_webhook_event TO service_role;
GRANT EXECUTE ON FUNCTION sync_customer_subscription_status TO service_role;
GRANT EXECUTE ON FUNCTION get_user_premium_status TO authenticated;