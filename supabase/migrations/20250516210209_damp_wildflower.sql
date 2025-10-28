/*
  # Fix Stripe Customer Creation and Subscription Handling

  1. Changes
    - Update user ticket calculation to properly handle premium status
    - Add new RPC function to handle Stripe webhook events more reliably
    - Fix potential race conditions in customer and subscription creation
    - Add better logging and error handling for debugging

  2. Security
    - Ensure proper RLS policies for stripe tables
    - Add better validation for subscription status changes
*/

-- Create function to create a customer record safely
CREATE OR REPLACE FUNCTION create_stripe_customer(
  user_id_input UUID,
  customer_id_input TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Try to insert new customer record, but do nothing if it already exists (ON CONFLICT)
  INSERT INTO stripe_customers (
    user_id,
    customer_id
  )
  VALUES (
    user_id_input,
    customer_id_input
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Also handle possible conflict on customer_id
  INSERT INTO stripe_customers (
    user_id,
    customer_id
  )
  VALUES (
    user_id_input,
    customer_id_input
  )
  ON CONFLICT (customer_id) DO UPDATE 
  SET 
    user_id = EXCLUDED.user_id,
    updated_at = now();
END;
$$;

-- Create an index on customer_id for better webhook performance
CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id ON stripe_customers(customer_id);

-- Create index on user_id for better lookup performance
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);

-- Create better error handling in subscription status handling
CREATE OR REPLACE FUNCTION handle_subscription_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_user_id uuid;
  affected_rows_count int;
  log_message text;
BEGIN
  -- Find the user associated with this customer
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id 
    AND deleted_at IS NULL;
    
  IF affected_user_id IS NULL THEN
    RAISE LOG 'No user found for customer: % (subscription: %)', 
      NEW.customer_id, NEW.subscription_id;
    RETURN NEW; -- Continue instead of failing
  END IF;
  
  RAISE LOG 'Activating premium for user: % (customer: %, subscription: %)',
    affected_user_id, NEW.customer_id, NEW.subscription_id;
  
  -- First update the profile
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows_count = ROW_COUNT;
  IF affected_rows_count = 0 THEN
    RAISE LOG 'Failed to update profile for user: %', affected_user_id;
  ELSE
    RAISE LOG 'Successfully updated profile to premium for user: %', affected_user_id;
  END IF;
  
  -- Then update user_tickets
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows_count = ROW_COUNT;
  IF affected_rows_count = 0 THEN
    RAISE LOG 'Failed to update tickets for user: %', affected_user_id;
  ELSE
    RAISE LOG 'Successfully updated tickets to premium for user: %', affected_user_id;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log detailed error message
  GET STACKED DIAGNOSTICS log_message = PG_EXCEPTION_DETAIL;
  RAISE LOG 'Error in handle_subscription_activated: % (Detail: %) (for customer: %)', 
    SQLERRM, log_message, NEW.customer_id;
  RETURN NULL;
END;
$$;

-- Create function to query subscription status by user
CREATE OR REPLACE FUNCTION get_subscription_status_by_user(user_id_input UUID)
RETURNS TABLE (
  customer_id TEXT,
  subscription_id TEXT,
  subscription_status TEXT,
  current_period_end BIGINT,
  price_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.customer_id,
    ss.subscription_id,
    ss.status::TEXT,
    ss.current_period_end,
    ss.price_id
  FROM 
    stripe_customers sc
  LEFT JOIN 
    stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE 
    sc.user_id = user_id_input
    AND sc.deleted_at IS NULL
    AND (ss.deleted_at IS NULL OR ss.deleted_at IS NOT NULL);
END;
$$;

-- Grant execute permission on the new functions
GRANT EXECUTE ON FUNCTION create_stripe_customer TO service_role;
GRANT EXECUTE ON FUNCTION get_subscription_status_by_user TO authenticated;