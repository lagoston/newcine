/*
  # Add card_style column to profiles table

  1. Changes
    - Add `card_style` column to `profiles` table
    - Default value is 'default'
    - Premium users can use 'yugioh' style

  2. Notes
    - This controls which oracle card design to show in recommendations
    - Cards category is now available in Customize Profile
*/

-- Add card_style column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS card_style text DEFAULT 'default' CHECK (card_style IN ('default', 'yugioh'));

-- Add comment
COMMENT ON COLUMN profiles.card_style IS 'Oracle recommendation card style (default or yugioh)';