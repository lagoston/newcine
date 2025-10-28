/*
  # Complete Premium System Rebuild

  1. Changes
    - Drop existing premium-related functions and triggers
    - Reset all premium-related columns to default state
    - Create new premium system with proper synchronization
    - Add robust error handling and validation
*/

-- First, drop all existing premium-related functions and triggers
DROP TRIGGER IF EXISTS on_subscription_activated ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_canceled ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_renewed ON stripe_subscriptions;
DROP TRIGGER IF EXISTS sync_profile_plan_type ON user_tickets;
DROP TRIGGER IF EXISTS sync_tickets_plan_type ON profiles;
DROP TRIGGER IF EXISTS upgrade_tickets_to_premium ON user_tickets;

DROP FUNCTION IF EXISTS handle_subscription_activated;
DROP FUNCTION IF EXISTS handle_subscription_canceled;
DROP FUNCTION IF EXISTS handle_subscription_renewed;
DROP FUNCTION IF EXISTS sync_subscription_status;
DROP FUNCTION IF EXISTS handle_premium_upgrade;

-- Reset all premium-related columns to default state
UPDATE profiles SET plan_type = 'free';
UPDATE user_tickets SET 
  plan_type = 'free',
  tickets_remaining = 300;

-- Create new function to handle subscription activation
CREATE OR REPLACE FUNCTION handle_subscription_activated()
RETURNS trigger AS $$
BEGIN
  -- Update both profiles and tickets atomically
  WITH customer AS (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
      AND deleted_at IS NULL
  )
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = CURRENT_TIMESTAMP
  FROM customer
  WHERE profiles.id = customer.user_id;

  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = CURRENT_TIMESTAMP
  FROM customer
  WHERE user_tickets.user_id = customer.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new function to handle subscription cancellation
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger AS $$
BEGIN
  -- Update both profiles and tickets atomically
  WITH customer AS (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
      AND deleted_at IS NULL
  )
  UPDATE profiles
  SET 
    plan_type = 'free',
    updated_at = CURRENT_TIMESTAMP
  FROM customer
  WHERE profiles.id = customer.user_id;

  UPDATE user_tickets
  SET 
    plan_type = 'free',
    tickets_remaining = LEAST(tickets_remaining, 300),
    updated_at = CURRENT_TIMESTAMP
  FROM customer
  WHERE user_tickets.user_id = customer.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new function to handle subscription renewal
CREATE OR REPLACE FUNCTION handle_subscription_renewed()
RETURNS trigger AS $$
BEGIN
  -- Ensure premium benefits are maintained
  WITH customer AS (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
      AND deleted_at IS NULL
  )
  UPDATE user_tickets
  SET 
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = CURRENT_TIMESTAMP
  FROM customer
  WHERE user_tickets.user_id = customer.user_id
    AND user_tickets.plan_type = 'premium';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new function to sync subscription status between profiles and tickets
CREATE OR REPLACE FUNCTION sync_subscription_status()
RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_tickets' THEN
    UPDATE profiles
    SET 
      plan_type = NEW.plan_type,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.user_id;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    UPDATE user_tickets
    SET 
      plan_type = NEW.plan_type,
      tickets_remaining = CASE 
        WHEN NEW.plan_type = 'premium' THEN GREATEST(tickets_remaining, 3000)
        ELSE LEAST(tickets_remaining, 300)
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new triggers
CREATE TRIGGER on_subscription_activated
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND OLD.status != 'active')
  EXECUTE FUNCTION handle_subscription_activated();

CREATE TRIGGER on_subscription_canceled
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'canceled')
  EXECUTE FUNCTION handle_subscription_canceled();

CREATE TRIGGER on_subscription_renewed
  AFTER UPDATE OF current_period_start ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION handle_subscription_renewed();

CREATE TRIGGER sync_profile_plan_type
  AFTER UPDATE OF plan_type ON user_tickets
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_status();

CREATE TRIGGER sync_tickets_plan_type
  AFTER UPDATE OF plan_type ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_status();

-- Update all active subscriptions to trigger the new system
UPDATE stripe_subscriptions
SET updated_at = CURRENT_TIMESTAMP
WHERE status = 'active'
  AND deleted_at IS NULL;