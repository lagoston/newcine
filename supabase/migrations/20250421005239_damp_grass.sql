/*
  # Oracle Ticket System

  1. New Tables
    - `user_tickets`
      - `user_id` (uuid, primary key, references auth.users)
      - `tickets_remaining` (integer)
      - `last_reset_at` (timestamp)
      - `plan_type` (text)

  2. Security
    - Enable RLS on user_tickets table
    - Add policies for:
      - Users can only read their own ticket data
      - Only the system can modify ticket data

  3. Functions
    - Function to handle weekly ticket reset
    - Function to initialize tickets for new users
*/

-- Create user_tickets table
CREATE TABLE IF NOT EXISTS user_tickets (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tickets_remaining integer NOT NULL DEFAULT 300 CHECK (tickets_remaining >= 0),
  last_reset_at timestamptz NOT NULL DEFAULT now(),
  plan_type text NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'premium')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_tickets ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can read own ticket data" ON user_tickets;

-- Policy for users to read their own ticket data
CREATE POLICY "Users can read own ticket data"
  ON user_tickets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to initialize tickets for new users
CREATE OR REPLACE FUNCTION initialize_user_tickets()
RETURNS trigger AS $$
BEGIN
  -- Only insert if the user doesn't already have tickets
  INSERT INTO public.user_tickets (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created_tickets ON auth.users;

-- Create trigger to initialize tickets on user signup
CREATE TRIGGER on_auth_user_created_tickets
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION initialize_user_tickets();

-- Function to check and reset tickets if needed
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_input uuid)
RETURNS void AS $$
DECLARE
  user_data user_tickets%ROWTYPE;
  next_reset timestamptz;
BEGIN
  -- Get user ticket data
  SELECT * INTO user_data
  FROM user_tickets
  WHERE user_id = user_id_input;

  -- If user doesn't have tickets yet, create them
  IF NOT FOUND THEN
    INSERT INTO user_tickets (user_id)
    VALUES (user_id_input)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING * INTO user_data;
  END IF;

  -- Calculate next reset time (next Monday)
  next_reset := user_data.last_reset_at + 
    INTERVAL '1 week' - 
    INTERVAL '1 day' * EXTRACT(DOW FROM user_data.last_reset_at) +
    INTERVAL '1 day' * 1;

  -- Reset tickets if it's time
  IF CURRENT_TIMESTAMP >= next_reset THEN
    UPDATE user_tickets
    SET 
      tickets_remaining = CASE 
        WHEN plan_type = 'free' THEN 300
        WHEN plan_type = 'premium' THEN 1000
        ELSE 300
      END,
      last_reset_at = CURRENT_TIMESTAMP
    WHERE user_id = user_id_input;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;