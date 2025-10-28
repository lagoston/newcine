-- Drop existing cancellation function and trigger
DROP TRIGGER IF EXISTS on_subscription_canceled ON stripe_subscriptions;
DROP FUNCTION IF EXISTS handle_subscription_canceled;

-- Create improved cancellation function with detailed logging and verification
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger AS $$
DECLARE
  affected_user_id uuid;
  affected_rows integer;
  log_message text;
BEGIN
  -- Log the incoming cancellation request
  RAISE LOG 'Processing subscription cancellation: subscription_id=%, customer_id=%, old_status=%, new_status=%',
    NEW.subscription_id, NEW.customer_id, OLD.status, NEW.status;

  -- Get the affected user_id with verification
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id
    AND deleted_at IS NULL;

  IF affected_user_id IS NULL THEN
    RAISE LOG 'Error: No active user found for customer_id=% subscription_id=%',
      NEW.customer_id, NEW.subscription_id;
    RETURN NEW;
  END IF;

  -- Log the found user
  RAISE LOG 'Found user_id=% for customer_id=%', affected_user_id, NEW.customer_id;

  -- Update profiles with verification
  UPDATE profiles
  SET 
    plan_type = 'free',
    updated_at = CURRENT_TIMESTAMP
  WHERE id = affected_user_id
  RETURNING id INTO affected_user_id;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows = 0 THEN
    RAISE LOG 'Error: Failed to update profile for user_id=%', affected_user_id;
  ELSE
    RAISE LOG 'Successfully updated profile to free plan for user_id=%', affected_user_id;
  END IF;

  -- Update user_tickets with verification
  UPDATE user_tickets
  SET 
    plan_type = 'free',
    tickets_remaining = LEAST(tickets_remaining, 300),
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = affected_user_id
  RETURNING user_id INTO affected_user_id;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows = 0 THEN
    RAISE LOG 'Error: Failed to update tickets for user_id=%', affected_user_id;
  ELSE
    RAISE LOG 'Successfully updated tickets to free plan for user_id=%', affected_user_id;
  END IF;

  -- Log final success
  RAISE LOG 'Successfully processed cancellation: subscription_id=%, user_id=%',
    NEW.subscription_id, affected_user_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log any errors in detail
  GET STACKED DIAGNOSTICS log_message = PG_EXCEPTION_DETAIL;
  RAISE LOG 'Critical error in handle_subscription_canceled: % (Detail: %)',
    SQLERRM, log_message;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create improved cancellation trigger that catches all cancellation states
CREATE TRIGGER on_subscription_canceled
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (
    (NEW.status = 'canceled' AND OLD.status != 'canceled') OR
    (NEW.status = 'incomplete_expired' AND OLD.status != 'incomplete_expired')
  )
  EXECUTE FUNCTION handle_subscription_canceled();

-- Fix any inconsistent states
WITH canceled_subs AS (
  SELECT DISTINCT sc.user_id
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE (ss.status = 'canceled' OR ss.status = 'incomplete_expired')
    AND sc.deleted_at IS NULL
    AND ss.deleted_at IS NULL
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
    AND ss.deleted_at IS NULL
)
UPDATE user_tickets ut
SET 
  plan_type = 'free',
  tickets_remaining = LEAST(tickets_remaining, 300),
  updated_at = CURRENT_TIMESTAMP
FROM canceled_subs cs
WHERE ut.user_id = cs.user_id
  AND ut.plan_type = 'premium';

-- Add index for better performance if not exists
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status_customer 
ON stripe_subscriptions(status, customer_id) 
WHERE deleted_at IS NULL;

-- Force refresh of subscription status
UPDATE stripe_subscriptions 
SET updated_at = CURRENT_TIMESTAMP 
WHERE subscription_id = 'sub_1RLSgoElYXeJYKCBD9RO59Bk';