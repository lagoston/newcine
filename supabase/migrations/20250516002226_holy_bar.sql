-- Drop existing check_and_reset_tickets function (if exists)
DROP FUNCTION IF EXISTS check_and_reset_tickets;

-- Create a completely rewritten function with proper next_reset calculation
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
    
    -- Create user tickets with proper next_reset
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

  -- Check if we need to reset tickets
  IF now_utc >= user_data.next_reset OR user_data.next_reset IS NULL THEN
    -- Calculate the next Monday
    days_until_monday := CASE 
      WHEN EXTRACT(DOW FROM now_utc) = 1 THEN 7  -- If today is Monday, next reset is next Monday
      WHEN EXTRACT(DOW FROM now_utc) = 0 THEN 1  -- If today is Sunday, tomorrow is Monday
      ELSE 8 - EXTRACT(DOW FROM now_utc)::integer -- Days until next Monday
    END;
    
    next_monday := date_trunc('day', now_utc + (days_until_monday || ' days')::interval);
    
    -- Reset tickets
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
  
  -- Safety check - if next_reset is somehow invalid, fix it
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

-- Force update all existing user_tickets with correct next_reset timestamps
DO $$
DECLARE
  now_utc timestamptz := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  next_monday timestamptz;
  days_until_monday integer;
  rec record;
BEGIN
  -- Calculate days until next Monday
  days_until_monday := CASE 
    WHEN EXTRACT(DOW FROM now_utc) = 1 THEN 7  -- If today is Monday, next reset is next Monday
    WHEN EXTRACT(DOW FROM now_utc) = 0 THEN 1  -- If today is Sunday, tomorrow is Monday
    ELSE 8 - EXTRACT(DOW FROM now_utc)::integer -- Days until next Monday
  END;
  
  -- Calculate next Monday at midnight UTC
  next_monday := date_trunc('day', now_utc + (days_until_monday || ' days')::interval);
  
  -- Update all user_tickets with proper next_reset
  UPDATE user_tickets 
  SET next_reset = next_monday
  WHERE next_reset IS NULL OR next_reset <= now_utc;
  
  -- Also update all user tickets with negative reset times
  UPDATE user_tickets
  SET last_reset_at = now_utc - INTERVAL '1 day'
  WHERE next_reset < now_utc;
END $$;