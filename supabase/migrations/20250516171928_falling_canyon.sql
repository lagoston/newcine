/*
  # Fix User Tickets Creation

  1. Changes
     - Add a new RPC function that safely creates user tickets with conflict handling

  2. Bug Fix
     - Addresses the "duplicate key value violates unique constraint user_tickets_pkey" error
     - Makes ticket creation idempotent to avoid race conditions during sign-up
*/

-- Create a new RPC function that safely creates user tickets with conflict handling
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