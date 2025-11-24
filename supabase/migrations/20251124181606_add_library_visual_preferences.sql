/*
  # Add library visual preferences

  1. Changes
    - Add tv_order column to profiles (auto, first, last)
    - Add chroma_box_enabled column to profiles (boolean)
    
  2. Purpose
    - tv_order: Controls series placement in rating boxes
      - 'auto': Mixed order (default)
      - 'first': Series appear before movies
      - 'last': Series appear after movies
    - chroma_box_enabled: Activates color-coded rating boxes
      - 10: Gold shimmer
      - 9-7: Green tones
      - 6-4: Yellow tones
      - 3-1: Red tones
      - 0: Gray with glitch effect
*/

-- Add tv_order preference
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tv_order text DEFAULT 'auto' CHECK (tv_order IN ('auto', 'first', 'last'));

-- Add chroma box preference
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS chroma_box_enabled boolean DEFAULT false;

-- Add comment
COMMENT ON COLUMN profiles.tv_order IS 'Controls TV series ordering in library: auto (mixed), first (before movies), last (after movies)';
COMMENT ON COLUMN profiles.chroma_box_enabled IS 'Enables color-coded rating boxes with visual effects';