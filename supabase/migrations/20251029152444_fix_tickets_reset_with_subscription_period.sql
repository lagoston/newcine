/*
  # Correção do Sistema de Reset de Tickets

  ## Problema
  - next_reset sempre usa 30 dias fixos
  - Não sincroniza com período da assinatura (mensal/anual)
  - Usuário premium pode receber tickets múltiplas vezes antes do fim do período

  ## Solução
  - Sincronizar next_reset com current_period_end da assinatura
  - Ao ativar premium: next_reset = fim do período da assinatura
  - Ao cancelar/vencer: next_reset = 30 dias após último reset

  ## Mudanças
  1. Atualizar sync_premium_status para usar current_period_end
  2. Atualizar activate_premium_for_customer
  3. Criar função para sincronizar next_reset com assinatura
*/

-- Função para obter data de fim do período de uma assinatura
CREATE OR REPLACE FUNCTION get_subscription_period_end(user_id_param uuid)
RETURNS timestamptz AS $$
DECLARE
  period_end_unix bigint;
  period_end_ts timestamptz;
BEGIN
  SELECT ss.current_period_end INTO period_end_unix
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE sc.user_id = user_id_param
    AND ss.status IN ('active', 'trialing')
    AND ss.current_period_end > EXTRACT(EPOCH FROM NOW())::bigint
  ORDER BY ss.current_period_end DESC
  LIMIT 1;

  IF period_end_unix IS NULL THEN
    RETURN NULL;
  END IF;

  period_end_ts := to_timestamp(period_end_unix);
  RETURN period_end_ts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar sync_premium_status para sincronizar next_reset
CREATE OR REPLACE FUNCTION sync_premium_status(user_id_param uuid)
RETURNS json AS $$
DECLARE
  premium_active boolean;
  new_plan_type text;
  new_ticket_count integer;
  new_next_reset timestamptz;
  result json;
BEGIN
  premium_active := is_premium_active(user_id_param);

  IF premium_active THEN
    new_plan_type := 'premium';
    new_ticket_count := 3000;
    -- Sincronizar com fim do período da assinatura
    new_next_reset := get_subscription_period_end(user_id_param);
    IF new_next_reset IS NULL THEN
      new_next_reset := NOW() + INTERVAL '30 days';
    END IF;
  ELSE
    new_plan_type := 'free';
    new_ticket_count := 300;
    -- Para usuários free, manter reset mensal
    new_next_reset := NOW() + INTERVAL '30 days';
  END IF;

  UPDATE profiles
  SET 
    plan_type = new_plan_type,
    updated_at = NOW()
  WHERE id = user_id_param;

  UPDATE user_tickets
  SET 
    plan_type = new_plan_type,
    tickets_remaining = GREATEST(tickets_remaining, new_ticket_count),
    next_reset = new_next_reset,
    last_reset_at = NOW(),
    updated_at = NOW()
  WHERE user_id = user_id_param;

  result := json_build_object(
    'user_id', user_id_param,
    'plan_type', new_plan_type,
    'is_premium', premium_active,
    'tickets', new_ticket_count,
    'next_reset', new_next_reset,
    'synced_at', NOW()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar check_and_reset_tickets para respeitar next_reset da assinatura
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_param uuid)
RETURNS TABLE (
  tickets_remaining integer,
  last_reset_at timestamptz,
  next_reset timestamptz,
  plan_type text
) AS $$
DECLARE
  current_tickets user_tickets%ROWTYPE;
  new_ticket_count integer;
  premium_user boolean;
  new_next_reset timestamptz;
