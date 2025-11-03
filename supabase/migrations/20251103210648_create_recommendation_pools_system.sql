/*
  # Sistema de Pools de Recomendação

  1. Novas Tabelas
    - `recommendation_pools`: 27 pools pré-selecionadas (3 cartas × 9 humores)
      - `id` (uuid, primary key)
      - `card_type` (text): 'bogart', 'fincher', 'cypher'
      - `mood_key` (text): identificador do humor
      - `movie_ids` (jsonb): array de IDs de filmes do TMDB
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `user_recommendation_history`: histórico de recomendações por usuário
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `movie_id` (integer): ID do filme recomendado
      - `card_type` (text)
      - `mood_key` (text)
      - `created_at` (timestamptz)
      - Índice único para evitar duplicatas

  2. Security
    - Enable RLS em ambas tabelas
    - Políticas para leitura/escrita apropriadas
*/

-- Create recommendation_pools table
CREATE TABLE IF NOT EXISTS recommendation_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_type text NOT NULL CHECK (card_type IN ('bogart', 'fincher', 'cypher')),
  mood_key text NOT NULL,
  movie_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(card_type, mood_key)
);

-- Create user_recommendation_history table
CREATE TABLE IF NOT EXISTS user_recommendation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id integer NOT NULL,
  card_type text NOT NULL,
  mood_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, movie_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_recommendation_history_user 
  ON user_recommendation_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_pools_card_mood 
  ON recommendation_pools(card_type, mood_key);

-- Enable RLS
ALTER TABLE recommendation_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_recommendation_history ENABLE ROW LEVEL SECURITY;

-- Policies for recommendation_pools (read-only for authenticated users)
CREATE POLICY "Anyone can read recommendation pools"
  ON recommendation_pools FOR SELECT
  TO authenticated
  USING (true);

-- Policies for user_recommendation_history
CREATE POLICY "Users can read own recommendation history"
  ON user_recommendation_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recommendation history"
  ON user_recommendation_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Function to get available movies for recommendation
CREATE OR REPLACE FUNCTION get_available_movies_for_recommendation(
  p_user_id uuid,
  p_card_type text,
  p_mood_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_movies jsonb;
  v_library_movies integer[];
  v_recommended_movies integer[];
  v_available_movies jsonb;
BEGIN
  -- Get pool movies
  SELECT movie_ids INTO v_pool_movies
  FROM recommendation_pools
  WHERE card_type = p_card_type AND mood_key = p_mood_key;

  IF v_pool_movies IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Get user's library movies
  SELECT COALESCE(array_agg(movie_id), ARRAY[]::integer[])
  INTO v_library_movies
  FROM user_movies
  WHERE user_id = p_user_id;

  -- Get already recommended movies
  SELECT COALESCE(array_agg(movie_id), ARRAY[]::integer[])
  INTO v_recommended_movies
  FROM user_recommendation_history
  WHERE user_id = p_user_id;

  -- Filter out library and recommended movies
  SELECT jsonb_agg(movie_id)
  INTO v_available_movies
  FROM jsonb_array_elements_text(v_pool_movies) AS movie_id
  WHERE movie_id::integer != ALL(v_library_movies)
    AND movie_id::integer != ALL(v_recommended_movies);

  RETURN COALESCE(v_available_movies, '[]'::jsonb);
END;
$$;

-- Function to record recommendation
CREATE OR REPLACE FUNCTION record_recommendation(
  p_user_id uuid,
  p_movie_id integer,
  p_card_type text,
  p_mood_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_recommendation_history (user_id, movie_id, card_type, mood_key)
  VALUES (p_user_id, p_movie_id, p_card_type, p_mood_key)
  ON CONFLICT (user_id, movie_id) DO NOTHING;
END;
$$;