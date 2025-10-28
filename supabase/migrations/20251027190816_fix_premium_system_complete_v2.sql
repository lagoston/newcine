/*
  # Correção Completa do Sistema Premium v2

  ## Correções
  1. Status premium não atualiza após compra
  2. Usuários premium continuam após vencimento  
  3. Cancelamento não funciona
  4. Inconsistência de dados
*/

-- 1. Função para verificar se usuário deve ter premium
CREATE OR REPLACE FUNCTION is_premium_active(user_id_param uuid)
RETURNS boolean AS $$
DECLARE
  subscription_record RECORD;
  now_timestamp bigint;
BEGIN
  now_timestamp := EXTRACT(EPOCH FROM NOW())::bigint;

  SELECT ss.* INTO subscription_record
  FROM stripe_customers sc
  JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE sc.user_id = user_id_param
    AND ss.status IN ('active', 'trialing')
    AND ss.current_period_end > now_timestamp
  ORDER BY ss.current_period_end DESC
  LIMIT 1;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Função para obter status premium detalhado
CREATE OR REPLACE FUNCTION get_premium_status(user_id_param uuid)
RETURNS TABLE (
  is_premium boolean,
  subscription_id text,
  status text,
  current_period_end bigint,
  cancel_at_period_end boolean
) AS $$
DECLARE
  now_timestamp bigint;
BEGIN
  now_timestamp := EXTRACT(EPOCH FROM NOW())::bigint;

  RETURN QUERY
  SELECT 
    CASE 
      WHEN ss.status IN ('active', 'trialing') AND ss.current_period_end > now_timestamp 
      THEN true 
      ELSE false 
    END as is_premium,
    ss.subscription_id,
    ss.status,
    ss.current_period_end,
    ss.cancel_at_period_end
  FROM stripe_customers sc
  LEFT JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
  WHERE sc.user_id = user_id_param
  ORDER BY ss.current_period_end DESC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função para sincronizar status premium
CREATE OR REPLACE FUNCTION sync_premium_status(user_id_param uuid)
RETURNS json AS $$
DECLARE
  premium_active boolean;
  new_plan_type text;
  new_ticket_count integer;
  result json;
