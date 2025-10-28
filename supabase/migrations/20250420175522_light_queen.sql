/*
  # Add RLS policies for user_tickets table

  1. Security Changes
    - Enable RLS on user_tickets table (if not already enabled)
    - Add policy for authenticated users to read their own tickets
    - Add policy for authenticated users to insert their own tickets
    - Add policy for authenticated users to update their own tickets

  2. Notes
    - Ensures users can only access their own ticket data
    - Allows initial ticket creation for new users
    - Maintains security while enabling necessary functionality
*/

-- Enable RLS if not already enabled
ALTER TABLE user_tickets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read own ticket data" ON user_tickets;
DROP POLICY IF EXISTS "Users can insert own ticket data" ON user_tickets;
DROP POLICY IF EXISTS "Users can update own ticket data" ON user_tickets;

-- Create policy for reading ticket data
CREATE POLICY "Users can read own ticket data"
ON user_tickets
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create policy for inserting ticket data
CREATE POLICY "Users can insert own ticket data"
ON user_tickets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create policy for updating ticket data
CREATE POLICY "Users can update own ticket data"
ON user_tickets
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);