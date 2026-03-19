/*
  # Fix Lifetime Premium Functions
  
  Corrige as funcoes de premium para:
  1. Manter compatibilidade com o parametro original (user_id_input)
  2. Garantir que usuarios com assinatura Stripe continuem premium
  3. Adicionar lifetime premium como check adicional (nao substituto)
*/

-- Recriar is_premium_active com nome de parametro correto
DROP FUNCTION IF EXISTS is_premium_active(uuid);

CREATE OR REPLACE FUNCTION is_premium_active(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
  has_subscription boolean;
BEGIN
  -- First check for lifetime premium (highest priority - immediate return)
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = user_id_input;
  
  IF has_lifetime = true THEN
    RETURN true;
  END IF;
  
  -- Check for active Stripe subscription (original logic)
  SELECT EXISTS (
    SELECT 1
    FROM stripe_subscriptions
    WHERE user_id = user_id_input
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > NOW())
  ) INTO has_subscription;

  RETURN COALESCE(has_subscription, false);
END;
$$;

-- Recriar get_user_premium_status com nome de parametro correto
DROP FUNCTION IF EXISTS get_user_premium_status(uuid);

CREATE OR REPLACE FUNCTION get_user_premium_status(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN is_premium_active(user_id_input);
END;
$$;

-- Recriar is_lifetime_premium com nome de parametro correto
DROP FUNCTION IF EXISTS is_lifetime_premium(uuid);

CREATE OR REPLACE FUNCTION is_lifetime_premium(user_id_input uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
BEGIN
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = user_id_input;
  
  RETURN COALESCE(has_lifetime, false);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_premium_active TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_premium_status TO authenticated;
GRANT EXECUTE ON FUNCTION is_lifetime_premium TO authenticated;

-- Recriar sync_premium_status
DROP FUNCTION IF EXISTS sync_premium_status(uuid);

CREATE OR REPLACE FUNCTION sync_premium_status(user_id_input uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_lifetime boolean;
  premium_active boolean;
  new_plan_type text;
BEGIN
  -- Check for lifetime premium first
  SELECT lifetime_premium INTO has_lifetime
  FROM profiles
  WHERE id = user_id_input;
  
  -- If lifetime premium, ensure plan_type is 'premium' and return
  IF has_lifetime = true THEN
    UPDATE profiles
    SET plan_type = 'premium', updated_at = NOW()
    WHERE id = user_id_input AND plan_type != 'premium';
    
    RETURN json_build_object(
      'success', true,
      'plan_type', 'premium',
      'is_lifetime', true,
      'message', 'Lifetime premium - no changes needed'
    );
  END IF;
  
  -- For non-lifetime users, check subscription status
  premium_active := is_premium_active(user_id_input);
  
  IF premium_active THEN
    new_plan_type := 'premium';
  ELSE
    new_plan_type := 'free';
  END IF;
  
  -- Update plan_type if needed
  UPDATE profiles
  SET plan_type = new_plan_type, updated_at = NOW()
  WHERE id = user_id_input AND plan_type != new_plan_type;
  
  RETURN json_build_object(
    'success', true,
    'plan_type', new_plan_type,
    'is_lifetime', false,
    'message', 'Premium status synced'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_premium_status TO authenticated;
