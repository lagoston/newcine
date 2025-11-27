/*
  # Add Oracle Usage Counters

  1. New Columns
    - `oracle_predictions_count` (integer) - Count of predictions made
    - `oracle_recommendations_count` (integer) - Count of recommendations made
  
  2. Changes
    - Add columns to profiles table with default value 0
    - These counters track Oracle feature usage for badge/tag system
  
  3. Notes
    - Counters increment when users use prediction or recommendation features
    - Used for Oracle-themed achievement tags
*/

-- Add oracle usage counters to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS oracle_predictions_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS oracle_recommendations_count INTEGER DEFAULT 0;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_oracle_predictions ON profiles(oracle_predictions_count);
CREATE INDEX IF NOT EXISTS idx_profiles_oracle_recommendations ON profiles(oracle_recommendations_count);
