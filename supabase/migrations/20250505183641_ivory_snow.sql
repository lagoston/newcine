/*
  # Fix Premium Synchronization System

  1. Changes
    - Reset and rebuild premium-related functions and triggers
    - Ensure consistent 3000 tickets for premium users
    - Fix synchronization between profiles and user_tickets
    - Clean up any inconsistent states
    - Add proper error handling and atomic updates
*/

-- First, clean up any inconsistent states
UPDATE profiles p
SET plan_type = 'free'
WHERE plan_type IS NULL OR plan_type NOT IN ('free', 'premium');

UPDATE user_tickets ut
SET plan_type = 'free'
WHERE plan_type IS NULL OR plan_type NOT IN ('free', 'premium');

-- Drop existing functions and triggers
DROP TRIGGER IF EXISTS on_subscription_activated ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_canceled ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_renewed ON stripe_subscriptions;
DROP TRIGGER IF EXISTS sync_profile_plan_type ON user_tickets;
DROP TRIGGER IF EXISTS sync_tickets_plan_type ON profiles;

DROP FUNCTION IF EXISTS handle_subscription_activated;
DROP FUNCTION IF EXISTS handle_subscription_canceled;
DROP FUNCTION IF EXISTS handle_subscription_renewed;
DROP FUNCTION IF EXISTS sync_subscription_status;
DROP FUNCTION IF EXISTS check_and_reset_tickets;

-- Create improved check_and_reset_tickets function
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_input uuid)
RETURNS void AS $$
DECLARE
  user_data user_tickets%ROWTYPE;
  next_reset timestamptz;
  curr_time timestamptz;
BEGIN
  -- Get current time in UTC
  curr_time := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';

  -- Get user ticket data
  SELECT * INTO user_data
  FROM user_tickets
  WHERE user_id = user_id_input;

  -- If user doesn't have tickets yet, create them
  IF NOT FOUND THEN
    INSERT INTO user_tickets (
      user_id,
      tickets_remaining,
      plan_type,
      last_reset_at
    )
    SELECT 
      user_id_input,
      CASE WHEN p.plan_type = 'premium' THEN 3000 ELSE 300 END,
      p.plan_type,
      curr_time
    FROM profiles p
    WHERE p.id = user_id_input
    RETURNING * INTO user_data;
  END IF;

  -- Calculate next reset time (next Monday at 00:00 UTC)
  next_reset := user_data.last_reset_at + 
    CASE
      WHEN EXTRACT(DOW FROM user_data.last_reset_at) = 1 THEN INTERVAL '7 days'
      ELSE (INTERVAL '1 day' * (8 - EXTRACT(DOW FROM user_data.last_reset_at)::integer))
    END;

  next_reset := date_trunc('day', next_reset);

  -- If we've passed the reset time, update tickets
  IF curr_time >= next_reset THEN
    -- Calculate the most recent Monday
    next_reset := date_trunc('day', curr_time) - 
      (INTERVAL '1 day' * 
        CASE 
          WHEN EXTRACT(DOW FROM curr_time) = 1 THEN 0
          WHEN EXTRACT(DOW FROM curr_time) = 0 THEN 6
          ELSE EXTRACT(DOW FROM curr_time)::integer - 1
        END
      );

    UPDATE user_tickets
    SET 
      tickets_remaining = CASE 
        WHEN plan_type = 'premium' THEN 3000
        ELSE 300
      END,
      last_reset_at = next_reset,
      updated_at = curr_time
    WHERE user_id = user_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create improved subscription handling functions
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

  WITH customer AS (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
      AND deleted_at IS NULL
  )
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = CURRENT_TIMESTAMP
  FROM customer
  WHERE user_tickets.user_id = customer.user_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error and rollback
  RAISE LOG 'Error in handle_subscription_activated: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

  WITH customer AS (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
      AND deleted_at IS NULL
  )
  UPDATE user_tickets
  SET 
    plan_type = 'free',
    tickets_remaining = LEAST(tickets_remaining, 300),
    updated_at = CURRENT_TIMESTAMP
  FROM customer
  WHERE user_tickets.user_id = customer.user_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_canceled: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_renewed: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create improved sync function
CREATE OR REPLACE FUNCTION sync_subscription_status()
RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_tickets' THEN
    -- Sync from tickets to profile
    UPDATE profiles
    SET 
      plan_type = NEW.plan_type,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.user_id;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    -- Sync from profile to tickets
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
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in sync_subscription_status: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate all triggers
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

-- Fix any existing premium accounts
WITH active_subscriptions AS (
  SELECT DISTINCT sc.user_id
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE ss.status = 'active'
    AND ss.deleted_at IS NULL
    AND sc.deleted_at IS NULL
)
UPDATE profiles p
SET 
  plan_type = 'premium',
  updated_at = CURRENT_TIMESTAMP
FROM active_subscriptions a
WHERE p.id = a.user_id;

-- Ensure all premium users have correct ticket amounts
UPDATE user_tickets ut
SET 
  tickets_remaining = GREATEST(tickets_remaining, 3000),
  updated_at = CURRENT_TIMESTAMP
WHERE plan_type = 'premium';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_user_tickets_plan_type ON user_tickets(plan_type);
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON profiles(plan_type);