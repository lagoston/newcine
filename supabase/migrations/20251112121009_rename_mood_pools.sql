/*
  # Rename Mood Pools

  1. Changes
    - Renomear 'feel-good' para 'adventures' em todas as pools
    - Renomear 'need-to-cry' para 'catharsis' em todas as pools
    - Renomear 'slow-and-calm' para 'drug-trip' em todas as pools
  
  2. Reason
    - Mudanças puramente estéticas nos nomes dos botões
    - Manter consistência entre frontend e backend
*/

-- Renomear feel-good para adventures
UPDATE recommendation_pools
SET mood_key = 'adventures'
WHERE mood_key = 'feel-good';

-- Renomear need-to-cry para catharsis
UPDATE recommendation_pools
SET mood_key = 'catharsis'
WHERE mood_key = 'need-to-cry';

-- Renomear slow-and-calm para drug-trip
UPDATE recommendation_pools
SET mood_key = 'drug-trip'
WHERE mood_key = 'slow-and-calm';

-- Verificar as mudanças
SELECT card_type, mood_key, jsonb_array_length(movie_ids) as movie_count
FROM recommendation_pools
ORDER BY card_type, mood_key;
