/*
  # Correção do Sistema de Tickets v3

  ## Resumo
  Corrige o sistema de tickets para funcionar adequadamente com reset automático
  mensal e valores corretos para planos free (250) e premium (3000).

  ## Mudanças
  - Free: 250 tickets por mês
  - Premium: 3000 tickets por mês
  - Reset mensal (30 dias)
  - Funções automáticas de reset e verificação
*/

-- 1. Atualizar next_reset para todos os usuários que têm data no passado
UPDATE user_tickets
SET 
  next_reset = NOW() + INTERVAL '30 days',
  tickets_remaining = CASE
    WHEN plan_type = 'premium' AND tickets_remaining < 3000 THEN 3000
    WHEN plan_type = 'free' AND tickets_remaining < 250 THEN 250
    ELSE tickets_remaining
  END,
  last_reset_at = NOW(),
  updated_at = NOW()
WHERE next_reset IS NULL OR next_reset < NOW();

-- 2. Drop e recriar função para verificar e resetar tickets
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
BEGIN
  SELECT * INTO current_tickets
  FROM user_tickets
  WHERE user_id = user_id_param;

  IF NOT FOUND THEN
    INSERT INTO user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
    VALUES (
      user_id_param,
      250,
      'free',
      NOW(),
      NOW() + INTERVAL '30 days'
    )
    RETURNING * INTO current_tickets;
  END IF;

  IF current_tickets.next_reset <= NOW() THEN
    IF current_tickets.plan_type = 'premium' THEN
      new_ticket_count := 3000;
    ELSE
      new_ticket_count := 250;
    END IF;

    UPDATE user_tickets
    SET 
      tickets_remaining = new_ticket_count,
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

-- 3. Drop e recriar função para deduzir tickets
DROP FUNCTION IF EXISTS deduct_tickets(uuid, integer);

CREATE FUNCTION deduct_tickets(user_id_param uuid, amount integer)
RETURNS TABLE (
  success boolean,
  tickets_remaining integer,
  message text
) AS $$
DECLARE
  current_record RECORD;
BEGIN
  SELECT * INTO current_record
  FROM check_and_reset_tickets(user_id_param);

  IF current_record.tickets_remaining < amount THEN
    RETURN QUERY
    SELECT 
      false,
      current_record.tickets_remaining,
      'Insufficient tickets'::text;
    RETURN;
  END IF;

  UPDATE user_tickets
  SET 
    tickets_remaining = tickets_remaining - amount,
    updated_at = NOW()
  WHERE user_id = user_id_param;

  RETURN QUERY
  SELECT 
    true,
    (current_record.tickets_remaining - amount),
    'Success'::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Drop e recriar função para atualizar plan_type
DROP FUNCTION IF EXISTS update_user_plan(uuid, text);

CREATE FUNCTION update_user_plan(user_id_param uuid, new_plan text)
RETURNS void AS $$
DECLARE
  new_ticket_count integer;
BEGIN
  IF new_plan = 'premium' THEN
    new_ticket_count := 3000;
  ELSE
    new_ticket_count := 250;
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

-- 5. Atualizar função handle_new_user
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE FUNCTION public.handle_new_user()
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
    250,
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- 6. Atualizar constraint
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_tickets_tickets_remaining_check'
  ) THEN
    ALTER TABLE user_tickets 
    DROP CONSTRAINT user_tickets_tickets_remaining_check;
  END IF;
END $$;

ALTER TABLE user_tickets 
ADD CONSTRAINT user_tickets_tickets_remaining_check 
CHECK (tickets_remaining >= 0);

-- 7. Criar view para monitorar resets
DROP VIEW IF EXISTS users_needing_reset;

CREATE VIEW users_needing_reset AS
SELECT 
  user_id,
  plan_type,
  tickets_remaining,
  last_reset_at,
  next_reset,
  EXTRACT(EPOCH FROM (NOW() - next_reset)) as seconds_overdue
FROM user_tickets
WHERE next_reset < NOW()
ORDER BY next_reset ASC;

GRANT SELECT ON users_needing_reset TO authenticated;

-- 8. Adicionar índice simples para next_reset
DROP INDEX IF EXISTS idx_user_tickets_next_reset;
CREATE INDEX idx_user_tickets_next_reset ON user_tickets (next_reset);

-- 9. Comentários
COMMENT ON FUNCTION check_and_reset_tickets IS 'Verifica e reseta automaticamente os tickets do usuário se next_reset foi atingido (30 dias)';
COMMENT ON FUNCTION deduct_tickets IS 'Deduz tickets do usuário com verificação automática de reset';
COMMENT ON FUNCTION update_user_plan IS 'Atualiza plano do usuário (free=250, premium=3000) e ajusta tickets';
COMMENT ON VIEW users_needing_reset IS 'Lista usuários cujo next_reset já passou e precisam de reset';