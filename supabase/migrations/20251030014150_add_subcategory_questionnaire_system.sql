/*
  # Sistema de Questionário de Subcategorias

  ## Objetivo
  Criar questionário para identificar subcategoria antagônica do usuário.
  
  ## Estrutura
  - 12 perguntas principais (4 por eixo)
  - Ordem aleatória
  - Categorias ocultas
  - Sistema de pontuação
  - Pergunta de desempate (#13)

  ## Fluxo
  1. Usuário inicia questionário
  2. Recebe 12 perguntas aleatórias
  3. Responde cada pergunta
  4. Sistema calcula pontos por categoria
  5. Se empate, pergunta 13 com opções relevantes
  6. Define subcategoria final
*/

-- 1. Criar tabela de perguntas
CREATE TABLE IF NOT EXISTS subcategory_questions (
  id integer PRIMARY KEY,
  question_text text NOT NULL,
  is_tiebreaker boolean DEFAULT false NOT NULL,
  axis text,
  order_weight integer,
  created_at timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT valid_axis CHECK (axis IN ('tom_emocional', 'estilo_artistico', 'complexidade_narrativa', NULL))
);

-- 2. Criar tabela de opções de resposta
CREATE TABLE IF NOT EXISTS subcategory_question_options (
  id serial PRIMARY KEY,
  question_id integer NOT NULL REFERENCES subcategory_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  subcategory_id text NOT NULL REFERENCES antagonistic_subcategories(id),
  option_order integer NOT NULL,
  created_at timestamptz DEFAULT NOW() NOT NULL
);

-- 3. Criar tabela para rastrear respostas dos usuários
CREATE TABLE IF NOT EXISTS user_subcategory_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  question_id integer NOT NULL REFERENCES subcategory_questions(id),
  option_id integer NOT NULL REFERENCES subcategory_question_options(id),
  subcategory_id text NOT NULL REFERENCES antagonistic_subcategories(id),
  answered_at timestamptz DEFAULT NOW() NOT NULL,
  UNIQUE(session_id, question_id)
);

-- 4. Popular perguntas principais (1-12)
INSERT INTO subcategory_questions (id, question_text, is_tiebreaker, axis, order_weight) VALUES
(1, 'Após um dia longo e cansativo, você quer assistir a um filme. Qual o seu objetivo principal?', false, 'tom_emocional', 1),
(2, 'Você está decidindo um filme baseado no pôster e no título. O que te desperta mais curiosidade?', false, 'tom_emocional', 2),
(3, 'A trilha sonora de um filme é crucial. Qual abordagem você prefere?', false, 'tom_emocional', 3),
(4, 'Qual tipo de protagonista te atrai mais?', false, 'tom_emocional', 4),
(5, 'Você está explorando o catálogo de um serviço de streaming. O que chama mais sua atenção na sinopse de um filme desconhecido?', false, 'estilo_artistico', 5),
(6, 'Um livro que você adora será adaptado para o cinema. Qual notícia te deixaria mais animado?', false, 'estilo_artistico', 6),
(7, 'Você está assistindo a uma cena. O que te impressiona mais tecnicamente?', false, 'estilo_artistico', 7),
(8, 'Pense no final de um filme. O que te satisfaz mais?', false, 'estilo_artistico', 8),
(9, 'Você vai ao cinema com amigos. Como você descreve o tipo de filme que está com vontade de ver?', false, 'complexidade_narrativa', 9),
(10, 'Como você prefere que o tema central de um filme seja apresentado?', false, 'complexidade_narrativa', 10),
(11, 'O que te frustra mais em um filme?', false, 'complexidade_narrativa', 11),
(12, 'Pense nos diálogos de um roteiro. Qual estilo te agrada mais?', false, 'complexidade_narrativa', 12);

