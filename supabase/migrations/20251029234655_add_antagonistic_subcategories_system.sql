/*
  # Sistema de Subcategorias Antagônicas

  ## Objetivo
  Adicionar terceira letra ao perfil do usuário através de subcategorias antagônicas.
  Resultado: personalidade completa (ex: "IRX" = Arquiteto do Caos Experimental)

  ## Estrutura
  - 6 subcategorias em 3 pares antagônicos:
    1. Radiante (A) vs. Sombrio (B)
    2. Clássico (K) vs. Experimental (X)
    3. Denso (D) vs. Leve (L)

  ## Metodologia
  - Diferente dos arquétipos (calculado por pontos)
  - Definido via questionário (implementação futura)
*/

-- 1. Criar tabela de subcategorias antagônicas
CREATE TABLE IF NOT EXISTS antagonistic_subcategories (
  id text PRIMARY KEY,
  name text NOT NULL,
  antagonist_id text NOT NULL,
  pair_name text NOT NULL,
  description text NOT NULL,
  characteristics text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT valid_subcategory_id CHECK (id IN ('A', 'B', 'K', 'X', 'D', 'L'))
);

-- 2. Popular com as 6 subcategorias

-- Par 1: Radiante vs. Sombrio
INSERT INTO antagonistic_subcategories (id, name, antagonist_id, pair_name, description, characteristics) VALUES
('A', 'Radiante', 'B', 'Tom Emocional',
 'O aspecto Radiante indica uma aura luminosa, otimista e esperançosa nas preferências do usuário. Filmes preferidos por alguém Radiante tendem a ter um tom leve, inspirador ou reconfortante – histórias de triunfo, finais felizes, humor caloroso ou mensagens positivas. Esse espectador aprecia quando a luz prevalece sobre as trevas, buscando no cinema um refúgio de alegria ou elevação espiritual. Poeticamente, carrega consigo a claridade do amanhecer, irradiando entusiasmo e otimismo na escolha do próximo filme.',
 ARRAY['Luminoso', 'Otimista', 'Esperançoso', 'Inspirador', 'Reconfortante', 'Triunfante', 'Alegre']),

('B', 'Sombrio', 'A', 'Tom Emocional',
 'A subcategoria Sombrio denota uma inclinação às obras de tom escuro, melancólico ou perturbador. Perfis Sombrios são atraídos por filmes intensos, trágicos, de atmosfera densa – dramas psicológicos, horror, narrativas sem concessões que exploram o lado difícil da condição humana. Encontram beleza na tristeza e profundidade no desconforto, não temendo encarar emoções negativas ou temas tabu na tela. A aura é de crepúsculo e mistério: esse espectador abraça a escuridão poética, onde a catarse vem pela dor e a reflexão pelas sombras.',
 ARRAY['Escuro', 'Melancólico', 'Perturbador', 'Intenso', 'Trágico', 'Profundo', 'Misterioso']);

-- Par 2: Clássico vs. Experimental
INSERT INTO antagonistic_subcategories (id, name, antagonist_id, pair_name, description, characteristics) VALUES
('K', 'Clássico', 'X', 'Estilo Artístico',
 'Indica uma preferência por estilo tradicional, familiar e conservador no cinema. O perfil Clássico gosta do que é testado e aprovado – estruturas narrativas convencionais, estética vintage ou formulações de gênero clássicas. Sente-se confortável com repetição de fórmulas bem executadas (como o romance bem amarrado, o suspense noir raiz, o terror estilo anos 80) e aprecia referências a grandes obras do passado. Funcionalmente, essa subcategoria reflete um gosto por segurança artística: inovar na dose certa, sem romper o vínculo com a "boa e velha" forma de fazer cinema.',
 ARRAY['Tradicional', 'Familiar', 'Conservador', 'Vintage', 'Formulado', 'Referencial', 'Seguro']),

