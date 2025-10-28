-- First, update existing premium users to have 3000 tickets
UPDATE user_tickets
SET tickets_remaining = GREATEST(tickets_remaining, 3000)
WHERE plan_type = 'premium';

-- Update the check_and_reset_tickets function to use 3000 for premium users
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
    INSERT INTO user_tickets (user_id)
    VALUES (user_id_input)
    RETURNING * INTO user_data;
  END IF;

  -- Calculate next reset time (next Monday at 00:00 UTC)
  next_reset := user_data.last_reset_at + 
    CASE
      -- If last reset was on Monday, add 7 days
      WHEN EXTRACT(DOW FROM user_data.last_reset_at) = 1 THEN INTERVAL '7 days'
      -- Otherwise, calculate days until next Monday
      ELSE (INTERVAL '1 day' * (8 - EXTRACT(DOW FROM user_data.last_reset_at)::integer))
    END;

  -- Ensure next_reset is at midnight UTC
  next_reset := date_trunc('day', next_reset);

  -- If we've passed the reset time, update tickets
  IF curr_time >= next_reset THEN
    -- Calculate the most recent Monday at midnight UTC
    next_reset := date_trunc('day', curr_time) - 
      (INTERVAL '1 day' * 
        CASE 
          WHEN EXTRACT(DOW FROM curr_time) = 1 THEN 0  -- If Monday, use today
          WHEN EXTRACT(DOW FROM curr_time) = 0 THEN 6  -- If Sunday, use 6 days ago
          ELSE EXTRACT(DOW FROM curr_time)::integer - 1 -- Otherwise, calculate days since last Monday
        END
      );

    UPDATE user_tickets
    SET 
      tickets_remaining = CASE 
        WHEN plan_type = 'free' THEN 300
        WHEN plan_type = 'premium' THEN 3000
        ELSE 300
      END,
      last_reset_at = next_reset
    WHERE user_id = user_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_subscription_activated function
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

-- Update the handle_subscription_renewed function
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

-- Update the sync_subscription_status function
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

-- Trigger a refresh of all active premium subscriptions
UPDATE stripe_subscriptions
SET updated_at = CURRENT_TIMESTAMP
WHERE status = 'active'
  AND deleted_at IS NULL;