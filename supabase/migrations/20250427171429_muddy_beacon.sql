-- Add active_tag column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS active_tag jsonb DEFAULT NULL;