('X', 'Experimental', 'K', 'Estilo Artístico',
 'Representa o espírito vanguardista, inovador e aventureiro no estilo. Quem carrega Experimental no perfil entedia-se com o convencional e busca constante novidade. Filmes preferidos costumam quebrar expectativas – narrativas não-lineares, técnicas de filmagem inusitadas, gêneros misturados ou qualquer formato inventivo. O espectador Experimental valoriza a ousadia e a originalidade mesmo que venham com algum estranhamento. A descrição poética é de um navegador de fronteiras, explorando territórios cinematográficos desconhecidos em busca de novas formas de arte e expressão.',
 ARRAY['Vanguardista', 'Inovador', 'Aventureiro', 'Não-linear', 'Inusitado', 'Inventivo', 'Ousado']);

-- Par 3: Denso vs. Leve
INSERT INTO antagonistic_subcategories (id, name, antagonist_id, pair_name, description, characteristics) VALUES
('D', 'Denso', 'L', 'Complexidade Narrativa',
 'A marca Denso aponta para uma preferência por obras de grande peso emocional ou intelectual. Esse espectador aprecia filmes "densos" em conteúdo – tramas complexas, ritmos lentos porém recompensadores, camadas de significado simbólico, diálogos profundos ou silêncios eloquentes. Não se incomoda com temáticas pesadas, finais ambíguos ou exigência de interpretação; pelo contrário, prospera nesses elementos. É como um mergulhador de profundezas: encontra pérolas em narrativas submarinas, densa escuridão onde muitos não ousam descer. Funcionalmente, perfis Densos tendem a dramas artísticos, cinema cult introspectivo, obras que deixam eco na mente e no coração por muito tempo.',
 ARRAY['Pesado', 'Complexo', 'Lento', 'Simbólico', 'Profundo', 'Ambíguo', 'Introspectivo']),

('L', 'Leve', 'D', 'Complexidade Narrativa',
 'A subcategoria Leve indica predileção por filmes suaves, ágeis e descomplicados. Perfis Leves priorizam entretenimento fácil e relaxante – comédias românticas, aventuras descompromissadas, animações divertidas, qualquer gênero contanto que seja acessível e empolgante sem causar tensão duradoura. Preferem ritmos rápidos, tons alegres, emoção na medida e resolução clara. Esse espectador vê o cinema como uma brisa fresca, um alívio para o dia-a-dia, e por isso busca leveza até mesmo ao explorar gêneros variados. O "leve" aqui não significa superficial, mas sim palatável: histórias que alimentam a imaginação sem pesar no peito ou demandar longos digestos intelectuais.',
 ARRAY['Suave', 'Ágil', 'Descomplicado', 'Acessível', 'Empolgante', 'Rápido', 'Alegre']);

-- 3. Adicionar colunas ao profiles
DO $$
BEGIN
  -- Subcategoria escolhida pelo usuário
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subcategoria_id') THEN
    ALTER TABLE profiles ADD COLUMN subcategoria_id text REFERENCES antagonistic_subcategories(id);
  END IF;
  
  -- Personalidade completa (ex: "IRX")
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'personalidade_completa') THEN
    ALTER TABLE profiles ADD COLUMN personalidade_completa text;
  END IF;
END $$;

