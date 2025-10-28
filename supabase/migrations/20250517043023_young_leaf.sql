-- Create a new RPC function to check a user's premium status
CREATE OR REPLACE FUNCTION get_user_premium_status(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_premium boolean;
BEGIN
  RAISE LOG 'Checking premium status for user: %', user_id_input;
  
  -- First check profiles table
  SELECT (plan_type = 'premium') INTO is_premium
  FROM profiles
  WHERE id = user_id_input;
  
  -- Log the result from profiles table
  RAISE LOG 'Premium status from profiles table: % (for user: %)', 
    is_premium, user_id_input;
    
  -- If not premium, check user_tickets table as fallback
  IF NOT is_premium THEN
    SELECT (plan_type = 'premium') INTO is_premium
    FROM user_tickets
    WHERE user_id = user_id_input;
    
    RAISE LOG 'Premium status from user_tickets table: % (for user: %)', 
      is_premium, user_id_input;
  END IF;
  
  -- If still not premium, check if user has active subscription
  IF NOT is_premium THEN
    SELECT EXISTS (
      SELECT 1 
      FROM stripe_customers sc
      JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
      WHERE sc.user_id = user_id_input
        AND sc.deleted_at IS NULL
        AND ss.deleted_at IS NULL
        AND ss.status = 'active'
    ) INTO is_premium;
    
    RAISE LOG 'Premium status from active subscriptions check: % (for user: %)', 
      is_premium, user_id_input;
  END IF;
  
  -- Final check - if premium status is inconsistent, fix it
  IF is_premium THEN
    -- Make sure both profile and tickets are marked as premium
    UPDATE profiles
    SET plan_type = 'premium', updated_at = now()
    WHERE id = user_id_input
      AND (plan_type IS NULL OR plan_type <> 'premium');
    
    UPDATE user_tickets
    SET plan_type = 'premium', updated_at = now()
    WHERE user_id = user_id_input
      AND (plan_type IS NULL OR plan_type <> 'premium');
      
    RAISE LOG 'Fixed inconsistent premium status for user: %', user_id_input;
  END IF;
  
  RETURN COALESCE(is_premium, false);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_premium_status TO authenticated;

-- Create improved subscription activation handler
CREATE OR REPLACE FUNCTION handle_subscription_updated()
RETURNS trigger AS $$
DECLARE
  affected_user_id uuid;
  affected_rows int;
BEGIN
  -- Find the user associated with this customer
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
    
  -- Handle different subscription status changes
  IF NEW.status = 'active' THEN
    -- Activate premium for active subscriptions
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
      tickets_remaining = GREATEST(tickets_remaining, 3000),
      updated_at = now()
    WHERE user_id = affected_user_id;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE LOG 'Updated % user_tickets records to premium for user: %', affected_rows, affected_user_id;
    
  ELSIF NEW.status IN ('canceled', 'incomplete_expired', 'unpaid') THEN
    -- Downgrade to free if subscription is canceled or payment failed
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
      tickets_remaining = LEAST(tickets_remaining, 300),
      updated_at = now()
    WHERE user_id = affected_user_id;
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE LOG 'Updated % user_tickets records to free for user: %', affected_rows, affected_user_id;
  ELSE
    -- For other statuses, log but don't change status
    RAISE LOG 'No status change needed for status: % (user: %)', NEW.status, affected_user_id;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_updated: % (customer: %)', SQLERRM, NEW.customer_id;
  RETURN NEW; -- Continue even if there's an error
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure trigger exists
DROP TRIGGER IF EXISTS on_subscription_updated ON stripe_subscriptions;
CREATE TRIGGER on_subscription_updated
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION handle_subscription_updated();

-- Fix premium status for specific users (do this via direct table updates)
DO $$
DECLARE
  italo_user_id uuid := '67e1f0c1-585a-40b5-a871-c7cd2f473838';
  ikeda_user_id uuid := '7e644f43-38ab-44d8-8c46-65df73a490bb';
  profile_affected int;
  tickets_affected int;
BEGIN
  RAISE LOG 'Applying direct premium fixes for Ítalo and Ikeda';

  -- Fix Ítalo's premium status
  UPDATE profiles
  SET plan_type = 'premium', updated_at = now()
  WHERE id = italo_user_id;
  GET DIAGNOSTICS profile_affected = ROW_COUNT;
  
  UPDATE user_tickets
  SET plan_type = 'premium', tickets_remaining = 3000, updated_at = now()
  WHERE user_id = italo_user_id;
  GET DIAGNOSTICS tickets_affected = ROW_COUNT;
  
  RAISE LOG 'Ítalo premium fix: Updated % profiles and % tickets records', profile_affected, tickets_affected;
  
  -- Fix Ikeda's premium status
  UPDATE profiles
  SET plan_type = 'premium', updated_at = now()
  WHERE id = ikeda_user_id;
  GET DIAGNOSTICS profile_affected = ROW_COUNT;
  
  UPDATE user_tickets
  SET plan_type = 'premium', tickets_remaining = 3000, updated_at = now()
  WHERE user_id = ikeda_user_id;
  GET DIAGNOSTICS tickets_affected = ROW_COUNT;
  
  RAISE LOG 'Ikeda premium fix: Updated % profiles and % tickets records', profile_affected, tickets_affected;
END $$;

-- Ensure Ikeda has correct customer record in stripe_customers
DO $$
DECLARE
  ikeda_user_id uuid := '7e644f43-38ab-44d8-8c46-65df73a490bb';
  ikeda_customer_id text := 'cus_SKoQpvJOODE4g';
  customer_exists boolean;
  customer_id_exists boolean;
BEGIN
  -- Check if a customer record with this customer_id already exists
  SELECT EXISTS (
    SELECT 1 FROM stripe_customers 
    WHERE customer_id = ikeda_customer_id
  ) INTO customer_id_exists;
  
  -- Check if user already has a customer record
  SELECT EXISTS (
    SELECT 1 FROM stripe_customers 
    WHERE user_id = ikeda_user_id
  ) INTO customer_exists;
  
  IF customer_id_exists THEN
    -- Update the existing customer record with Ikeda's user_id
    UPDATE stripe_customers
    SET 
      user_id = ikeda_user_id,
      updated_at = now(),
      deleted_at = NULL
    WHERE customer_id = ikeda_customer_id;
    
    RAISE LOG 'Updated existing customer record for customer_id: % to user_id: %', 
      ikeda_customer_id, ikeda_user_id;
  ELSIF customer_exists THEN
    -- Update Ikeda's existing customer record
    UPDATE stripe_customers
    SET 
      customer_id = ikeda_customer_id,
      updated_at = now(),
      deleted_at = NULL
    WHERE user_id = ikeda_user_id;
    
    RAISE LOG 'Updated existing customer record for user_id: % to customer_id: %', 
      ikeda_user_id, ikeda_customer_id;
  ELSE
    -- No conflicts, we can safely insert
    INSERT INTO stripe_customers (user_id, customer_id)
    VALUES (ikeda_user_id, ikeda_customer_id);
    
    RAISE LOG 'Created new customer record: % -> %', ikeda_user_id, ikeda_customer_id;
  END IF;
END $$;

-- Create function to force activate premium for a stripe customer
CREATE OR REPLACE FUNCTION activate_premium_for_stripe_customer(
  customer_id_param text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id_var uuid;
  profile_rows_affected int;
  ticket_rows_affected int;
BEGIN
  -- Find the user associated with this customer
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
  
  -- Update the profile
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = user_id_var;
  
  GET DIAGNOSTICS profile_rows_affected = ROW_COUNT;
  
  -- Update user tickets
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = user_id_var;
  
  GET DIAGNOSTICS ticket_rows_affected = ROW_COUNT;
  
  -- Ensure subscription is active
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
    'tickets_affected', ticket_rows_affected
  );
END;
$$;

-- Create a function to manually sync premium status
CREATE OR REPLACE FUNCTION refresh_premium_status_for_all_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_subscription RECORD;
  updated_users int := 0;
  results jsonb := '[]'::jsonb;
BEGIN
  -- First, find all active subscriptions
  FOR active_subscription IN 
    SELECT sc.user_id, sc.customer_id
    FROM stripe_subscriptions ss
    JOIN stripe_customers sc ON ss.customer_id = sc.customer_id
    WHERE ss.status = 'active' 
      AND ss.deleted_at IS NULL
      AND sc.deleted_at IS NULL
  LOOP
    -- Activate premium for each user with an active subscription
    UPDATE profiles
    SET plan_type = 'premium', updated_at = now()
    WHERE id = active_subscription.user_id;
    
    UPDATE user_tickets
    SET plan_type = 'premium', tickets_remaining = GREATEST(tickets_remaining, 3000), updated_at = now()
    WHERE user_id = active_subscription.user_id;
    
    updated_users := updated_users + 1;
    results := results || jsonb_build_object(
      'user_id', active_subscription.user_id,
      'customer_id', active_subscription.customer_id
    );
    
    RAISE LOG 'Updated premium status for user: % (customer: %)', 
      active_subscription.user_id, active_subscription.customer_id;
  END LOOP;
  
  -- Next, find any users with inconsistent premium status
  -- Profiles says premium but user_tickets doesn't
  WITH inconsistent_premium AS (
    SELECT p.id
    FROM profiles p
    JOIN user_tickets ut ON p.id = ut.user_id
    WHERE p.plan_type = 'premium' AND ut.plan_type <> 'premium'
  )
  UPDATE user_tickets ut
  SET plan_type = 'premium', tickets_remaining = GREATEST(tickets_remaining, 3000), updated_at = now()
  WHERE user_id IN (SELECT id FROM inconsistent_premium);
  
  -- User_tickets says premium but profiles doesn't
  WITH inconsistent_premium AS (
    SELECT ut.user_id
    FROM user_tickets ut
    JOIN profiles p ON ut.user_id = p.id
    WHERE ut.plan_type = 'premium' AND p.plan_type <> 'premium'
  )
  UPDATE profiles p
  SET plan_type = 'premium', updated_at = now()
  WHERE id IN (SELECT user_id FROM inconsistent_premium);
  
  RETURN jsonb_build_object(
    'success', true,
    'users_updated', updated_users,
    'details', results
  );
END;
$$;

-- Grant execute permissions for the new functions
GRANT EXECUTE ON FUNCTION get_user_premium_status TO authenticated;
GRANT EXECUTE ON FUNCTION activate_premium_for_stripe_customer TO service_role;
GRANT EXECUTE ON FUNCTION refresh_premium_status_for_all_users TO service_role;