/*
  # Sistema de Espectrograma Cinematográfico - Fase 1 (Backend)

  ## Objetivo
  Calcular e armazenar pontuação dos usuários nos 5 Espectros baseado em avaliações de filmes.

  ## Espectros
  - E (Emocional)
  - I (Intelectual)
  - C (Cultural)
  - S (Sensorial)
  - R (Recreativo)

  ## Novas Colunas em profiles
  1. pontos_e (numeric) - Total de pontos Emocionais
  2. pontos_i (numeric) - Total de pontos Intelectuais
  3. pontos_c (numeric) - Total de pontos Culturais
  4. pontos_s (numeric) - Total de pontos Sensoriais
  5. pontos_r (numeric) - Total de pontos Recreativos
  6. arquetipo_primario (text) - Espectro com mais pontos (E/I/C/S/R)
  7. arquetipo_secundario (text) - Espectro com segundo maior pontos

  ## Lógica
  - Multiplicador de Nota: (nota - 5.0) / 5.0
  - Matriz Gênero-Espectro: Cada gênero distribui 5 pontos base
  - Cálculo: Pontos Base × Multiplicador para cada gênero do filme
*/

-- 1. Adicionar colunas ao profiles
DO $$
BEGIN
  -- Pontos dos 5 Espectros
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pontos_e') THEN
    ALTER TABLE profiles ADD COLUMN pontos_e numeric DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pontos_i') THEN
    ALTER TABLE profiles ADD COLUMN pontos_i numeric DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pontos_c') THEN
    ALTER TABLE profiles ADD COLUMN pontos_c numeric DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pontos_s') THEN
    ALTER TABLE profiles ADD COLUMN pontos_s numeric DEFAULT 0 NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pontos_r') THEN
    ALTER TABLE profiles ADD COLUMN pontos_r numeric DEFAULT 0 NOT NULL;
  END IF;
  
  -- Arquétipos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'arquetipo_primario') THEN
    ALTER TABLE profiles ADD COLUMN arquetipo_primario text DEFAULT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'arquetipo_secundario') THEN
    ALTER TABLE profiles ADD COLUMN arquetipo_secundario text DEFAULT NULL;
  END IF;
END $$;

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_profiles_pontos ON profiles(pontos_e, pontos_i, pontos_c, pontos_s, pontos_r);
CREATE INDEX IF NOT EXISTS idx_profiles_arquetipos ON profiles(arquetipo_primario, arquetipo_secundario);

-- 3. Função helper para mapear gêneros TMDB para pontos base
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz Gênero-Espectro (cada gênero distribui 5 pontos)
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 4.0
      WHEN 'Comedy' THEN 1.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 1.0
      WHEN 'Horror' THEN 2.0
      WHEN 'Fantasy' THEN 1.0
      WHEN 'Romance' THEN 4.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 1.0
      WHEN 'War' THEN 2.0
      WHEN 'Animation' THEN 1.0
      ELSE 0.0
    END as e,
    CASE genre_name
      WHEN 'Drama' THEN 1.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 1.0
      WHEN 'Science Fiction' THEN 3.0
      WHEN 'Thriller' THEN 3.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 4.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 1.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      ELSE 0.0
    END as i,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 1.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 5.0
      WHEN 'History' THEN 3.0
      WHEN 'War' THEN 2.0
      WHEN 'Animation' THEN 0.0
      ELSE 0.0
    END as c,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 4.0
      WHEN 'Adventure' THEN 1.0
      WHEN 'Science Fiction' THEN 1.0
      WHEN 'Thriller' THEN 1.0
      WHEN 'Horror' THEN 3.0
      WHEN 'Fantasy' THEN 1.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 1.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 1.0
      WHEN 'Animation' THEN 2.0
      ELSE 0.0
    END as s,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 4.0
      WHEN 'Action' THEN 1.0
      WHEN 'Adventure' THEN 2.0
      WHEN 'Science Fiction' THEN 1.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 3.0
      WHEN 'Romance' THEN 1.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 2.0
      ELSE 0.0
    END as r;
