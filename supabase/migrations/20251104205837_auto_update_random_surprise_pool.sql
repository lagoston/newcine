/*
  # Auto-update Random Surprise Pool

  1. New Functions
    - `update_random_surprise_pool()` - Função que atualiza automaticamente a pool random-surprise
      quando qualquer outra pool do mesmo personagem é modificada
  
  2. New Triggers
    - `trigger_update_random_surprise` - Dispara após INSERT ou UPDATE em recommendation_pools
    - Atualiza random-surprise com união de todos os filmes das outras 9 pools do personagem
  
  3. Behavior
    - Quando adicionar/remover filmes de qualquer pool, random-surprise é atualizada automaticamente
    - Random-surprise sempre contém todos os filmes únicos de todas as outras pools do personagem
*/

-- Função para atualizar random-surprise automaticamente
CREATE OR REPLACE FUNCTION update_random_surprise_pool()
RETURNS TRIGGER AS $$
BEGIN
  -- Se a pool modificada é random-surprise, não fazer nada (evitar loop)
  IF NEW.mood_key = 'random-surprise' THEN
    RETURN NEW;
  END IF;

  -- Atualizar a pool random-surprise do mesmo personagem
  -- Reunindo todos os movie_ids únicos de todas as outras pools
  UPDATE recommendation_pools
  SET movie_ids = (
    SELECT COALESCE(
      jsonb_agg(DISTINCT movie_id ORDER BY movie_id),
      '[]'::jsonb
    )
    FROM (
      SELECT jsonb_array_elements_text(movie_ids)::integer AS movie_id
      FROM recommendation_pools
      WHERE card_type = NEW.card_type
        AND mood_key != 'random-surprise'
    ) AS all_movies
  )
  WHERE card_type = NEW.card_type
    AND mood_key = 'random-surprise';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para executar após INSERT ou UPDATE
DROP TRIGGER IF EXISTS trigger_update_random_surprise ON recommendation_pools;

CREATE TRIGGER trigger_update_random_surprise
  AFTER INSERT OR UPDATE OF movie_ids
  ON recommendation_pools
  FOR EACH ROW
  EXECUTE FUNCTION update_random_surprise_pool();

-- Popular random-surprise inicial para todos os personagens
UPDATE recommendation_pools
SET movie_ids = (
  SELECT COALESCE(
    jsonb_agg(DISTINCT movie_id ORDER BY movie_id),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_array_elements_text(rp.movie_ids)::integer AS movie_id
    FROM recommendation_pools rp
    WHERE rp.card_type = recommendation_pools.card_type
      AND rp.mood_key != 'random-surprise'
  ) AS all_movies
)
WHERE mood_key = 'random-surprise';
