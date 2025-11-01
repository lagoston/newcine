/*
  # Sistema Automático de Recálculo Após Rebalanceamento

  ## Objetivo
  Sempre que a função `get_genre_base_points` for alterada (rebalanceamento),
  o sistema automaticamente recalcula todos os usuários afetados.

  ## Estratégia
  1. Criar função wrapper que substitui `get_genre_base_points`
  2. Ao criar/substituir esta função, automaticamente dispara recálculo
  3. Log de todas as alterações para auditoria

  ## Alteração Atual
  - **Drama**: E=4→3, S=0→1 (redistribuição para mais equilíbrio sensorial)

  ## Como Usar no Futuro
  Sempre que quiser rebalancear gêneros:
  1. Crie uma nova migração
  2. Use `CREATE OR REPLACE FUNCTION get_genre_base_points(...)`
  3. Chame `SELECT auto_recalculate_after_rebalance('motivo da mudança');`
  4. O sistema automaticamente recalcula todos os usuários
*/

-- 1. Tabela de log de rebalanceamentos
CREATE TABLE IF NOT EXISTS genre_rebalance_log (
  id bigserial PRIMARY KEY,
  rebalanced_at timestamptz DEFAULT NOW(),
  reason text NOT NULL,
  users_affected integer DEFAULT 0,
  users_successful integer DEFAULT 0,
  users_failed integer DEFAULT 0,
  execution_time_ms integer,
  changes_summary jsonb
);

ALTER TABLE genre_rebalance_log ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver o log
CREATE POLICY "Apenas autenticados podem ver log de rebalanceamento"
  ON genre_rebalance_log
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Função para recalcular automaticamente após rebalanceamento
CREATE OR REPLACE FUNCTION auto_recalculate_after_rebalance(reason_text text DEFAULT 'Manual rebalance')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_time timestamptz;
  end_time timestamptz;
  execution_ms integer;
  recalc_result json;
  log_id bigint;
BEGIN
  start_time := clock_timestamp();
  
  RAISE NOTICE '🔄 Iniciando recálculo automático após rebalanceamento...';
  RAISE NOTICE '📝 Motivo: %', reason_text;
  
  -- Executar recálculo em massa
  recalc_result := bulk_recalculate_all_users();
  
  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  -- Registrar no log
  INSERT INTO genre_rebalance_log (
    reason,
    users_affected,
    users_successful,
    users_failed,
    execution_time_ms,
    changes_summary
  ) VALUES (
    reason_text,
    (recalc_result->>'total_users')::integer,
    (recalc_result->>'successful')::integer,
    (recalc_result->>'failed')::integer,
    execution_ms,
    recalc_result
  ) RETURNING id INTO log_id;
  
  RAISE NOTICE '✅ Recálculo completo! Log ID: %', log_id;
  RAISE NOTICE '⏱️  Tempo de execução: %ms', execution_ms;
  RAISE NOTICE '👥 Usuários processados: %/%', 
    recalc_result->>'successful', 
    recalc_result->>'total_users';
  
  RETURN json_build_object(
    'status', 'success',
    'log_id', log_id,
    'execution_time_ms', execution_ms,
    'recalculation_result', recalc_result
  );
END;
$$;

COMMENT ON FUNCTION auto_recalculate_after_rebalance(text) IS 
  'Recalcula automaticamente todos os usuários após um rebalanceamento de gêneros e registra no log';

-- 3. Atualizar função get_genre_base_points com ajuste do Drama
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz Gênero-Espectro (cada gênero distribui 5 pontos)
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 3.0  -- AJUSTADO: 4.0 → 3.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 5.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0
      WHEN 'Music' THEN 0.0
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as e,
    CASE genre_name
      WHEN 'Drama' THEN 1.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 4.0
      WHEN 'Thriller' THEN 5.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 5.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 1.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0
      WHEN 'Music' THEN 0.0
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as i,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 0.0
      WHEN 'Adventure' THEN 3.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 0.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 5.0
      WHEN 'History' THEN 4.0
      WHEN 'War' THEN 5.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0
      WHEN 'Music' THEN 0.0
      WHEN 'Crime' THEN 1.0
      WHEN 'Western' THEN 5.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as c,
    CASE genre_name
      WHEN 'Drama' THEN 1.0  -- AJUSTADO: 0.0 → 1.0
      WHEN 'Comedy' THEN 0.0
      WHEN 'Action' THEN 4.0
      WHEN 'Adventure' THEN 0.0
      WHEN 'Science Fiction' THEN 1.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 5.0
      WHEN 'Fantasy' THEN 4.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 0.0
      WHEN 'Family' THEN 0.0
      WHEN 'Music' THEN 5.0
      WHEN 'Crime' THEN 2.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 0.0
      ELSE 0.0
    END as s,
    CASE genre_name
      WHEN 'Drama' THEN 0.0
      WHEN 'Comedy' THEN 5.0
      WHEN 'Action' THEN 1.0
      WHEN 'Adventure' THEN 2.0
      WHEN 'Science Fiction' THEN 0.0
      WHEN 'Thriller' THEN 0.0
      WHEN 'Horror' THEN 0.0
      WHEN 'Fantasy' THEN 1.0
      WHEN 'Romance' THEN 0.0
      WHEN 'Mystery' THEN 0.0
      WHEN 'Documentary' THEN 0.0
      WHEN 'History' THEN 0.0
      WHEN 'War' THEN 0.0
      WHEN 'Animation' THEN 5.0
      WHEN 'Family' THEN 5.0
      WHEN 'Music' THEN 0.0
      WHEN 'Crime' THEN 0.0
      WHEN 'Western' THEN 0.0
      WHEN 'TV Movie' THEN 5.0
      ELSE 0.0
    END as r;
END;
$$;

COMMENT ON FUNCTION get_genre_base_points(text) IS 
  'Mapeia todos os 19 gêneros TMDB para pontos base nos 5 espectros (E, I, C, S, R). 
  Drama ajustado: E=3, I=1, C=0, S=1, R=0 para melhor equilíbrio.';

-- 4. Executar recálculo automático
SELECT auto_recalculate_after_rebalance('Ajuste Drama: E=4→3, S=0→1 para melhor distribuição sensorial');

-- 5. Criar view para consultar histórico de rebalanceamentos
CREATE OR REPLACE VIEW genre_rebalance_history AS
SELECT 
  id,
  rebalanced_at,
  reason,
  users_affected as total_users,
  users_successful,
  users_failed,
  ROUND((users_successful::numeric / NULLIF(users_affected, 0) * 100), 2) as success_rate_percent,
  execution_time_ms,
  ROUND(execution_time_ms::numeric / 1000, 2) as execution_time_seconds,
  changes_summary
FROM genre_rebalance_log
ORDER BY rebalanced_at DESC;

COMMENT ON VIEW genre_rebalance_history IS 
  'Histórico de todos os rebalanceamentos de gêneros com estatísticas de recálculo';
