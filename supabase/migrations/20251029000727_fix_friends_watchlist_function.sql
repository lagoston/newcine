/*
  # Fix Friends Watchlist Function

  1. Changes
    - Drop and recreate `get_friends_watchlist_movies` function
    - Correct table structure: user_movies only has movie_id, not movie details
    - Join with movies table to get title and other details
    - Watchlist is identified by rating IS NULL
    - Movie details like poster_path come from frontend TMDB API calls

  2. Function Returns
    - movie_id (from user_movies)
    - title (from movies table)
    - friend_username (from profiles)
    - friend_id (user_id)
*/

DROP FUNCTION IF EXISTS get_friends_watchlist_movies(uuid);

CREATE OR REPLACE FUNCTION get_friends_watchlist_movies(user_id_param uuid)
RETURNS TABLE (
  movie_id integer,
  title text,
  friend_username text,
  friend_id uuid
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH random_friends AS (
    -- Get 3 random friends that the user follows
    SELECT f.following_id
    FROM follows f
    WHERE f.follower_id = user_id_param
    ORDER BY RANDOM()
    LIMIT 3
  ),
  friends_watchlist AS (
    -- Get movies from these friends' watchlists (rating IS NULL means watchlist)
    SELECT DISTINCT ON (um.movie_id)
      um.movie_id,
      m.title,
      p.username as friend_username,
      um.user_id as friend_id
    FROM user_movies um
    JOIN random_friends rf ON um.user_id = rf.following_id
    JOIN profiles p ON um.user_id = p.id
    JOIN movies m ON um.movie_id = m.id
    WHERE um.rating IS NULL
    ORDER BY um.movie_id, RANDOM()
  )
  SELECT 
    fw.movie_id,
    fw.title,
    fw.friend_username,
    fw.friend_id
  FROM friends_watchlist fw
  ORDER BY RANDOM()
  LIMIT 10;
END;
$$;