BEGIN
  premium_active := is_premium_active(user_id_param);

  IF premium_active THEN
    new_plan_type := 'premium';
    new_ticket_count := 3000;
  ELSE
    new_plan_type := 'free';
    new_ticket_count := 250;
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
    updated_at = NOW()
  WHERE user_id = user_id_param;

  result := json_build_object(
    'user_id', user_id_param,
    'plan_type', new_plan_type,
    'is_premium', premium_active,
    'synced_at', NOW()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recriar função de processamento de webhook
DROP FUNCTION IF EXISTS process_stripe_webhook_event(text, text, text, text, text, bigint, bigint);

CREATE FUNCTION process_stripe_webhook_event(
  event_type text,
  customer_id text,
  subscription_id text DEFAULT NULL,
  status text DEFAULT NULL,
  price_id text DEFAULT NULL,
  current_period_start bigint DEFAULT NULL,
  current_period_end bigint DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  user_id_var uuid;
  result json;
BEGIN
  SELECT user_id INTO user_id_var
  FROM stripe_customers
  WHERE stripe_customers.customer_id = process_stripe_webhook_event.customer_id;

  IF user_id_var IS NULL THEN
    RAISE EXCEPTION 'No user found for customer_id: %', customer_id;
  END IF;

  CASE event_type
    WHEN 'checkout.session.completed', 
         'customer.subscription.created',
         'customer.subscription.updated',
         'invoice.payment_succeeded' THEN
      
      IF subscription_id IS NOT NULL THEN
        INSERT INTO stripe_subscriptions (
          customer_id,
          subscription_id,
          price_id,
          current_period_start,
          current_period_end,
          status,
          cancel_at_period_end,
          created_at,
          updated_at
        ) VALUES (
          process_stripe_webhook_event.customer_id,
          process_stripe_webhook_event.subscription_id,
          COALESCE(process_stripe_webhook_event.price_id, ''),
          COALESCE(process_stripe_webhook_event.current_period_start, EXTRACT(EPOCH FROM NOW())::bigint),
          COALESCE(process_stripe_webhook_event.current_period_end, EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint),
          COALESCE(process_stripe_webhook_event.status, 'active'),
          false,
          NOW(),
          NOW()
        )
        ON CONFLICT (customer_id) 
        DO UPDATE SET
          subscription_id = EXCLUDED.subscription_id,
          price_id = COALESCE(EXCLUDED.price_id, stripe_subscriptions.price_id),
          current_period_start = COALESCE(EXCLUDED.current_period_start, stripe_subscriptions.current_period_start),
          current_period_end = COALESCE(EXCLUDED.current_period_end, stripe_subscriptions.current_period_end),
          status = COALESCE(EXCLUDED.status, stripe_subscriptions.status),
          updated_at = NOW();
      END IF;

      result := sync_premium_status(user_id_var);

    WHEN 'customer.subscription.deleted' THEN
      UPDATE stripe_subscriptions
      SET 
        status = 'canceled',
        cancel_at_period_end = true,
        updated_at = NOW()
      WHERE stripe_subscriptions.customer_id = process_stripe_webhook_event.customer_id;

      result := sync_premium_status(user_id_var);

    ELSE
      result := json_build_object('message', 'Event type not handled: ' || event_type);
  END CASE;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função para ativar premium diretamente
DROP FUNCTION IF EXISTS activate_premium_for_customer(text);

CREATE FUNCTION activate_premium_for_customer(customer_id_input text)
RETURNS json AS $$
DECLARE
  user_id_var uuid;
  result json;
BEGIN
  SELECT user_id INTO user_id_var
  FROM stripe_customers
  WHERE customer_id = customer_id_input;

  IF user_id_var IS NULL THEN
    RAISE EXCEPTION 'No user found for customer_id: %', customer_id_input;
  END IF;

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
    'direct_' || gen_random_uuid()::text,
    'active',
    EXTRACT(EPOCH FROM NOW())::bigint,
    EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint,
    NOW(),
    NOW()
  )
  ON CONFLICT (customer_id) 
  DO UPDATE SET
    status = 'active',
    current_period_end = EXTRACT(EPOCH FROM NOW() + INTERVAL '30 days')::bigint,
    updated_at = NOW();

  result := sync_premium_status(user_id_var);
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função para sincronizar customer
DROP FUNCTION IF EXISTS sync_customer_subscription_status(text);

CREATE FUNCTION sync_customer_subscription_status(customer_id_input text)
RETURNS json AS $$
DECLARE
  user_id_var uuid;
  result json;
BEGIN
  SELECT user_id INTO user_id_var
  FROM stripe_customers
  WHERE customer_id = customer_id_input;

  IF user_id_var IS NULL THEN
    RAISE EXCEPTION 'No user found for customer_id: %', customer_id_input;
  END IF;

  result := sync_premium_status(user_id_var);
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Função para expirar assinaturas vencidas
CREATE OR REPLACE FUNCTION expire_old_subscriptions()
RETURNS TABLE (
  user_id uuid,
  old_plan text,
  new_plan text,
  expired_at timestamptz
) AS $$
DECLARE
  now_timestamp bigint;
  user_rec RECORD;
BEGIN
  now_timestamp := EXTRACT(EPOCH FROM NOW())::bigint;

  RETURN QUERY
  WITH expired_users AS (
    SELECT DISTINCT sc.user_id
    FROM stripe_customers sc
    JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
    WHERE ss.status IN ('active', 'trialing')
      AND ss.current_period_end < now_timestamp
  )
  SELECT 
    eu.user_id,
    p.plan_type as old_plan,
    'free'::text as new_plan,
    NOW() as expired_at
  FROM expired_users eu
  JOIN profiles p ON eu.user_id = p.id
  WHERE p.plan_type = 'premium';

  UPDATE stripe_subscriptions
  SET 
    status = 'canceled',
    updated_at = NOW()
  WHERE status IN ('active', 'trialing')
    AND current_period_end < now_timestamp;

  FOR user_rec IN 
    SELECT DISTINCT sc.user_id
    FROM stripe_customers sc
    JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
    WHERE ss.current_period_end < now_timestamp
  LOOP
    PERFORM sync_premium_status(user_rec.user_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Atualizar check_and_reset_tickets
DROP FUNCTION IF EXISTS check_and_reset_tickets(uuid);

CREATE FUNCTION check_and_reset_tickets(user_id_param uuid)
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
BEGIN
  premium_user := is_premium_active(user_id_param);

  SELECT * INTO current_tickets
  FROM user_tickets
  WHERE user_id = user_id_param;

  IF NOT FOUND THEN
    INSERT INTO user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
    VALUES (
      user_id_param,
      CASE WHEN premium_user THEN 3000 ELSE 250 END,
      CASE WHEN premium_user THEN 'premium' ELSE 'free' END,
      NOW(),
      NOW() + INTERVAL '30 days'
    )
    RETURNING * INTO current_tickets;
  END IF;

  IF premium_user THEN
    new_ticket_count := 3000;
  ELSE
    new_ticket_count := 250;
  END IF;

  IF current_tickets.next_reset <= NOW() THEN
    UPDATE user_tickets
    SET 
      tickets_remaining = new_ticket_count,
      plan_type = CASE WHEN premium_user THEN 'premium' ELSE 'free' END,
      last_reset_at = NOW(),
      next_reset = NOW() + INTERVAL '30 days',
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Corrigir todos os usuários
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN 
    SELECT DISTINCT id FROM profiles
  LOOP
    PERFORM sync_premium_status(user_record.id);
  END LOOP;
END $$;

-- 10. Expirar assinaturas antigas
SELECT * FROM expire_old_subscriptions();

-- 11. View de monitoramento
DROP VIEW IF EXISTS premium_users_status;

CREATE VIEW premium_users_status AS
SELECT 
  p.id as user_id,
  p.username,
  p.plan_type as profile_plan,
  ut.plan_type as tickets_plan,
  ut.tickets_remaining,
  ss.subscription_id,
  ss.status as subscription_status,
  TO_TIMESTAMP(ss.current_period_end) as subscription_expires_at,
  CASE 
    WHEN ss.status IN ('active', 'trialing') AND ss.current_period_end > EXTRACT(EPOCH FROM NOW())::bigint 
    THEN true 
    ELSE false 
  END as should_be_premium,
  CASE
    WHEN p.plan_type = 'premium' AND ss.current_period_end < EXTRACT(EPOCH FROM NOW())::bigint
    THEN true
    ELSE false
  END as needs_downgrade
FROM profiles p
LEFT JOIN user_tickets ut ON p.id = ut.user_id
LEFT JOIN stripe_customers sc ON p.id = sc.user_id
LEFT JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
WHERE p.plan_type = 'premium' OR ss.subscription_id IS NOT NULL
ORDER BY ss.current_period_end DESC NULLS LAST;

GRANT SELECT ON premium_users_status TO authenticated;