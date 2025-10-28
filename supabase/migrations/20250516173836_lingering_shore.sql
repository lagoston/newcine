/*
  # Fix User Tickets Creation Functions

  1. Changes
     - Recreate the create_user_tickets_safely function with proper definition
     - Fix the handle_new_user trigger to properly call the function
     - Ensure check_and_reset_tickets function properly handles ticket creation

  2. Bug Fix
     - Addresses the "function create_user_tickets_safely(uuid) does not exist" error
     - Fixes the user sign-up process by ensuring ticket creation works properly
     - Makes function definitions more robust
*/

-- First, create the function that safely creates user tickets
CREATE OR REPLACE FUNCTION public.create_user_tickets_safely(user_id_input UUID)
RETURNS VOID AS $$
BEGIN
  -- Try to insert new user tickets, but do nothing if they already exist
  INSERT INTO public.user_tickets (
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

-- Now fix the handle_new_user trigger to properly use the function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the function directly in the trigger
  PERFORM public.create_user_tickets_safely(NEW.id);
  
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

-- Fix the check_and_reset_tickets function
CREATE OR REPLACE FUNCTION public.check_and_reset_tickets(user_id_input UUID)
RETURNS VOID AS $$
DECLARE
  last_reset timestamp with time zone;
  next_reset timestamp with time zone;
  current_time timestamp with time zone := now();
  current_plan text;
BEGIN
  -- First call create_user_tickets_safely to ensure tickets exist
  PERFORM public.create_user_tickets_safely(user_id_input);
  
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