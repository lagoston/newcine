/*
  # Restore Bruno's premium and fix stale subscription period

  ## Problem
  Bruno's stripe_subscription had status='active' but current_period_end was in the past
  (2026-04-15) because the invoice.payment_succeeded webhook was not fetching the updated
  current_period_end from Stripe on renewal. The is_premium_active() function correctly
  saw an expired period and returned false.

  ## Fix applied here
  1. Update current_period_end for Bruno's subscription to +30 days from today as a
     temporary restore while the real value will be corrected by the next webhook event.
  2. Call sync_premium_status to set plan_type = 'premium' for Bruno.

  ## Root cause fix
  The stripe-webhook edge function has been updated to retrieve full subscription details
  from Stripe on invoice.payment_succeeded events, ensuring current_period_end is always
  updated correctly on renewal.
*/

DO $$
DECLARE
  bruno_user_id uuid := '17bef49a-2c3f-40c9-a9b5-a741946b1b1b';
  now_epoch bigint;
  renewed_period_end bigint;
BEGIN
  now_epoch := EXTRACT(EPOCH FROM NOW())::bigint;
  -- Set to 30 days from now as a restore; the webhook will correct to the exact Stripe value on next event
  renewed_period_end := EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint;

  -- Update the subscription record with a valid future period end
  UPDATE stripe_subscriptions
  SET
    current_period_end = renewed_period_end,
    status = 'active',
    updated_at = NOW()
  WHERE customer_id = (
    SELECT customer_id FROM stripe_customers WHERE user_id = bruno_user_id
  );

  -- Sync premium status so plan_type becomes 'premium' again
  PERFORM sync_premium_status(bruno_user_id);
END $$;
