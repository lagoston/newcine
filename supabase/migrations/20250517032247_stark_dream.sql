-- Create function to activate premium for a specific customer ID
DROP FUNCTION IF EXISTS activate_premium_for_customer;
DROP FUNCTION IF EXISTS sync_customer_subscription_status;
DROP FUNCTION IF EXISTS process_stripe_webhook_event;

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
  -- Find the user ID associated with this customer
  SELECT user_id INTO user_id_found
  FROM stripe_customers
  WHERE customer_id = customer_id_input
    AND deleted_at IS NULL;
    
  IF user_id_found IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customer not found: ' || customer_id_input
    );
  END IF;
  
  -- Update profile to premium
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = user_id_found;
  
  GET DIAGNOSTICS profile_rows_affected = ROW_COUNT;
  
  -- Update user_tickets to premium with 3000 tickets
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = user_id_found;
  
  GET DIAGNOSTICS tickets_rows_affected = ROW_COUNT;
  
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
  
  -- Return success result
  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_id_found,
    'profile_updated', profile_rows_affected > 0,
    'tickets_updated', tickets_rows_affected > 0,
    'customer_id', customer_id_input
  );
EXCEPTION WHEN OTHERS THEN
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
  -- Get the subscription status
  SELECT status::text INTO subscription_status
  FROM stripe_subscriptions
  WHERE customer_id = customer_id_input
    AND deleted_at IS NULL;

  -- If subscription is active, use the dedicated function
  IF subscription_status = 'active' THEN
    RETURN activate_premium_for_customer(customer_id_input);
  ELSE
    -- Find the user associated with this customer
    SELECT user_id INTO user_id_found
    FROM stripe_customers
    WHERE customer_id = customer_id_input
      AND deleted_at IS NULL;
      
    IF user_id_found IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Customer not found: ' || customer_id_input
      );
    END IF;
    
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
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'customer_id', customer_id_input
  );
END;
$$;

-- Function to process webhook events
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
      RETURN activate_premium_for_customer(customer_id);
      
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
        -- Use the dedicated function for reliability
        RETURN activate_premium_for_customer(customer_id);
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
        -- Upgrade to premium using the dedicated function
        RETURN activate_premium_for_customer(customer_id);
      ELSIF status IN ('canceled', 'unpaid', 'incomplete_expired') THEN
        -- Downgrade to free
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
      UPDATE stripe_subscriptions
      SET 
        status = 'active',
        updated_at = now()
      WHERE customer_id = process_stripe_webhook_event.customer_id
        AND deleted_at IS NULL;
        
      -- Update user to premium using the dedicated function
      RETURN activate_premium_for_customer(customer_id);
      
    ELSE
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

-- Fix premium status for Ítalo (cus_SKTDOtypnrFw8w)
DO $$
DECLARE
  italo_user_id uuid := '67e1f0c1-585a-40b5-a871-c7cd2f473838';
  customer_id_exists boolean;
BEGIN
  -- Check if the customer ID exists in stripe_customers
  SELECT EXISTS (
    SELECT 1 FROM stripe_customers 
    WHERE customer_id = 'cus_SKTDOtypnrFw8w'
  ) INTO customer_id_exists;
  
  -- If customer ID exists, use activate_premium_for_customer
  IF customer_id_exists THEN
    PERFORM activate_premium_for_customer('cus_SKTDOtypnrFw8w');
    RAISE LOG 'Fixed premium status for Ítalo via customer ID: cus_SKTDOtypnrFw8w';
  ELSE
    -- If customer ID doesn't exist, we need to create the association first
    INSERT INTO stripe_customers (
      user_id,
      customer_id
    ) VALUES (
      italo_user_id,
      'cus_SKTDOtypnrFw8w'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      customer_id = 'cus_SKTDOtypnrFw8w',
      updated_at = now();
      
    -- Then activate premium
    PERFORM activate_premium_for_customer('cus_SKTDOtypnrFw8w');
    RAISE LOG 'Created customer association and fixed premium status for Ítalo (cus_SKTDOtypnrFw8w)';
  END IF;
  
  -- Directly update profile and tickets as a fallback
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = italo_user_id;
  
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = italo_user_id;
  
  RAISE LOG 'Direct update applied to profile and tickets for Ítalo (user_id: %)', italo_user_id;
END $$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION activate_premium_for_customer TO service_role;
GRANT EXECUTE ON FUNCTION process_stripe_webhook_event TO service_role;
GRANT EXECUTE ON FUNCTION sync_customer_subscription_status TO service_role;