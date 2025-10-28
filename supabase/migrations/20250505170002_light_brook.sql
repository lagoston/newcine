/*
  # Subscription Status Synchronization System

  1. Functions
    - handle_subscription_activated: Updates user to premium when subscription becomes active
    - handle_subscription_canceled: Downgrades user to free when subscription is canceled
    - handle_subscription_renewed: Ensures premium benefits on renewal
    - sync_subscription_status: Keeps profiles and tickets in sync

  2. Triggers
    - Subscription status changes
    - Plan type changes
    - Renewal events
*/

-- Function to handle subscription activation
CREATE OR REPLACE FUNCTION handle_subscription_activated()
RETURNS trigger AS $$
BEGIN
  -- Update user_tickets and profiles when subscription becomes active
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id IN (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
  );

  -- Update profile status
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = CURRENT_TIMESTAMP
  WHERE id IN (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle subscription cancellation
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger AS $$
BEGIN
  -- Downgrade user to free plan
  UPDATE user_tickets
  SET 
    plan_type = 'free',
    tickets_remaining = LEAST(tickets_remaining, 300),
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id IN (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
  );

  -- Update profile status
  UPDATE profiles
  SET 
    plan_type = 'free',
    updated_at = CURRENT_TIMESTAMP
  WHERE id IN (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle subscription renewal
CREATE OR REPLACE FUNCTION handle_subscription_renewed()
RETURNS trigger AS $$
BEGIN
  -- Ensure premium benefits are maintained
  UPDATE user_tickets
  SET 
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id IN (
    SELECT user_id 
    FROM stripe_customers 
    WHERE customer_id = NEW.customer_id
  )
  AND plan_type = 'premium';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync subscription status
CREATE OR REPLACE FUNCTION sync_subscription_status()
RETURNS trigger AS $$
BEGIN
  -- Keep profiles and tickets in sync
  IF TG_TABLE_NAME = 'user_tickets' THEN
    UPDATE profiles
    SET plan_type = NEW.plan_type
    WHERE id = NEW.user_id;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    UPDATE user_tickets
    SET plan_type = NEW.plan_type
    WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers
DROP TRIGGER IF EXISTS on_subscription_activated ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_canceled ON stripe_subscriptions;
DROP TRIGGER IF EXISTS on_subscription_renewed ON stripe_subscriptions;
DROP TRIGGER IF EXISTS sync_profile_plan_type ON user_tickets;
DROP TRIGGER IF EXISTS sync_tickets_plan_type ON profiles;

-- Create trigger for subscription activation
CREATE TRIGGER on_subscription_activated
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND OLD.status != 'active')
  EXECUTE FUNCTION handle_subscription_activated();

-- Create trigger for subscription cancellation
CREATE TRIGGER on_subscription_canceled
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'canceled')
  EXECUTE FUNCTION handle_subscription_canceled();

-- Create trigger for subscription renewal
CREATE TRIGGER on_subscription_renewed
  AFTER UPDATE OF current_period_start ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION handle_subscription_renewed();

-- Create triggers for plan type sync
CREATE TRIGGER sync_profile_plan_type
  AFTER UPDATE OF plan_type ON user_tickets
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_status();

CREATE TRIGGER sync_tickets_plan_type
  AFTER UPDATE OF plan_type ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_status();

-- Update existing subscriptions
UPDATE stripe_subscriptions
SET updated_at = CURRENT_TIMESTAMP
WHERE status = 'active'
  AND deleted_at IS NULL;