END;
$$;

-- 4. Função para calcular multiplicador de nota
CREATE OR REPLACE FUNCTION calculate_rating_multiplier(user_rating numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Fórmula: (Nota - 5.0) / 5.0
  -- Retorna valor entre -1.0 e 1.0
  RETURN (user_rating - 5.0) / 5.0;
END;
$$;

-- 5. Função principal para atualizar pontos do espectro
CREATE OR REPLACE FUNCTION update_user_spectrogram_points(
  p_user_id uuid,
  p_movie_genres jsonb,
  p_user_rating numeric,
  p_old_rating numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  genre_item jsonb;
  genre_name text;
  base_points RECORD;
  multiplier numeric;
  old_multiplier numeric;
  delta_e numeric := 0;
  delta_i numeric := 0;
  delta_c numeric := 0;
  delta_s numeric := 0;
  delta_r numeric := 0;
BEGIN
  -- Calcular multiplicador da nova nota
  multiplier := calculate_rating_multiplier(p_user_rating);
  
  -- Se houver nota anterior, calcular seu multiplicador para reverter
  IF p_old_rating IS NOT NULL THEN
    old_multiplier := calculate_rating_multiplier(p_old_rating);
  END IF;
  
  -- Iterar sobre cada gênero do filme
  FOR genre_item IN SELECT * FROM jsonb_array_elements(p_movie_genres)
  LOOP
    genre_name := genre_item->>'name';
    
    -- Obter pontos base para este gênero
    SELECT * INTO base_points FROM get_genre_base_points(genre_name);
    
    -- Calcular delta (diferença) para cada espectro
    -- Se houver nota anterior, subtrair seus pontos primeiro
    IF p_old_rating IS NOT NULL THEN
      delta_e := delta_e - (base_points.e * old_multiplier) + (base_points.e * multiplier);
      delta_i := delta_i - (base_points.i * old_multiplier) + (base_points.i * multiplier);
      delta_c := delta_c - (base_points.c * old_multiplier) + (base_points.c * multiplier);
      delta_s := delta_s - (base_points.s * old_multiplier) + (base_points.s * multiplier);
      delta_r := delta_r - (base_points.r * old_multiplier) + (base_points.r * multiplier);
    ELSE
      -- Nova avaliação, apenas adicionar
      delta_e := delta_e + (base_points.e * multiplier);
      delta_i := delta_i + (base_points.i * multiplier);
      delta_c := delta_c + (base_points.c * multiplier);
      delta_s := delta_s + (base_points.s * multiplier);
      delta_r := delta_r + (base_points.r * multiplier);
    END IF;
  END LOOP;
  
  -- Atualizar pontos no perfil do usuário
  UPDATE profiles
  SET 
    pontos_e = pontos_e + delta_e,
    pontos_i = pontos_i + delta_i,
    pontos_c = pontos_c + delta_c,
    pontos_s = pontos_s + delta_s,
    pontos_r = pontos_r + delta_r,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Atualizar arquétipos (primário e secundário)
  PERFORM update_user_archetypes(p_user_id);
END;
$$;

-- 6. Função para determinar arquétipos (primário e secundário)
CREATE OR REPLACE FUNCTION update_user_archetypes(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pontos RECORD;
  spectros text[] := ARRAY['E', 'I', 'C', 'S', 'R'];
  valores numeric[] := ARRAY[0, 0, 0, 0, 0];
  sorted_indices integer[];
BEGIN
  -- Obter pontos atuais do usuário
  SELECT pontos_e, pontos_i, pontos_c, pontos_s, pontos_r
  INTO pontos
  FROM profiles
  WHERE id = p_user_id;
  
  -- Criar array de valores
  valores := ARRAY[pontos.pontos_e, pontos.pontos_i, pontos.pontos_c, pontos.pontos_s, pontos.pontos_r];
  
  -- Ordenar índices por valores (decrescente)
  -- Usando CTE para ordenação
  WITH ranked AS (
    SELECT 
      idx,
      val,
      ROW_NUMBER() OVER (ORDER BY val DESC, idx) as rank
    FROM (
      SELECT unnest(ARRAY[1,2,3,4,5]) as idx, unnest(valores) as val
    ) sub
  )
  SELECT array_agg(idx ORDER BY rank)
  INTO sorted_indices
  FROM ranked;
  
  -- Atualizar arquétipos
  UPDATE profiles
  SET 
    arquetipo_primario = spectros[sorted_indices[1]],
    arquetipo_secundario = spectros[sorted_indices[2]],
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- 7. Função para remover pontos quando uma avaliação é deletada
CREATE OR REPLACE FUNCTION remove_spectrogram_points_for_rating(
  p_user_id uuid,
  p_movie_genres jsonb,
  p_user_rating numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  genre_item jsonb;
  genre_name text;
  base_points RECORD;
  multiplier numeric;
  delta_e numeric := 0;
  delta_i numeric := 0;
  delta_c numeric := 0;
  delta_s numeric := 0;
  delta_r numeric := 0;
BEGIN
  -- Calcular multiplicador
  multiplier := calculate_rating_multiplier(p_user_rating);
  
  -- Iterar sobre cada gênero do filme
  FOR genre_item IN SELECT * FROM jsonb_array_elements(p_movie_genres)
  LOOP
    genre_name := genre_item->>'name';
    
    -- Obter pontos base para este gênero
    SELECT * INTO base_points FROM get_genre_base_points(genre_name);
    
    -- Calcular delta (subtração)
    delta_e := delta_e - (base_points.e * multiplier);
    delta_i := delta_i - (base_points.i * multiplier);
    delta_c := delta_c - (base_points.c * multiplier);
    delta_s := delta_s - (base_points.s * multiplier);
    delta_r := delta_r - (base_points.r * multiplier);
  END LOOP;
  
  -- Atualizar pontos no perfil do usuário
  UPDATE profiles
  SET 
    pontos_e = pontos_e + delta_e,
    pontos_i = pontos_i + delta_i,
    pontos_c = pontos_c + delta_c,
    pontos_s = pontos_s + delta_s,
    pontos_r = pontos_r + delta_r,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Atualizar arquétipos
  PERFORM update_user_archetypes(p_user_id);
END;
$$;

-- 8. Comentários para documentação
COMMENT ON COLUMN profiles.pontos_e IS 'Espectrograma Cinematográfico - Pontos Emocionais';
COMMENT ON COLUMN profiles.pontos_i IS 'Espectrograma Cinematográfico - Pontos Intelectuais';
COMMENT ON COLUMN profiles.pontos_c IS 'Espectrograma Cinematográfico - Pontos Culturais';
COMMENT ON COLUMN profiles.pontos_s IS 'Espectrograma Cinematográfico - Pontos Sensoriais';
COMMENT ON COLUMN profiles.pontos_r IS 'Espectrograma Cinematográfico - Pontos Recreativos';
COMMENT ON COLUMN profiles.arquetipo_primario IS 'Espectro com maior pontuação (E/I/C/S/R)';
COMMENT ON COLUMN profiles.arquetipo_secundario IS 'Espectro com segunda maior pontuação (E/I/C/S/R)';

COMMENT ON FUNCTION update_user_spectrogram_points IS 'Atualiza pontos do espectrograma baseado em avaliação de filme';
COMMENT ON FUNCTION update_user_archetypes IS 'Determina arquétipos primário e secundário baseado nos pontos';
COMMENT ON FUNCTION remove_spectrogram_points_for_rating IS 'Remove pontos do espectrograma quando avaliação é deletada';
COMMENT ON FUNCTION calculate_rating_multiplier IS 'Calcula multiplicador: (nota - 5.0) / 5.0';
COMMENT ON FUNCTION get_genre_base_points IS 'Retorna pontos base da Matriz Gênero-Espectro para um gênero';