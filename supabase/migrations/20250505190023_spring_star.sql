/*
  # Fix Subscription Cancellation

  1. Changes
    - Improve subscription cancellation trigger
    - Add better error handling and logging
    - Fix edge cases in status updates
    - Add validation checks
*/

-- Drop existing cancellation function and trigger
DROP TRIGGER IF EXISTS on_subscription_canceled ON stripe_subscriptions;
DROP FUNCTION IF EXISTS handle_subscription_canceled;

-- Create improved cancellation function with better error handling
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger AS $$
DECLARE
  affected_user_id uuid;
  affected_rows integer;
BEGIN
  -- Get the affected user_id
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id
    AND deleted_at IS NULL;

  IF affected_user_id IS NULL THEN
    RAISE LOG 'No user found for customer_id: %', NEW.customer_id;
    RETURN NEW;
  END IF;

  -- Update profiles first
  UPDATE profiles
  SET 
    plan_type = 'free',
    updated_at = CURRENT_TIMESTAMP
  WHERE id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows = 0 THEN
    RAISE LOG 'No profile updated for user_id: %', affected_user_id;
  END IF;

  -- Then update user_tickets
  UPDATE user_tickets
  SET 
    plan_type = 'free',
    tickets_remaining = LEAST(tickets_remaining, 300),
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = affected_user_id;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows = 0 THEN
    RAISE LOG 'No tickets updated for user_id: %', affected_user_id;
  END IF;

  -- Log successful cancellation
  RAISE LOG 'Successfully canceled subscription for user_id: % (customer_id: %)', 
    affected_user_id, NEW.customer_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log any errors that occur
  RAISE LOG 'Error in handle_subscription_canceled: % (user_id: %, customer_id: %)', 
    SQLERRM, affected_user_id, NEW.customer_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create improved cancellation trigger
CREATE TRIGGER on_subscription_canceled
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (
    (NEW.status = 'canceled' AND OLD.status != 'canceled') OR
    (NEW.status = 'incomplete_expired' AND OLD.status != 'incomplete_expired')
  )
  EXECUTE FUNCTION handle_subscription_canceled();

-- Fix any stuck subscriptions
WITH canceled_subs AS (
  SELECT DISTINCT sc.user_id
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE (ss.status = 'canceled' OR ss.status = 'incomplete_expired')
    AND sc.deleted_at IS NULL
)
UPDATE profiles p
SET 
  plan_type = 'free',
  updated_at = CURRENT_TIMESTAMP
FROM canceled_subs cs
WHERE p.id = cs.user_id
  AND p.plan_type = 'premium';

WITH canceled_subs AS (
  SELECT DISTINCT sc.user_id
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE (ss.status = 'canceled' OR ss.status = 'incomplete_expired')
    AND sc.deleted_at IS NULL
)
UPDATE user_tickets ut
SET 
  plan_type = 'free',
  tickets_remaining = LEAST(tickets_remaining, 300),
  updated_at = CURRENT_TIMESTAMP
FROM canceled_subs cs
WHERE ut.user_id = cs.user_id
  AND ut.plan_type = 'premium';

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status 
ON stripe_subscriptions(status) 
WHERE deleted_at IS NULL;