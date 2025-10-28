/*
  # Update plan_type for existing premium subscribers

  1. Changes
    - Update profiles.plan_type for users with active Stripe subscriptions
    - Ensure user_tickets and profiles stay in sync
    - Handle edge cases and data consistency
*/

-- Update profiles for users with active Stripe subscriptions
UPDATE profiles p
SET plan_type = 'premium'
FROM stripe_customers sc
JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
WHERE sc.user_id = p.id
  AND ss.status = 'active'
  AND ss.deleted_at IS NULL;

-- Ensure user_tickets matches profiles
UPDATE user_tickets ut
SET 
  plan_type = 'premium',
  tickets_remaining = GREATEST(tickets_remaining, 3000),
  updated_at = CURRENT_TIMESTAMP
FROM profiles p
WHERE ut.user_id = p.id
  AND p.plan_type = 'premium';

-- Create function to handle premium upgrade
CREATE OR REPLACE FUNCTION handle_premium_upgrade()
RETURNS trigger AS $$
BEGIN
  IF NEW.plan_type = 'premium' AND OLD.plan_type = 'free' THEN
    -- Set minimum tickets for premium users
    NEW.tickets_remaining = GREATEST(NEW.tickets_remaining, 3000);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for premium upgrades
DROP TRIGGER IF EXISTS upgrade_tickets_to_premium ON user_tickets;
CREATE TRIGGER upgrade_tickets_to_premium
  BEFORE UPDATE ON user_tickets
  FOR EACH ROW
  EXECUTE FUNCTION handle_premium_upgrade();