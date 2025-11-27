/*
  # Add user rating to reviews

  1. Changes
    - Add `rating` column to `reviews` table
    - This stores the user's rating at the time of review creation
    - Rating is copied from user_movies table

  2. Notes
    - Rating is stored in reviews for historical purposes
    - Even if user changes their rating later, review keeps original
*/

-- Add rating column to reviews
ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS rating integer CHECK (rating >= 0 AND rating <= 10);

-- Update existing reviews with current ratings
UPDATE reviews r
SET rating = um.rating
FROM user_movies um
WHERE r.user_id = um.user_id
AND r.movie_id = um.movie_id
AND r.rating IS NULL;

COMMENT ON COLUMN reviews.rating IS 'User rating at time of review (0-10)';
