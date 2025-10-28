/*
  # Fix Ticket Reset Calculation and Display

  1. Changes
    - Update check_and_reset_tickets function to consistently calculate next_reset
    - Force update all existing user_tickets with correct next_reset values
    - Add proper timezone handling and error prevention for display logic
    - Ensure next_reset is always in the future
    
  2. Security
    - Maintain existing RLS policies
    - No changes to access control
*/

-- Drop the existing function first
DROP FUNCTION IF EXISTS check_and_reset_tickets;

-- Create improved check_and_reset_tickets function with proper next_reset calculation
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_input uuid)
RETURNS void AS $$
DECLARE
  user_data user_tickets%ROWTYPE;
  now_utc timestamptz;
  next_monday timestamptz;
  days_until_monday integer;
BEGIN
  -- Get current UTC time
  now_utc := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  
  -- Get user ticket data
  SELECT * INTO user_data
  FROM user_tickets
  WHERE user_id = user_id_input;

  -- If user doesn't have tickets yet, create them
  IF NOT FOUND THEN
    -- Calculate next Monday at midnight UTC
    days_until_monday := CASE 
      WHEN EXTRACT(DOW FROM now_utc) = 1 THEN 7  -- If today is Monday, next reset is next Monday
      WHEN EXTRACT(DOW FROM now_utc) = 0 THEN 1  -- If today is Sunday, tomorrow is Monday
      ELSE 8 - EXTRACT(DOW FROM now_utc)::integer -- Days until next Monday
    END;
    
    next_monday := date_trunc('day', now_utc + (days_until_monday || ' days')::interval);
    
    INSERT INTO user_tickets (
      user_id,
      tickets_remaining,
      plan_type,
      last_reset_at,
      next_reset
    )
    VALUES (
      user_id_input,
      CASE WHEN EXISTS (SELECT 1 FROM profiles WHERE id = user_id_input AND plan_type = 'premium') 
        THEN 3000 ELSE 300 END,
      COALESCE((SELECT plan_type FROM profiles WHERE id = user_id_input), 'free'),
      now_utc,
      next_monday
    );
    RETURN;
  END IF;

  -- Check if reset is needed
  IF now_utc >= user_data.next_reset OR user_data.next_reset IS NULL THEN
    -- Calculate the most recent passed Monday for last_reset_at
    -- And calculate the next Monday for next_reset
    days_until_monday := CASE 
      WHEN EXTRACT(DOW FROM now_utc) = 1 THEN 7  -- If today is Monday, next reset is next Monday
      WHEN EXTRACT(DOW FROM now_utc) = 0 THEN 1  -- If today is Sunday, tomorrow is Monday
      ELSE 8 - EXTRACT(DOW FROM now_utc)::integer -- Days until next Monday
    END;
    
    next_monday := date_trunc('day', now_utc + (days_until_monday || ' days')::interval);
    
    UPDATE user_tickets
    SET 
      tickets_remaining = CASE 
        WHEN plan_type = 'premium' THEN 3000
        ELSE 300
      END,
      last_reset_at = now_utc,
      next_reset = next_monday
    WHERE user_id = user_id_input;
  END IF;
  
  -- If next_reset is somehow in the past (shouldn't happen but for safety)
  -- Fix it by setting to next Monday
  IF user_data.next_reset IS NULL OR user_data.next_reset <= now_utc THEN
    days_until_monday := CASE 
      WHEN EXTRACT(DOW FROM now_utc) = 1 THEN 7  -- If today is Monday, next reset is next Monday
      WHEN EXTRACT(DOW FROM now_utc) = 0 THEN 1  -- If today is Sunday, tomorrow is Monday
      ELSE 8 - EXTRACT(DOW FROM now_utc)::integer -- Days until next Monday
    END;
    
    next_monday := date_trunc('day', now_utc + (days_until_monday || ' days')::interval);
    
    UPDATE user_tickets
    SET next_reset = next_monday
    WHERE user_id = user_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Force update all user_tickets with correct next_reset
DO $$
DECLARE
  now_utc timestamptz := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  next_monday timestamptz;
  days_until_monday integer;
BEGIN
  -- Calculate days until next Monday
  days_until_monday := CASE 
    WHEN EXTRACT(DOW FROM now_utc) = 1 THEN 7  -- If today is Monday, next reset is next Monday
    WHEN EXTRACT(DOW FROM now_utc) = 0 THEN 1  -- If today is Sunday, tomorrow is Monday
    ELSE 8 - EXTRACT(DOW FROM now_utc)::integer -- Days until next Monday
  END;
  
  -- Calculate next Monday at midnight UTC
  next_monday := date_trunc('day', now_utc + (days_until_monday || ' days')::interval);
  
  -- Update all user_tickets with null or past next_reset
  UPDATE user_tickets
  SET next_reset = next_monday
  WHERE next_reset IS NULL OR next_reset <= now_utc;
END $$;