-- 5. Pergunta de desempate (#13)
INSERT INTO subcategory_questions (id, question_text, is_tiebreaker, axis, order_weight) VALUES
(13, 'Sua alma é um prisma em perfeito equilíbrio. Para sintonizar o foco, você deve escolher o filme que mais define sua jornada cinematográfica.', true, NULL, 13);

-- 6. Popular opções das perguntas 1-4 (Tom Emocional)
INSERT INTO subcategory_question_options (question_id, option_text, subcategory_id, option_order) VALUES
(1, 'Sentir-se melhor, mais leve e com uma visão mais otimista do mundo.', 'A', 1),
(1, 'Mergulhar em uma atmosfera intensa e provocadora, mesmo que seja desconfortável.', 'B', 2),

(2, 'Tons escuros e um título enigmático que sugere um mistério profundo ou um terror psicológico.', 'B', 1),
(2, 'Cores vibrantes e um título que sugere aventura, romance ou superação.', 'A', 2),

(3, 'Paisagens sonoras atmosféricas e dissonantes, que constroem tensão e um sentimento de estranheza ou melancolia.', 'B', 1),
(3, 'Melodias marcantes e temas musicais que elevam as emoções e sublinham os momentos de triunfo e alegria.', 'A', 2),

(4, 'Alguém que, apesar das dificuldades, supera os obstáculos com resiliência e alcança a redenção ou a felicidade.', 'A', 1),
(4, 'Um anti-herói ou uma figura trágica, cujas falhas e escolhas duvidosas levam a um destino inevitavelmente sombrio.', 'B', 2);

-- 7. Popular opções das perguntas 5-8 (Estilo Artístico)
INSERT INTO subcategory_question_options (question_id, option_text, subcategory_id, option_order) VALUES
(5, 'A promessa de uma história emocionante, com uma estrutura narrativa perfeitamente executada.', 'K', 1),
(5, 'A descrição de uma abordagem visual ou narrativa que "desafia as convenções do cinema".', 'X', 2),

(6, 'O diretor prometeu ser extremamente fiel ao material original, honrando a estrutura da obra.', 'K', 1),
(6, 'O diretor anunciou que usará o livro como ponto de partida para uma reinterpretação radical e inesperada.', 'X', 2),

(7, 'Uma composição de câmera equilibrada e uma montagem fluida, que servem a história de forma invisível e elegante.', 'K', 1),
(7, 'Ângulos de câmera inusitados e uma montagem arrojada que chama atenção para si mesma como parte da expressão artística.', 'X', 2),

(8, 'Um final ambíguo ou aberto, que quebra as expectativas e te deixa pensando sobre o que realmente aconteceu.', 'X', 1),
(8, 'Um final conclusivo, que amarra todas as pontas soltas e resolve o arco dos personagens de forma clara.', 'K', 2);

-- 8. Popular opções das perguntas 9-12 (Complexidade Narrativa)
INSERT INTO subcategory_question_options (question_id, option_text, subcategory_id, option_order) VALUES
(9, 'Algo divertido e fácil de acompanhar, pra gente relaxar e dar umas risadas.', 'L', 1),
(9, 'Algo que gere debate e nos faça conversar sobre teorias e significados depois da sessão.', 'D', 2),

(10, 'Através de metáforas e subtexto, com camadas de significado que só se revelam com atenção e reflexão.', 'D', 1),
(10, 'De forma clara e direta, com uma mensagem que é facilmente compreendida por todos.', 'L', 2),

(11, 'Uma trama excessivamente complicada e cheia de simbolismos que exige um esforço enorme para ser decifrada.', 'L', 1),
(11, 'Uma história superficial e previsível, com personagens cujas motivações são simples demais.', 'D', 2),

(12, 'Diálogos filosóficos e introspectivos, que exploram a psicologia dos personagens e os temas do filme em profundidade.', 'D', 1),
(12, 'Diálogos ágeis, espirituosos e que fazem a história avançar de maneira objetiva.', 'L', 2);

-- 9. Popular opções da pergunta 13 (Desempate)
INSERT INTO subcategory_question_options (question_id, option_text, subcategory_id, option_order) VALUES
(13, 'Um Sonho de Liberdade (The Shawshank Redemption)', 'A', 1),
(13, 'Se7en - Os Sete Crimes Capitais', 'B', 2),
(13, 'O Poderoso Chefão (The Godfather)', 'K', 3),
(13, 'Tudo em Todo Lugar ao Mesmo Tempo (Everything Everywhere All at Once)', 'X', 4),
(13, 'Divertidamente (Inside Out)', 'L', 5),
(13, 'Blade Runner 2049', 'D', 6);

-- 10. Criar índices
CREATE INDEX IF NOT EXISTS idx_questions_tiebreaker ON subcategory_questions(is_tiebreaker);
CREATE INDEX IF NOT EXISTS idx_questions_axis ON subcategory_questions(axis);
CREATE INDEX IF NOT EXISTS idx_options_question ON subcategory_question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_options_subcategory ON subcategory_question_options(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_responses_user ON user_subcategory_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_responses_session ON user_subcategory_responses(session_id);

-- 11. Função para iniciar questionário (retorna 12 perguntas aleatórias)
CREATE OR REPLACE FUNCTION start_subcategory_questionnaire()
RETURNS TABLE (
  question_id integer,
  question_text text,
  options jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id as question_id,
    q.question_text,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'option_id', o.id,
          'option_text', o.option_text,
          'option_order', o.option_order
        ) ORDER BY o.option_order
      )
      FROM subcategory_question_options o
      WHERE o.question_id = q.id
    ) as options
  FROM subcategory_questions q
  WHERE q.is_tiebreaker = false
  ORDER BY RANDOM();  -- Ordem aleatória
