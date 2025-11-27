/*
  # Create Movie/TV Reviews System

  1. New Tables
    - `reviews`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `movie_id` (integer, TMDB ID)
      - `media_type` (text, 'movie' or 'tv')
      - `title` (text, review title)
      - `content` (text, review content, max 1500 chars)
      - `has_spoilers` (boolean, marks if contains spoilers)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `reviews` table
    - Users can read all reviews
    - Users can only create/update/delete their own reviews
    - Auto-delete reviews when rating is removed

  3. Constraints
    - One review per user per movie
    - Content max 1500 characters
    - Must have rated the movie to write review
*/

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  movie_id integer NOT NULL,
  media_type text NOT NULL DEFAULT 'movie' CHECK (media_type IN ('movie', 'tv')),
  title text NOT NULL,
  content text NOT NULL CHECK (char_length(content) <= 1500),
  has_spoilers boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, movie_id, media_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_reviews_movie_id ON reviews(movie_id, media_type);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read all reviews
CREATE POLICY "Anyone can read reviews"
  ON reviews
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Users can only insert their own reviews if they rated the movie
CREATE POLICY "Users can create own reviews if rated"
  ON reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM user_movies
      WHERE user_movies.user_id = auth.uid()
      AND user_movies.movie_id = reviews.movie_id
      AND user_movies.rating IS NOT NULL
    )
  );

-- Policy: Users can update their own reviews
CREATE POLICY "Users can update own reviews"
  ON reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own reviews
CREATE POLICY "Users can delete own reviews"
  ON reviews
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_review_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_review_updated_at();

-- Function to auto-delete review when rating is removed or movie is deleted
CREATE OR REPLACE FUNCTION delete_review_on_rating_removal()
RETURNS TRIGGER AS $$
DECLARE
  v_media_type text;
BEGIN
  -- Get media_type from movies table
  SELECT media_type INTO v_media_type
  FROM movies
  WHERE id = OLD.movie_id;

  -- Default to 'movie' if not found
  IF v_media_type IS NULL THEN
    v_media_type := 'movie';
  END IF;

  -- If rating is being set to NULL or row is being deleted
  IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND NEW.rating IS NULL) THEN
    DELETE FROM reviews
    WHERE user_id = OLD.user_id
    AND movie_id = OLD.movie_id
    AND media_type = v_media_type;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-delete reviews when rating is removed
DROP TRIGGER IF EXISTS delete_review_on_rating_removal ON user_movies;
CREATE TRIGGER delete_review_on_rating_removal
  AFTER UPDATE OR DELETE ON user_movies
  FOR EACH ROW
  EXECUTE FUNCTION delete_review_on_rating_removal();

-- Function to get reviews count for a movie
CREATE OR REPLACE FUNCTION get_reviews_count(
  p_movie_id integer,
  p_media_type text DEFAULT 'movie'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM reviews
    WHERE movie_id = p_movie_id
    AND media_type = p_media_type
  );
END;
$$;

-- Function to check if user has reviewed a movie
CREATE OR REPLACE FUNCTION user_has_review(
  p_user_id uuid,
  p_movie_id integer,
  p_media_type text DEFAULT 'movie'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM reviews
    WHERE user_id = p_user_id
    AND movie_id = p_movie_id
    AND media_type = p_media_type
  );
END;
$$;
