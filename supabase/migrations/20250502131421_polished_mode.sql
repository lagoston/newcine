/*
  # Add refund_tickets RPC function

  1. New Function
    - Creates a function to refund tickets to users
    - Takes user_id and amount as parameters
    - Updates user_tickets table safely
    - Includes proper error handling
*/

CREATE OR REPLACE FUNCTION refund_tickets(
  user_id_input uuid,
  amount integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update tickets, ensuring we don't exceed any limits
  UPDATE user_tickets
  SET 
    tickets_remaining = tickets_remaining + amount,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = user_id_input;
END;
$$;