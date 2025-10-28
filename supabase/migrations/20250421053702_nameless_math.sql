/*
  # Fix Ticket Reset Calculation

  1. Changes
    - Fix syntax error with current_time variable
    - Improve reset time calculation logic
    - Add helper function for next reset calculation
    - Ensure consistent UTC timezone handling
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS check_and_reset_tickets;
DROP FUNCTION IF EXISTS get_next_reset_time;

-- Create updated function with fixed reset calculation
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
        WHEN plan_type = 'premium' THEN 1000
        ELSE 300
      END,
      last_reset_at = next_reset
    WHERE user_id = user_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to get next reset time
CREATE OR REPLACE FUNCTION get_next_reset_time(last_reset timestamptz)
RETURNS timestamptz AS $$
DECLARE
  next_reset timestamptz;
BEGIN
  -- Calculate next reset time (next Monday at 00:00 UTC)
  next_reset := last_reset + 
    CASE
      -- If last reset was on Monday, add 7 days
      WHEN EXTRACT(DOW FROM last_reset) = 1 THEN INTERVAL '7 days'
      -- Otherwise, calculate days until next Monday
      ELSE (INTERVAL '1 day' * (8 - EXTRACT(DOW FROM last_reset)::integer))
    END;

  -- Ensure next_reset is at midnight UTC
  RETURN date_trunc('day', next_reset);
END;
$$ LANGUAGE plpgsql IMMUTABLE;