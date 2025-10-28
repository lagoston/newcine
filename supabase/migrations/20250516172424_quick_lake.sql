/*
  # Fix User Tickets Creation Race Condition

  1. Changes
     - Add a new trigger to handle the case when multiple mechanisms try to create user tickets
     - Update handle_new_user trigger to use create_user_tickets_safely RPC

  2. Bug Fix
     - Addresses the "duplicate key value violates unique constraint user_tickets_pkey" error
     - Ensures only one ticket creation happens per user
     - Makes the entire user creation process more resilient
*/

-- Modify handle_new_user trigger to use the create_user_tickets_safely RPC function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Use the safe RPC function instead of direct INSERT
  PERFORM create_user_tickets_safely(NEW.id);
  
  -- Insert into profiles remains the same
  INSERT INTO public.profiles (id, username, avatar_url, bio)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    '',
    ''
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if create_user_tickets_safely RPC needs any fixes
CREATE OR REPLACE FUNCTION create_user_tickets_safely(user_id_input UUID)
RETURNS VOID AS $$
BEGIN
  -- Try to insert new user tickets, but do nothing if they already exist (ON CONFLICT)
  INSERT INTO user_tickets (
    user_id,
    plan_type,
    tickets_remaining,
    last_reset_at,
    next_reset
  )
  VALUES (
    user_id_input,
    'free',
    300,
    now(),
    (now() + interval '30 days')
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check and reset tickets if needed
-- This gives a single source of truth for ticket management
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_input UUID)
RETURNS VOID AS $$
DECLARE
  last_reset timestamp with time zone;
  next_reset timestamp with time zone;
  current_time timestamp with time zone := now();
  current_plan text;
BEGIN
  -- First call create_user_tickets_safely to ensure tickets exist
  PERFORM create_user_tickets_safely(user_id_input);
  
  -- Get the reset data
  SELECT 
    user_tickets.last_reset_at, 
    user_tickets.next_reset,
    user_tickets.plan_type
  INTO 
    last_reset, 
    next_reset,
    current_plan
  FROM 
    user_tickets
  WHERE 
    user_id = user_id_input;
  
  -- Check if it's time to reset
  IF next_reset IS NOT NULL AND current_time >= next_reset THEN
    -- Reset tickets based on plan type
    UPDATE user_tickets 
    SET 
      tickets_remaining = CASE 
        WHEN current_plan = 'premium' THEN 900
        ELSE 300
      END,
      last_reset_at = current_time,
      next_reset = current_time + interval '30 days'
    WHERE 
      user_id = user_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;