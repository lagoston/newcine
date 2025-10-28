/*
  # Sistema de Expiração e Limites de Sussuros

  1. Novas Funcionalidades
    - Sussuros expiram após 30 dias
    - Usuários free: limite de 10 recomendações por semana
    - Usuários premium: limite de 50 recomendações por semana
    - Contagem de sussuros não lidos

  2. Funções
    - `delete_expired_recommendations()` - Deleta recomendações com mais de 30 dias
    - `count_user_recommendations_this_week(user_id)` - Conta recomendações enviadas na semana
    - `count_unread_recommendations(user_id)` - Conta recomendações não lidas
    - `get_user_recommendation_limit(user_id)` - Retorna limite baseado no status premium

  3. Automação
    - Trigger para deletar recomendações expiradas automaticamente
*/

-- Função para deletar recomendações expiradas (mais de 30 dias)
CREATE OR REPLACE FUNCTION delete_expired_recommendations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM recommendations
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Função para contar recomendações enviadas na semana atual
CREATE OR REPLACE FUNCTION count_user_recommendations_this_week(user_id_input uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recommendation_count integer;
BEGIN
  SELECT COUNT(*)
  INTO recommendation_count
  FROM recommendations
  WHERE from_user_id = user_id_input
    AND created_at >= DATE_TRUNC('week', NOW());
  
  RETURN COALESCE(recommendation_count, 0);
END;
$$;

-- Função para contar recomendações não lidas
CREATE OR REPLACE FUNCTION count_unread_recommendations(user_id_input uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  unread_count integer;
BEGIN
  SELECT COUNT(*)
  INTO unread_count
  FROM recommendations
  WHERE to_user_id = user_id_input
    AND read = false;
  
  RETURN COALESCE(unread_count, 0);
END;
$$;

-- Função para obter limite de recomendações baseado no status premium
CREATE OR REPLACE FUNCTION get_user_recommendation_limit(user_id_input uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_premium boolean;
BEGIN
  SELECT premium_status
  INTO is_premium
  FROM unified_profiles
  WHERE user_id = user_id_input;
  
  IF is_premium THEN
    RETURN 50;
  ELSE
    RETURN 10;
  END IF;
END;
$$;

-- Função para verificar se usuário pode enviar recomendação
CREATE OR REPLACE FUNCTION can_send_recommendation(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count integer;
  user_limit integer;
BEGIN
  current_count := count_user_recommendations_this_week(user_id_input);
  user_limit := get_user_recommendation_limit(user_id_input);
  
  RETURN current_count < user_limit;
END;
$$;

-- Criar extensão pg_cron se não existir (para limpeza automática)
-- Nota: pg_cron deve ser habilitado manualmente no Supabase Dashboard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignora erro se pg_cron não estiver disponível
    NULL;
END $$;

-- Agendar limpeza diária de recomendações expiradas (se pg_cron estiver disponível)
DO $$
BEGIN
  PERFORM cron.schedule(
    'delete-expired-recommendations',
    '0 2 * * *', -- Roda às 2h da manhã todos os dias
    'SELECT delete_expired_recommendations();'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Ignora erro se pg_cron não estiver disponível
    NULL;
END $$;