END;
$$;

-- 12. Função para registrar resposta
CREATE OR REPLACE FUNCTION record_subcategory_response(
  p_user_id uuid,
  p_session_id uuid,
  p_question_id integer,
  p_option_id integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_subcategory text;
  result json;
BEGIN
  -- Obter subcategoria da opção escolhida
  SELECT subcategory_id INTO selected_subcategory
  FROM subcategory_question_options
  WHERE id = p_option_id;
  
  -- Inserir ou atualizar resposta
  INSERT INTO user_subcategory_responses (
    user_id,
    session_id,
    question_id,
    option_id,
    subcategory_id
  )
  VALUES (
    p_user_id,
    p_session_id,
    p_question_id,
    p_option_id,
    selected_subcategory
  )
  ON CONFLICT (session_id, question_id)
  DO UPDATE SET
    option_id = EXCLUDED.option_id,
    subcategory_id = EXCLUDED.subcategory_id,
    answered_at = NOW();
  
  result := json_build_object(
    'success', true,
    'subcategory_scored', selected_subcategory
  );
  
  RETURN result;
END;
$$;

-- 13. Função para calcular resultado
CREATE OR REPLACE FUNCTION calculate_subcategory_result(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scores RECORD;
  max_score integer;
  winner_count integer;
  tied_categories text[];
  winner_subcategory text;
  result json;
BEGIN
  -- Calcular pontuação por subcategoria
  WITH score_counts AS (
    SELECT 
      subcategory_id,
      COUNT(*) as score
    FROM user_subcategory_responses
    WHERE session_id = p_session_id
      AND question_id <= 12  -- Apenas perguntas principais
    GROUP BY subcategory_id
  ),
  max_score_calc AS (
    SELECT MAX(score) as max_score FROM score_counts
  )
  SELECT 
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'A' THEN sc.score ELSE 0 END), 0) as score_a,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'B' THEN sc.score ELSE 0 END), 0) as score_b,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'K' THEN sc.score ELSE 0 END), 0) as score_k,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'X' THEN sc.score ELSE 0 END), 0) as score_x,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'D' THEN sc.score ELSE 0 END), 0) as score_d,
    COALESCE(SUM(CASE WHEN sc.subcategory_id = 'L' THEN sc.score ELSE 0 END), 0) as score_l,
    m.max_score
  INTO scores
  FROM score_counts sc
  CROSS JOIN max_score_calc m
  GROUP BY m.max_score;
  
  -- Se não houver max_score, significa que não há respostas
  IF scores.max_score IS NULL THEN
    RETURN json_build_object(
      'status', 'no_responses',
      'message', 'Nenhuma resposta registrada para esta sessão'
    );
  END IF;
  
  -- Contar quantas categorias têm a pontuação máxima
  SELECT COUNT(*) INTO winner_count
  FROM (
    SELECT unnest(ARRAY[scores.score_a, scores.score_b, scores.score_k, 
                        scores.score_x, scores.score_d, scores.score_l]) as score
  ) s
  WHERE s.score = scores.max_score;
  
  -- Se há empate
  IF winner_count > 1 THEN
    -- Identificar categorias empatadas
    tied_categories := ARRAY[]::text[];
    
    IF scores.score_a = scores.max_score THEN tied_categories := tied_categories || 'A'; END IF;
    IF scores.score_b = scores.max_score THEN tied_categories := tied_categories || 'B'; END IF;
    IF scores.score_k = scores.max_score THEN tied_categories := tied_categories || 'K'; END IF;
    IF scores.score_x = scores.max_score THEN tied_categories := tied_categories || 'X'; END IF;
    IF scores.score_d = scores.max_score THEN tied_categories := tied_categories || 'D'; END IF;
    IF scores.score_l = scores.max_score THEN tied_categories := tied_categories || 'L'; END IF;
    
    result := json_build_object(
      'status', 'tie',
      'scores', json_build_object(
        'A', scores.score_a,
        'B', scores.score_b,
        'K', scores.score_k,
        'X', scores.score_x,
        'D', scores.score_d,
        'L', scores.score_l
      ),
      'tied_categories', tied_categories,
      'requires_tiebreaker', true
    );
    
    RETURN result;
  END IF;
  
  -- Determinar vencedor
  IF scores.score_a = scores.max_score THEN winner_subcategory := 'A';
  ELSIF scores.score_b = scores.max_score THEN winner_subcategory := 'B';
  ELSIF scores.score_k = scores.max_score THEN winner_subcategory := 'K';
  ELSIF scores.score_x = scores.max_score THEN winner_subcategory := 'X';
  ELSIF scores.score_d = scores.max_score THEN winner_subcategory := 'D';
  ELSIF scores.score_l = scores.max_score THEN winner_subcategory := 'L';
  END IF;
  
  -- Atualizar perfil do usuário
  PERFORM set_user_subcategory(p_user_id, winner_subcategory);
  
  result := json_build_object(
    'status', 'completed',
    'winner', winner_subcategory,
    'scores', json_build_object(
      'A', scores.score_a,
      'B', scores.score_b,
      'K', scores.score_k,
      'X', scores.score_x,
      'D', scores.score_d,
      'L', scores.score_l
    ),
    'requires_tiebreaker', false
  );
  
  RETURN result;
