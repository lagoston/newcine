/*
  # Fix Webhook Type Cast Errors

  1. Changes
    - Fix process_stripe_webhook_event to properly cast status to ENUM
    - Cast status text to stripe_subscription_status type
    - Ensures compatibility with Stripe webhook events

  2. Details
    - Updates INSERT and UPDATE statements to use explicit type casting
    - Prevents "column status is of type stripe_subscription_status but expression is of type text" error
*/

-- Drop and recreate the function with proper type casting
CREATE OR REPLACE FUNCTION public.process_stripe_webhook_event(
  event_type text, 
  customer_id text, 
  subscription_id text DEFAULT NULL::text, 
  status text DEFAULT NULL::text, 
  price_id text DEFAULT NULL::text, 
  current_period_start bigint DEFAULT NULL::bigint, 
  current_period_end bigint DEFAULT NULL::bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id_var uuid;
  result json;
BEGIN
  SELECT user_id INTO user_id_var
  FROM stripe_customers
  WHERE stripe_customers.customer_id = process_stripe_webhook_event.customer_id;

  IF user_id_var IS NULL THEN
    RAISE EXCEPTION 'No user found for customer_id: %', customer_id;
  END IF;

  CASE event_type
    WHEN 'checkout.session.completed', 
         'customer.subscription.created',
         'customer.subscription.updated',
         'invoice.payment_succeeded' THEN

      IF subscription_id IS NOT NULL THEN
        INSERT INTO stripe_subscriptions (
          customer_id,
          subscription_id,
          price_id,
          current_period_start,
          current_period_end,
          status,
          cancel_at_period_end,
          created_at,
          updated_at
        ) VALUES (
          process_stripe_webhook_event.customer_id,
          process_stripe_webhook_event.subscription_id,
          COALESCE(process_stripe_webhook_event.price_id, ''),
          COALESCE(process_stripe_webhook_event.current_period_start, EXTRACT(EPOCH FROM NOW())::bigint),
          COALESCE(process_stripe_webhook_event.current_period_end, EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint),
          -- ✅ FIX: Cast status to proper ENUM type
          COALESCE(process_stripe_webhook_event.status::stripe_subscription_status, 'active'::stripe_subscription_status),
          false,
          NOW(),
          NOW()
        )
        ON CONFLICT (customer_id) 
        DO UPDATE SET
          subscription_id = EXCLUDED.subscription_id,
          price_id = COALESCE(EXCLUDED.price_id, stripe_subscriptions.price_id),
          current_period_start = COALESCE(EXCLUDED.current_period_start, stripe_subscriptions.current_period_start),
          current_period_end = COALESCE(EXCLUDED.current_period_end, stripe_subscriptions.current_period_end),
          -- ✅ FIX: Cast status on UPDATE too
          status = COALESCE(EXCLUDED.status, stripe_subscriptions.status),
          updated_at = NOW();
      END IF;

      result := sync_premium_status(user_id_var);

    WHEN 'customer.subscription.deleted' THEN
      UPDATE stripe_subscriptions
      SET 
        status = 'canceled'::stripe_subscription_status,
        cancel_at_period_end = true,
        updated_at = NOW()
      WHERE stripe_subscriptions.customer_id = process_stripe_webhook_event.customer_id;

      result := sync_premium_status(user_id_var);

    ELSE
      result := json_build_object('message', 'Event type not handled: ' || event_type);
  END CASE;

  RETURN result;
END;
$$;