BEGIN
  premium_user := is_premium_active(user_id_param);

  SELECT * INTO current_tickets
  FROM user_tickets
  WHERE user_id = user_id_param;

  IF NOT FOUND THEN
    IF premium_user THEN
      new_ticket_count := 3000;
      new_next_reset := get_subscription_period_end(user_id_param);
      IF new_next_reset IS NULL THEN
        new_next_reset := NOW() + INTERVAL '30 days';
      END IF;
    ELSE
      new_ticket_count := 300;
      new_next_reset := NOW() + INTERVAL '30 days';
    END IF;

    INSERT INTO user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
    VALUES (
      user_id_param,
      new_ticket_count,
      CASE WHEN premium_user THEN 'premium' ELSE 'free' END,
      NOW(),
      new_next_reset
    )
    RETURNING * INTO current_tickets;
  END IF;

  -- Reset apenas quando next_reset foi alcançado
  IF current_tickets.next_reset <= NOW() THEN
    IF premium_user THEN
      new_ticket_count := 3000;
      new_next_reset := get_subscription_period_end(user_id_param);
      IF new_next_reset IS NULL THEN
        new_next_reset := NOW() + INTERVAL '30 days';
      END IF;
    ELSE
      new_ticket_count := 300;
      new_next_reset := NOW() + INTERVAL '30 days';
    END IF;

    UPDATE user_tickets
    SET 
      tickets_remaining = new_ticket_count,
      plan_type = CASE WHEN premium_user THEN 'premium' ELSE 'free' END,
      last_reset_at = NOW(),
      next_reset = new_next_reset,
      updated_at = NOW()
    WHERE user_id = user_id_param
    RETURNING * INTO current_tickets;
  END IF;

  RETURN QUERY
  SELECT 
    current_tickets.tickets_remaining,
    current_tickets.last_reset_at,
    current_tickets.next_reset,
    current_tickets.plan_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualizar activate_premium_for_customer para definir next_reset correto
CREATE OR REPLACE FUNCTION activate_premium_for_customer(
  customer_id_input text,
  subscription_id_input text DEFAULT NULL,
  period_end_input bigint DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  user_id_var uuid;
  calculated_period_end bigint;
  next_reset_ts timestamptz;
  result json;
BEGIN
  SELECT user_id INTO user_id_var
  FROM stripe_customers
  WHERE customer_id = customer_id_input;

  IF user_id_var IS NULL THEN
    RAISE EXCEPTION 'No user found for customer_id: %', customer_id_input;
  END IF;

  -- Usar period_end fornecido ou calcular 30 dias
  IF period_end_input IS NOT NULL THEN
    calculated_period_end := period_end_input;
    next_reset_ts := to_timestamp(period_end_input);
  ELSE
    calculated_period_end := EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint;
    next_reset_ts := NOW() + INTERVAL '30 days';
  END IF;

  -- Criar ou atualizar subscription
  IF subscription_id_input IS NOT NULL THEN
    INSERT INTO stripe_subscriptions (
      customer_id,
      subscription_id,
      status,
      current_period_start,
      current_period_end,
      created_at,
      updated_at
    ) VALUES (
      customer_id_input,
      subscription_id_input,
      'active',
      EXTRACT(EPOCH FROM NOW())::bigint,
      calculated_period_end,
      NOW(),
      NOW()
    )
    ON CONFLICT (customer_id) 
    DO UPDATE SET
      subscription_id = subscription_id_input,
      status = 'active',
      current_period_end = calculated_period_end,
      updated_at = NOW();
  END IF;

  -- Sincronizar premium status e tickets com next_reset correto
  result := sync_premium_status(user_id_var);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Sincronizar todos os usuários premium existentes
DO $$
DECLARE
  premium_user RECORD;
BEGIN
  FOR premium_user IN 
    SELECT DISTINCT ut.user_id
    FROM user_tickets ut
    WHERE ut.plan_type = 'premium'
      AND EXISTS (
        SELECT 1 FROM stripe_customers sc
        JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
        WHERE sc.user_id = ut.user_id
          AND ss.status IN ('active', 'trialing')
      )
  LOOP
    PERFORM sync_premium_status(premium_user.user_id);
  END LOOP;
  
  RAISE NOTICE 'Sincronizados % usuários premium com next_reset da assinatura', 
    (SELECT COUNT(*) FROM user_tickets WHERE plan_type = 'premium');
END $$;