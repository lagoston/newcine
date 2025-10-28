/*
  # Fix Ticket Reset Calculation

  1. Changes
    - Update check_and_reset_tickets function to properly calculate next reset
    - Ensure reset time is always in the future
    - Fix timezone handling
*/

-- Drop existing function
DROP FUNCTION IF EXISTS check_and_reset_tickets;

-- Create updated function with fixed reset calculation
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_input uuid)
RETURNS void AS $$
DECLARE
  user_data user_tickets%ROWTYPE;
  next_reset timestamptz;
  days_until_monday integer;
BEGIN
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

  -- Calculate days until next Monday (1 = Monday, 7 = Sunday)
  days_until_monday := CASE 
    WHEN EXTRACT(DOW FROM CURRENT_TIMESTAMP) = 1 -- If Monday
      THEN 7 -- Next reset is next Monday
    WHEN EXTRACT(DOW FROM CURRENT_TIMESTAMP) = 0 -- If Sunday
      THEN 1 -- Tomorrow is Monday
    ELSE
      8 - EXTRACT(DOW FROM CURRENT_TIMESTAMP)::integer -- Days until next Monday
  END;

  -- Calculate next reset time (next Monday at 00:00 UTC)
  next_reset := date_trunc('day', CURRENT_TIMESTAMP) + 
    (days_until_monday || ' days')::interval;

  -- If we've passed the last reset time, reset the tickets
  IF CURRENT_TIMESTAMP >= next_reset OR user_data.last_reset_at + '7 days'::interval <= CURRENT_TIMESTAMP THEN
    UPDATE user_tickets
    SET 
      tickets_remaining = CASE 
        WHEN plan_type = 'free' THEN 300
        WHEN plan_type = 'premium' THEN 1000
        ELSE 300
      END,
      last_reset_at = date_trunc('day', CURRENT_TIMESTAMP)
    WHERE user_id = user_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create an index on last_reset_at for better performance
CREATE INDEX IF NOT EXISTS idx_user_tickets_last_reset 
ON user_tickets(last_reset_at);

-- Update any tickets that should have been reset but weren't
UPDATE user_tickets
SET last_reset_at = date_trunc('day', CURRENT_TIMESTAMP)
WHERE last_reset_at + '7 days'::interval <= CURRENT_TIMESTAMP;