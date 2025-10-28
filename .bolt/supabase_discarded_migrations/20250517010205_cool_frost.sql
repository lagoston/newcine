-- Fix premium status for specific user
DO $$
DECLARE
  user_id_to_fix uuid := '67e1f0c1-585a-40b5-a871-c7cd2f473838';
  customer_id_record text;
  profile_plan text;
  tickets_plan text;
  tickets_remaining int;
BEGIN
  -- Log start of fix
  RAISE NOTICE 'Starting premium fix for user %', user_id_to_fix;
  
  -- Check current status
  SELECT plan_type INTO profile_plan
  FROM profiles
  WHERE id = user_id_to_fix;
  
  SELECT plan_type, tickets_remaining INTO tickets_plan, tickets_remaining
  FROM user_tickets
  WHERE user_id = user_id_to_fix;
  
  RAISE NOTICE 'Current status - Profile: %, Tickets: % (count: %)', 
    profile_plan, tickets_plan, tickets_remaining;
    
  -- Get customer ID if it exists
  SELECT customer_id INTO customer_id_record
  FROM stripe_customers
  WHERE user_id = user_id_to_fix;
  
  -- 1. Update profile to premium
  UPDATE profiles
  SET 
    plan_type = 'premium',
    updated_at = now()
  WHERE id = user_id_to_fix;
  
  -- 2. Update user_tickets to premium with at least 3000 tickets
  UPDATE user_tickets
  SET 
    plan_type = 'premium',
    tickets_remaining = GREATEST(tickets_remaining, 3000),
    updated_at = now()
  WHERE user_id = user_id_to_fix;
  
  -- 3. If customer record exists, ensure subscription is active
  IF customer_id_record IS NOT NULL THEN
    RAISE NOTICE 'Found customer ID: %', customer_id_record;
    
    -- Check if subscription exists
    IF EXISTS (SELECT 1 FROM stripe_subscriptions WHERE customer_id = customer_id_record) THEN
      -- Update existing subscription
      UPDATE stripe_subscriptions
      SET 
        status = 'active',
        updated_at = now()
      WHERE customer_id = customer_id_record;
      
      RAISE NOTICE 'Updated subscription status to active';
    ELSE
      -- Create a new placeholder subscription record
      INSERT INTO stripe_subscriptions (
        customer_id,
        subscription_id,
        status,
        price_id
      ) VALUES (
        customer_id_record,
        'manual_activation_' || now()::text,
        'active',
        'price_1RKUv4ElYXeJYKCBpd7qimYp' -- Default to yearly price
      );
      
      RAISE NOTICE 'Created new placeholder subscription record';
    END IF;
  END IF;
  
  -- 4. Verify the changes
  SELECT plan_type INTO profile_plan
  FROM profiles
  WHERE id = user_id_to_fix;
  
  SELECT plan_type, tickets_remaining INTO tickets_plan, tickets_remaining
  FROM user_tickets
  WHERE user_id = user_id_to_fix;
  
  RAISE NOTICE 'Updated status - Profile: %, Tickets: % (count: %)', 
    profile_plan, tickets_plan, tickets_remaining;
    
  RAISE NOTICE 'Premium fix completed successfully for user %', user_id_to_fix;
END $$;