-- 4. Criar índices
CREATE INDEX IF NOT EXISTS idx_profiles_subcategoria ON profiles(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_profiles_personalidade ON profiles(personalidade_completa);
CREATE INDEX IF NOT EXISTS idx_subcategories_pair ON antagonistic_subcategories(pair_name);

-- 5. Função para obter o antagonista de uma subcategoria
CREATE OR REPLACE FUNCTION get_antagonist_subcategory(p_subcategory_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  antagonist text;
BEGIN
  SELECT antagonist_id INTO antagonist
  FROM antagonistic_subcategories
  WHERE id = p_subcategory_id;
  
  RETURN antagonist;
END;
$$;

-- 6. Função para obter par completo de subcategorias
CREATE OR REPLACE FUNCTION get_subcategory_pair(p_subcategory_id text)
RETURNS TABLE (
  primary_id text,
  primary_name text,
  antagonist_id text,
  antagonist_name text,
  pair_name text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s1.id as primary_id,
    s1.name as primary_name,
    s2.id as antagonist_id,
    s2.name as antagonist_name,
    s1.pair_name
  FROM antagonistic_subcategories s1
  LEFT JOIN antagonistic_subcategories s2 ON s1.antagonist_id = s2.id
  WHERE s1.id = p_subcategory_id;
END;
$$;

-- 7. Função para construir personalidade completa
CREATE OR REPLACE FUNCTION build_complete_personality(
  p_archetype_id text,
  p_subcategory_id text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_archetype_id IS NULL OR p_subcategory_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Combinar: arquétipo (2 letras) + subcategoria (1 letra)
  -- Ex: "IR" + "X" = "IRX"
  RETURN p_archetype_id || p_subcategory_id;
END;
$$;

-- 8. Função para atualizar personalidade completa de um usuário
CREATE OR REPLACE FUNCTION update_user_complete_personality(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_data RECORD;
  complete_personality text;
BEGIN
  -- Obter dados do usuário
  SELECT arquetipo_id, subcategoria_id
  INTO user_data
  FROM profiles
  WHERE id = p_user_id;
  
  -- Construir personalidade completa
  complete_personality := build_complete_personality(
    user_data.arquetipo_id,
    user_data.subcategoria_id
  );
  
  -- Atualizar
  UPDATE profiles
  SET 
    personalidade_completa = complete_personality,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- 9. Trigger para atualizar personalidade completa automaticamente
CREATE OR REPLACE FUNCTION trigger_update_complete_personality()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Atualizar personalidade completa quando arquétipo ou subcategoria mudar
  IF (NEW.arquetipo_id IS DISTINCT FROM OLD.arquetipo_id) 
     OR (NEW.subcategoria_id IS DISTINCT FROM OLD.subcategoria_id) THEN
    
    NEW.personalidade_completa := build_complete_personality(
      NEW.arquetipo_id,
      NEW.subcategoria_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_profiles_personality ON profiles;

CREATE TRIGGER trigger_profiles_personality
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_complete_personality();

-- 10. Função para obter informações completas da personalidade
CREATE OR REPLACE FUNCTION get_user_complete_personality(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  username text,
  personalidade_completa text,
  archetype_id text,
  archetype_name text,
  archetype_description text,
  subcategory_id text,
  subcategory_name text,
  subcategory_description text,
  personality_description text,
  pontos_e numeric,
  pontos_i numeric,
  pontos_c numeric,
  pontos_s numeric,
  pontos_r numeric
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.username,
    p.personalidade_completa,
    ca.id as archetype_id,
    ca.name as archetype_name,
    ca.description as archetype_description,
    sc.id as subcategory_id,
    sc.name as subcategory_name,
    sc.description as subcategory_description,
    -- Descrição combinada
    CASE 
      WHEN ca.name IS NOT NULL AND sc.name IS NOT NULL 
      THEN ca.name || ' ' || sc.name
      WHEN ca.name IS NOT NULL 
      THEN ca.name
      ELSE NULL
    END as personality_description,
    p.pontos_e,
    p.pontos_i,
    p.pontos_c,
    p.pontos_s,
    p.pontos_r
  FROM profiles p
  LEFT JOIN cinematic_archetypes ca ON p.arquetipo_id = ca.id
  LEFT JOIN antagonistic_subcategories sc ON p.subcategoria_id = sc.id
  WHERE p.id = p_user_id;
END;
$$;

-- 11. Função helper para definir subcategoria do usuário (usada via questionário)
CREATE OR REPLACE FUNCTION set_user_subcategory(
  p_user_id uuid,
  p_subcategory_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  -- Validar subcategoria
  IF NOT EXISTS (SELECT 1 FROM antagonistic_subcategories WHERE id = p_subcategory_id) THEN
    RAISE EXCEPTION 'Invalid subcategory: %', p_subcategory_id;
  END IF;
  
  -- Atualizar subcategoria
  UPDATE profiles
  SET 
    subcategoria_id = p_subcategory_id,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Retornar resultado
  SELECT json_build_object(
    'user_id', p.id,
    'subcategory_id', p.subcategoria_id,
    'subcategory_name', sc.name,
    'archetype_id', p.arquetipo_id,
    'personalidade_completa', p.personalidade_completa,
    'updated_at', p.updated_at
  ) INTO result
  FROM profiles p
  LEFT JOIN antagonistic_subcategories sc ON p.subcategoria_id = sc.id
  WHERE p.id = p_user_id;
  
  RETURN result;
END;
$$;

-- 12. RLS para antagonistic_subcategories
ALTER TABLE antagonistic_subcategories ENABLE ROW LEVEL SECURITY;

-- Todos podem ler subcategorias
CREATE POLICY "Anyone can read subcategories"
  ON antagonistic_subcategories
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- 13. Comentários
COMMENT ON TABLE antagonistic_subcategories IS 'Subcategorias antagônicas para personalidade cinematográfica (terceira letra)';
COMMENT ON COLUMN antagonistic_subcategories.id IS 'ID da subcategoria (A/B/K/X/D/L)';
COMMENT ON COLUMN antagonistic_subcategories.name IS 'Nome da subcategoria';
COMMENT ON COLUMN antagonistic_subcategories.antagonist_id IS 'ID da subcategoria antagônica';
COMMENT ON COLUMN antagonistic_subcategories.pair_name IS 'Nome do par antagônico';

COMMENT ON COLUMN profiles.subcategoria_id IS 'Subcategoria escolhida via questionário (A/B/K/X/D/L)';
COMMENT ON COLUMN profiles.personalidade_completa IS 'Personalidade completa: arquétipo + subcategoria (ex: IRX)';

COMMENT ON FUNCTION build_complete_personality IS 'Constrói personalidade completa (ex: IR + X = IRX)';
COMMENT ON FUNCTION update_user_complete_personality IS 'Atualiza personalidade completa do usuário';
COMMENT ON FUNCTION set_user_subcategory IS 'Define subcategoria do usuário (chamada pelo questionário)';
COMMENT ON FUNCTION get_user_complete_personality IS 'Retorna informações completas da personalidade do usuário';
COMMENT ON FUNCTION get_subcategory_pair IS 'Retorna par completo de subcategorias antagônicas';

-- 14. Estatísticas do sistema
DO $$
DECLARE
  total_subcategories integer;
  pair_record RECORD;
BEGIN
  SELECT COUNT(*) INTO total_subcategories FROM antagonistic_subcategories;
  
  RAISE NOTICE '=== Sistema de Subcategorias Antagônicas ===';
  RAISE NOTICE 'Total de subcategorias: %', total_subcategories;
  RAISE NOTICE '';
  RAISE NOTICE 'Pares Antagônicos:';
  
  FOR pair_record IN
    SELECT DISTINCT 
      pair_name,
      string_agg(id || ' (' || name || ')', ' vs. ' ORDER BY id) as pair_description
    FROM antagonistic_subcategories
    GROUP BY pair_name
    ORDER BY pair_name
  LOOP
    RAISE NOTICE '  %: %', pair_record.pair_name, pair_record.pair_description;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Estrutura de Personalidade:';
  RAISE NOTICE '  Arquétipo (2 letras) + Subcategoria (1 letra) = Personalidade (3 letras)';
  RAISE NOTICE '  Exemplo: IR (Arquiteto do Caos) + X (Experimental) = IRX (Arquiteto do Caos Experimental)';
  RAISE NOTICE '';
  RAISE NOTICE 'Próximos Passos:';
  RAISE NOTICE '  1. Implementar questionário para definir subcategoria';
  RAISE NOTICE '  2. Usar set_user_subcategory() após resposta do questionário';
  RAISE NOTICE '  3. Personalidade completa será atualizada automaticamente';
END $$;