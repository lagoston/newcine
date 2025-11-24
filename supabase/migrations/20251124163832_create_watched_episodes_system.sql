/*
  # Create watched episodes tracking system

  1. New Table
    - watched_episodes
      - user_id (uuid, references profiles)
      - tmdb_id (integer, TV show ID)
      - season_number (integer)
      - episode_number (integer)
      - watched_at (timestamp)
      - Composite primary key: (user_id, tmdb_id, season_number, episode_number)
  
  2. Security
    - Enable RLS
    - Users can only read/write their own watched episodes
  
  3. Triggers
    - Auto-delete watched episodes when rating is removed
    - Auto-delete when movie is deleted from library
*/

-- Create watched_episodes table
CREATE TABLE IF NOT EXISTS watched_episodes (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  tmdb_id integer NOT NULL,
  season_number integer NOT NULL,
  episode_number integer NOT NULL,
  watched_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, tmdb_id, season_number, episode_number)
);

-- Enable RLS
ALTER TABLE watched_episodes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own watched episodes"
  ON watched_episodes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark episodes as watched"
  ON watched_episodes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unmark watched episodes"
  ON watched_episodes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_watched_episodes_user_movie 
  ON watched_episodes(user_id, tmdb_id);

-- Create trigger function to clear episodes when rating is removed
CREATE OR REPLACE FUNCTION clear_watched_episodes_on_rating_removal()
RETURNS TRIGGER AS $$
BEGIN
  -- If rating was set to NULL or movie was deleted
  IF (TG_OP = 'UPDATE' AND NEW.rating IS NULL AND OLD.rating IS NOT NULL) OR TG_OP = 'DELETE' THEN
    DELETE FROM watched_episodes 
    WHERE user_id = OLD.user_id 
    AND tmdb_id = OLD.movie_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on user_movies
DROP TRIGGER IF EXISTS trigger_clear_episodes_on_rating_removal ON user_movies;
CREATE TRIGGER trigger_clear_episodes_on_rating_removal
  AFTER UPDATE OF rating OR DELETE ON user_movies
  FOR EACH ROW
  EXECUTE FUNCTION clear_watched_episodes_on_rating_removal();