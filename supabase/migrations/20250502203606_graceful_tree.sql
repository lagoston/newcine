-- Add function to handle subscription cancellation
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger AS $$
BEGIN
  -- Update user's plan to free and adjust tickets
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for subscription cancellation
DROP TRIGGER IF EXISTS on_subscription_canceled ON stripe_subscriptions;
CREATE TRIGGER on_subscription_canceled
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'canceled')
  EXECUTE FUNCTION handle_subscription_canceled();