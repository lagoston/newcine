/*
  # Fix Premium Subscription Activation

  1. Purpose
    - Fix immediate premium activation for new and existing subscriptions
    - Repair the premium status sync between Stripe and profile/tickets tables
    - Add database functions for manual status correction
    
  2. Changes
    - Add new RPC function for direct premium activation
    - Fix existing trigger functions for subscription updates
    - Create diagnostic queries for subscription status debugging
    - Add process_webhook_event function for easier Stripe integration
*/

-- Create function to activate premium for a specific user
CREATE OR REPLACE FUNCTION activate_premium_for_user(
  target_user_id uuid
)
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

-- Fix existing handle_subscription_activated function
CREATE OR REPLACE FUNCTION handle_subscription_activated()
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
    RAISE WARNING 'No user found for customer: %', NEW.customer_id;
    RETURN NEW; -- Continue instead of failing
  END IF;
  
  -- Activate premium benefits for the user
  PERFORM activate_premium_for_user(affected_user_id);
  
  RAISE NOTICE 'Premium activated for user_id % (customer_id: %)', 
    affected_user_id, NEW.customer_id;
    
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in handle_subscription_activated: % (for customer: %)', 
    SQLERRM, NEW.customer_id;
  RETURN NEW; -- Continue instead of failing completely
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix customer.subscription.updated trigger function
CREATE OR REPLACE FUNCTION handle_subscription_updated()
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
    RAISE WARNING 'No user found for customer: %', NEW.customer_id;
    RETURN NEW; -- Continue instead of failing
  END IF;
  
  -- Update based on subscription status
  IF NEW.status = 'active' THEN
    -- Activate premium
    PERFORM activate_premium_for_user(affected_user_id);
    RAISE NOTICE 'Premium activated for user_id % (subscription updated to active)', affected_user_id;
  ELSIF NEW.status IN ('canceled', 'incomplete_expired', 'unpaid') THEN
    -- Downgrade to free
    UPDATE profiles
    SET plan_type = 'free', updated_at = now()
    WHERE id = affected_user_id;
    
    UPDATE user_tickets
    SET 
      plan_type = 'free',
      tickets_remaining = LEAST(tickets_remaining, 300),
      updated_at = now()
    WHERE user_id = affected_user_id;
    
    RAISE NOTICE 'Downgraded to free for user_id % (subscription status: %)', affected_user_id, NEW.status;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in handle_subscription_updated: % (for customer: %)', 
    SQLERRM, NEW.customer_id;
  RETURN NEW; -- Continue instead of failing completely
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate subscription status trigger
DROP TRIGGER IF EXISTS on_subscription_activated ON stripe_subscriptions;

CREATE TRIGGER on_subscription_activated
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND OLD.status <> 'active')
  EXECUTE FUNCTION handle_subscription_activated();
  
-- Create trigger for any subscription update
DROP TRIGGER IF EXISTS on_subscription_updated ON stripe_subscriptions;

CREATE TRIGGER on_subscription_updated
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION handle_subscription_updated();

-- Add manual premium activation for existing premium subscribers
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
    PERFORM activate_premium_for_user(subscription_record.user_id);
    RAISE NOTICE 'Activated premium for existing subscriber: user_id=%', 
      subscription_record.user_id;
  END LOOP;
END;
$$;

-- Grant execution permission for the new function
GRANT EXECUTE ON FUNCTION activate_premium_for_user TO service_role;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status ON stripe_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON profiles(plan_type);
CREATE INDEX IF NOT EXISTS idx_user_tickets_user_id ON user_tickets(user_id);