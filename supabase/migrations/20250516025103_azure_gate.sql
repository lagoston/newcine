/*
  # Change Ticket Reset From Weekly to Monthly

  1. Changes
    - Update check_and_reset_tickets function to use monthly reset instead of weekly
    - Set next reset to be one month from now for existing users
    - For new users, base reset date on account creation date
    - Reset countdown when user switches between free/premium plans

  2. Notes
    - Existing user tickets will reset one month from today
    - New users will get their first reset one month after registration
    - When switching plans, reset counter starts again
*/

-- Drop existing check_and_reset_tickets function
DROP FUNCTION IF EXISTS check_and_reset_tickets;

-- Create updated check_and_reset_tickets function with monthly reset
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_input uuid)
RETURNS void AS $$
DECLARE
  user_data user_tickets%ROWTYPE;
  now_utc timestamptz;
  next_reset_date timestamptz;
  plan_changed boolean := false;
BEGIN
  -- Get current UTC time
  now_utc := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  
  -- Get user ticket data
  SELECT * INTO user_data
  FROM user_tickets
  WHERE user_id = user_id_input;

  -- If user doesn't have tickets yet, create them with reset in one month
  IF NOT FOUND THEN
    -- Set next reset to one month from now
    next_reset_date := date_trunc('day', now_utc + interval '1 month');
    
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
      next_reset_date
    );
    RETURN;
  END IF;

  -- Check if we need to reset tickets
  IF now_utc >= user_data.next_reset OR user_data.next_reset IS NULL THEN
    -- Calculate next reset (one month from now)
    next_reset_date := date_trunc('day', now_utc + interval '1 month');
    
    -- Reset tickets
    UPDATE user_tickets
    SET 
      tickets_remaining = CASE 
        WHEN plan_type = 'premium' THEN 3000
        ELSE 300
      END,
      last_reset_at = now_utc,
      next_reset = next_reset_date
    WHERE user_id = user_id_input;
  END IF;
  
  -- Safety check - if next_reset is somehow invalid, fix it
  IF user_data.next_reset IS NULL OR user_data.next_reset <= now_utc THEN
    next_reset_date := date_trunc('day', now_utc + interval '1 month');
    
    UPDATE user_tickets
    SET next_reset = next_reset_date
    WHERE user_id = user_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update handle_new_user function to use monthly reset
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  username_from_metadata text;
  final_username text;
  next_reset_date timestamptz;
BEGIN
  -- Log function execution
  RAISE LOG 'handle_new_user executing for user ID: %', new.id;

  -- Get username from metadata or generate one
  username_from_metadata := (new.raw_user_meta_data->>'username')::text;
  
  IF username_from_metadata IS NOT NULL AND length(username_from_metadata) > 0 THEN
    final_username := username_from_metadata;
  ELSE
    final_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;
  
  -- Create profile record
  BEGIN
    INSERT INTO profiles (
      id, 
      username, 
      created_at, 
      updated_at,
      plan_type,
      avatar_frame,
      banner
    ) VALUES (
      new.id,
      final_username,
      now(),
      now(),
      'free',
      '',
      ''
    );
    RAISE LOG 'Profile created for user ID: %', new.id;
  EXCEPTION WHEN unique_violation THEN
    -- If profile already exists (e.g. username taken), generate a unique one
    final_username := 'user_' || substr(new.id::text, 1, 12);
    
    INSERT INTO profiles (
      id, 
      username, 
      created_at, 
      updated_at,
      plan_type,
      avatar_frame,
      banner
    ) VALUES (
      new.id,
      final_username,
      now(),
      now(),
      'free',
      '',
      ''
    );
    RAISE LOG 'Profile created with alternate username for user ID: %', new.id;
  END;
  
  -- Calculate next reset date (one month from now)
  next_reset_date := date_trunc('day', now() + interval '1 month');
  
  -- Create user_tickets record
  BEGIN
    INSERT INTO user_tickets (
      user_id,
      tickets_remaining,
      last_reset_at,
      next_reset,
      plan_type,
      created_at,
      updated_at
    ) VALUES (
      new.id,
      300,
      now(),
      next_reset_date,
      'free',
      now(),
      now()
    );
    RAISE LOG 'Tickets initialized for user ID: %', new.id;
  EXCEPTION WHEN unique_violation THEN
    -- If tickets already exist, update them
    UPDATE user_tickets
    SET 
      tickets_remaining = 300,
      last_reset_at = now(),
      next_reset = next_reset_date,
      updated_at = now()
    WHERE user_id = new.id;
    RAISE LOG 'Tickets updated for existing user ID: %', new.id;
  END;
  
  RETURN new;
