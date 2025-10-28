/*
  # Roll back premium visuals cleanup

  1. Changes
    - Remove profile updates from subscription cancellation handler
    - Keep only plan_type and tickets update
    - Restore any affected premium profiles
    - Update public_profiles view to use correct column names

  2. Security
    - Maintain existing RLS policies
    - No changes to access control
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_subscription_canceled ON stripe_subscriptions;
DROP FUNCTION IF EXISTS handle_subscription_canceled;

-- Recreate function without profile updates
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger AS $$
BEGIN
  -- Update user's plan to free and adjust tickets only
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

-- Recreate trigger
CREATE TRIGGER on_subscription_canceled
  AFTER UPDATE OF status ON stripe_subscriptions
  FOR EACH ROW
  WHEN (NEW.status = 'canceled')
  EXECUTE FUNCTION handle_subscription_canceled();

-- Restore premium profiles that may have been affected
UPDATE profiles p
SET 
  avatar_frame = 'gold',
  banner = 'gold'
FROM user_tickets ut
WHERE p.id = ut.user_id
  AND ut.plan_type = 'premium'
  AND (p.avatar_frame = '' OR p.banner = '');

-- Update public_profiles view to use correct column names
DROP VIEW IF EXISTS public_profiles CASCADE;

CREATE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.active_tag,
  ut.plan_type,
  p.avatar_frame,
  p.banner
FROM profiles p
LEFT JOIN user_tickets ut ON p.id = ut.user_id;

-- Grant access to authenticated users
GRANT SELECT ON public_profiles TO authenticated;