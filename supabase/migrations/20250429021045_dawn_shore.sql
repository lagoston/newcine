/*
  # Add frame_id to profiles table

  1. Changes
    - Add frame_id column to profiles table
    - Set default frame to 'default'
    - Allow null values for backward compatibility
*/

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS frame_id text DEFAULT 'default';