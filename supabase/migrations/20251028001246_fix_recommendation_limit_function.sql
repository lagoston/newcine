/*
  # Corrige Função de Limite de Recomendações

  1. Problema
    - Função get_user_recommendation_limit estava usando tabela inexistente unified_profiles
    - Causava erro ao tentar enviar recomendações

  2. Solução
    - Atualiza função para usar premium_users_status
    - Campo correto: should_be_premium
    - Retorna 50 para premium, 10 para free
*/

-- Corrige função para obter limite de recomendações
CREATE OR REPLACE FUNCTION get_user_recommendation_limit(user_id_input uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_premium boolean;
BEGIN
  SELECT should_be_premium
  INTO is_premium
  FROM premium_users_status
  WHERE user_id = user_id_input;
  
  -- Se não encontrar registro, assume free
  IF is_premium IS NULL THEN
    is_premium := false;
  END IF;
  
  IF is_premium THEN
    RETURN 50;
  ELSE
    RETURN 10;
  END IF;
END;
$$;
