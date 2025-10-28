/*
  # Padronização de Tickets para 300 (Free) e 3000 (Premium)

  ## Resumo
  Corrige todas as inconsistências de tickets e padroniza valores:
  - Free: 300 tickets por mês (padrão correto)
  - Premium: 3000 tickets por mês

  ## Problemas Encontrados
  - Usuários free com valores variados (250-3000)
  - Funções usando 250 ao invés de 300
  - Inconsistências após reset

  ## Correções
  1. Atualiza todos os tickets de usuários free para mínimo 300
  2. Corrige todas as funções para usar 300
  3. Valida premium status antes de definir tickets
*/

-- 1. Primeiro, validar e corrigir plan_type baseado em subscriptions reais
UPDATE user_tickets ut
SET plan_type = CASE 
  WHEN EXISTS (
    SELECT 1 
    FROM stripe_customers sc
    JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
    WHERE sc.user_id = ut.user_id
      AND ss.status IN ('active', 'trialing')
      AND ss.current_period_end > EXTRACT(EPOCH FROM NOW())::bigint
  ) THEN 'premium'
  ELSE 'free'
END,
updated_at = NOW();

-- 2. Atualizar tickets baseado no plan_type correto
UPDATE user_tickets
SET 
  tickets_remaining = CASE 
    WHEN plan_type = 'premium' AND tickets_remaining < 3000 THEN 3000
    WHEN plan_type = 'free' AND tickets_remaining < 300 THEN 300
    ELSE tickets_remaining
  END,
  updated_at = NOW();

-- 3. Garantir que profiles também estejam corretos
UPDATE profiles p
SET 
  plan_type = ut.plan_type,
  updated_at = NOW()
FROM user_tickets ut
WHERE p.id = ut.user_id
  AND p.plan_type != ut.plan_type;

-- 4. Recriar função is_premium_active (sem mudanças, apenas garantir que existe)
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

-- 5. Atualizar sync_premium_status para usar 300
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
    new_ticket_count := 300;
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
    'tickets', new_ticket_count,
    'synced_at', NOW()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Atualizar check_and_reset_tickets para usar 300
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
BEGIN
  premium_user := is_premium_active(user_id_param);

  SELECT * INTO current_tickets
  FROM user_tickets
  WHERE user_id = user_id_param;

  IF NOT FOUND THEN
    INSERT INTO user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
    VALUES (
      user_id_param,
      CASE WHEN premium_user THEN 3000 ELSE 300 END,
      CASE WHEN premium_user THEN 'premium' ELSE 'free' END,
      NOW(),
      NOW() + INTERVAL '30 days'
    )
    RETURNING * INTO current_tickets;
  END IF;

  IF premium_user THEN
    new_ticket_count := 3000;
  ELSE
    new_ticket_count := 300;
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

-- 7. Atualizar update_user_plan para usar 300
CREATE OR REPLACE FUNCTION update_user_plan(user_id_param uuid, new_plan text)
RETURNS void AS $$
DECLARE
  new_ticket_count integer;
BEGIN
  IF new_plan = 'premium' THEN
    new_ticket_count := 3000;
  ELSE
    new_ticket_count := 300;
  END IF;

  UPDATE user_tickets
  SET 
    plan_type = new_plan,
    tickets_remaining = GREATEST(tickets_remaining, new_ticket_count),
    updated_at = NOW()
  WHERE user_id = user_id_param;

  UPDATE profiles
  SET 
    plan_type = new_plan,
    updated_at = NOW()
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Atualizar handle_new_user para usar 300
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  username_from_metadata text;
  final_username text;
BEGIN
  username_from_metadata := (new.raw_user_meta_data->>'username')::text;
  
  IF username_from_metadata IS NOT NULL AND length(username_from_metadata) > 0 THEN
    final_username := username_from_metadata;
  ELSIF new.email IS NOT NULL THEN
    final_username := SPLIT_PART(new.email, '@', 1);
  ELSE
    final_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;
  
  INSERT INTO public.profiles (id, username, avatar_url, bio, created_at, updated_at, plan_type, avatar_frame, banner, active_tag)
  VALUES (
    new.id, 
    final_username,
    (new.raw_user_meta_data->>'avatar_url')::text,
    NULL,
    now(), 
    now(),
    'free',
    '',
    '',
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
  VALUES (
    new.id, 
    300,
    'free', 
    now(),
    now() + INTERVAL '30 days'
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- 9. Atualizar activate_premium_for_customer
CREATE OR REPLACE FUNCTION activate_premium_for_customer(customer_id_input text)
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

-- 10. Validar todos os usuários novamente
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

-- 11. Verificação final - mostrar distribuição de tickets
DO $$
DECLARE
  stats RECORD;
BEGIN
  SELECT 
    plan_type,
    COUNT(*) as total_users,
    MIN(tickets_remaining) as min_tickets,
    MAX(tickets_remaining) as max_tickets,
    AVG(tickets_remaining)::int as avg_tickets
  INTO stats
  FROM user_tickets
  WHERE plan_type = 'free'
  GROUP BY plan_type;
  
  RAISE NOTICE 'Free users: % | Tickets range: %-% | Average: %', 
    stats.total_users, stats.min_tickets, stats.max_tickets, stats.avg_tickets;
    
  SELECT 
    plan_type,
    COUNT(*) as total_users,
    MIN(tickets_remaining) as min_tickets,
    MAX(tickets_remaining) as max_tickets,
    AVG(tickets_remaining)::int as avg_tickets
  INTO stats
  FROM user_tickets
  WHERE plan_type = 'premium'
  GROUP BY plan_type;
  
  IF FOUND THEN
    RAISE NOTICE 'Premium users: % | Tickets range: %-% | Average: %', 
      stats.total_users, stats.min_tickets, stats.max_tickets, stats.avg_tickets;
  ELSE
    RAISE NOTICE 'No premium users found';
  END IF;
END $$;

-- 12. Comentários
COMMENT ON FUNCTION sync_premium_status IS 'Sincroniza plan_type em profiles e user_tickets (free=300, premium=3000)';
COMMENT ON FUNCTION check_and_reset_tickets IS 'Verifica e reseta tickets (free=300, premium=3000) baseado em status real';
COMMENT ON FUNCTION update_user_plan IS 'Atualiza plano do usuário (free=300, premium=3000)';
COMMENT ON FUNCTION handle_new_user IS 'Cria novo usuário com 300 tickets (free) por padrão';