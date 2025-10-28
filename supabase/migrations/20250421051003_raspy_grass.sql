/*
  # Fix Ticket Reset Calculation

  1. Changes
    - Update check_and_reset_tickets function to handle timezone and reset timing correctly
    - Ensure next reset calculation is always positive
    - Add better handling of edge cases
*/

-- Drop existing function
DROP FUNCTION IF EXISTS check_and_reset_tickets;

-- Create updated function with fixed reset calculation
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_input uuid)
RETURNS void AS $$
DECLARE
  user_data user_tickets%ROWTYPE;
  next_reset timestamptz;
  current_dow integer;
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

  -- Get current day of week (0 = Sunday, 1 = Monday, etc)
  current_dow := EXTRACT(DOW FROM CURRENT_TIMESTAMP);

  -- Calculate days until next Monday
  -- If today is Monday (1), next reset is in 7 days
  -- Otherwise, calculate days until next Monday
  next_reset := user_data.last_reset_at + 
    CASE 
      WHEN current_dow = 1 THEN INTERVAL '7 days'
      WHEN current_dow = 0 THEN INTERVAL '1 day'
      ELSE INTERVAL '1 day' * (8 - current_dow)
    END;

  -- Set time to midnight UTC
  next_reset := date_trunc('day', next_reset) + INTERVAL '0 hours';

  -- Reset tickets if it's time
  IF CURRENT_TIMESTAMP >= next_reset THEN
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