EXCEPTION WHEN others THEN
  -- Comprehensive error logging
  RAISE LOG 'Error in handle_new_user: % (STATE: %, CONTEXT: %)', 
    SQLERRM, SQLSTATE, SQLCONTEXT;
  -- Still return new to avoid blocking auth flow
  RETURN new;
END;
$$;

-- Update handle_subscription_activated for plan changes
CREATE OR REPLACE FUNCTION handle_subscription_activated()
RETURNS trigger AS $$
DECLARE
  now_utc timestamptz := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  next_reset_date timestamptz := date_trunc('day', now_utc + interval '1 month');
  affected_user_id uuid;
BEGIN
  -- Get the affected user_id
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id
    AND deleted_at IS NULL;

  IF affected_user_id IS NULL THEN
    RAISE LOG 'No user found for customer_id: %', NEW.customer_id;
    RETURN NEW;
  END IF;

  -- Update both profiles and tickets atomically
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now_utc
  WHERE id = affected_user_id;

  -- Reset tickets and set new reset date when becoming premium
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = 3000,
    last_reset_at = now_utc,
    next_reset = next_reset_date,
    updated_at = now_utc
  WHERE user_id = affected_user_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_subscription_activated: %', SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update handle_subscription_canceled for plan changes
CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger AS $$
DECLARE
  now_utc timestamptz := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  next_reset_date timestamptz := date_trunc('day', now_utc + interval '1 month');
  affected_user_id uuid;
  affected_rows integer;
  log_message text;
BEGIN
  -- Get the affected user_id
  SELECT user_id INTO affected_user_id
  FROM stripe_customers
  WHERE customer_id = NEW.customer_id
    AND deleted_at IS NULL;

  IF affected_user_id IS NULL THEN
    RAISE LOG 'Error: No active user found for customer_id=% subscription_id=%',
      NEW.customer_id, NEW.subscription_id;
    RETURN NEW;
  END IF;

  -- Update profiles
  UPDATE profiles
  SET 
    plan_type = 'free',
    updated_at = now_utc
  WHERE id = affected_user_id
  RETURNING id INTO affected_user_id;

  -- Reset tickets and set new reset date when downgrading to free
  UPDATE user_tickets
  SET 
    plan_type = 'free',
    tickets_remaining = LEAST(tickets_remaining, 300),
    last_reset_at = now_utc,
    next_reset = next_reset_date,
    updated_at = now_utc
  WHERE user_id = affected_user_id
  RETURNING user_id INTO affected_user_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS log_message = PG_EXCEPTION_DETAIL;
  RAISE LOG 'Critical error in handle_subscription_canceled: % (Detail: %)',
    SQLERRM, log_message;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update all existing user tickets to reset one month from today
DO $$
DECLARE
  now_utc timestamptz := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  next_reset_date timestamptz := date_trunc('day', now_utc + interval '1 month');
BEGIN
  -- Update all existing user tickets
  UPDATE user_tickets
  SET next_reset = next_reset_date
  WHERE true;
  
  RAISE LOG 'Updated all user tickets to reset on %', next_reset_date;
END $$;