END;
$$;

-- 14. Função para obter pergunta de desempate
CREATE OR REPLACE FUNCTION get_tiebreaker_question(p_tied_categories text[])
RETURNS TABLE (
  question_id integer,
  question_text text,
  options jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id as question_id,
    q.question_text,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'option_id', o.id,
          'option_text', o.option_text,
          'subcategory_id', o.subcategory_id,
          'option_order', o.option_order
        ) ORDER BY o.option_order
      )
      FROM subcategory_question_options o
      WHERE o.question_id = q.id
        AND o.subcategory_id = ANY(p_tied_categories)  -- Apenas categorias empatadas
    ) as options
  FROM subcategory_questions q
  WHERE q.is_tiebreaker = true;
END;
$$;

-- 15. Função para resolver empate
CREATE OR REPLACE FUNCTION resolve_tiebreaker(
  p_user_id uuid,
  p_session_id uuid,
  p_option_id integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_subcategory text;
  result json;
BEGIN
  -- Obter subcategoria da opção escolhida
  SELECT subcategory_id INTO selected_subcategory
  FROM subcategory_question_options
  WHERE id = p_option_id;
  
  -- Registrar resposta de desempate
  INSERT INTO user_subcategory_responses (
    user_id,
    session_id,
    question_id,
    option_id,
    subcategory_id
  )
  VALUES (
    p_user_id,
    p_session_id,
    13,  -- Pergunta de desempate
    p_option_id,
    selected_subcategory
  );
  
  -- Atualizar perfil do usuário
  PERFORM set_user_subcategory(p_user_id, selected_subcategory);
  
  result := json_build_object(
    'status', 'completed',
    'winner', selected_subcategory,
    'resolved_by_tiebreaker', true
  );
  
  RETURN result;
END;
$$;

-- 16. RLS para tabelas
ALTER TABLE subcategory_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategory_question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subcategory_responses ENABLE ROW LEVEL SECURITY;

-- Todos podem ler perguntas e opções
CREATE POLICY "Anyone can read questions"
  ON subcategory_questions FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Anyone can read options"
  ON subcategory_question_options FOR SELECT
  TO authenticated, anon
  USING (true);

-- Apenas dono pode ver suas respostas
CREATE POLICY "Users can view own responses"
  ON user_subcategory_responses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own responses"
  ON user_subcategory_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 17. Comentários
COMMENT ON TABLE subcategory_questions IS 'Perguntas do questionário de subcategorias';
COMMENT ON TABLE subcategory_question_options IS 'Opções de resposta para cada pergunta';
COMMENT ON TABLE user_subcategory_responses IS 'Respostas dos usuários ao questionário';

COMMENT ON FUNCTION start_subcategory_questionnaire IS 'Inicia questionário retornando 12 perguntas aleatórias';
COMMENT ON FUNCTION record_subcategory_response IS 'Registra resposta de uma pergunta';
COMMENT ON FUNCTION calculate_subcategory_result IS 'Calcula resultado e detecta empates';
COMMENT ON FUNCTION get_tiebreaker_question IS 'Retorna pergunta de desempate com opções filtradas';
COMMENT ON FUNCTION resolve_tiebreaker IS 'Resolve empate com pergunta 13';

-- 18. Estatísticas
DO $$
DECLARE
  total_questions integer;
  total_options integer;
BEGIN
  SELECT COUNT(*) INTO total_questions FROM subcategory_questions;
  SELECT COUNT(*) INTO total_options FROM subcategory_question_options;
  
  RAISE NOTICE '=== Sistema de Questionário de Subcategorias ===';
  RAISE NOTICE 'Total de perguntas: % (12 principais + 1 desempate)', total_questions;
  RAISE NOTICE 'Total de opções: %', total_options;
  RAISE NOTICE '';
  RAISE NOTICE 'Estrutura:';
  RAISE NOTICE '  - Perguntas 1-4: Tom Emocional (A vs. B)';
  RAISE NOTICE '  - Perguntas 5-8: Estilo Artístico (K vs. X)';
  RAISE NOTICE '  - Perguntas 9-12: Complexidade Narrativa (D vs. L)';
  RAISE NOTICE '  - Pergunta 13: Desempate (6 opções)';
  RAISE NOTICE '';
  RAISE NOTICE 'Fluxo de Uso:';
  RAISE NOTICE '  1. SELECT * FROM start_subcategory_questionnaire();';
  RAISE NOTICE '  2. SELECT record_subcategory_response(user_id, session_id, q_id, opt_id);';
  RAISE NOTICE '  3. SELECT calculate_subcategory_result(user_id, session_id);';
  RAISE NOTICE '  4. Se empate: SELECT * FROM get_tiebreaker_question(tied_cats);';
  RAISE NOTICE '  5. SELECT resolve_tiebreaker(user_id, session_id, opt_id);';
END $$;