/*
  # Fix Function Search Path Security

  This migration adds explicit search_path to all functions to prevent search_path manipulation attacks.

  Setting search_path explicitly ensures that:
  - Functions always resolve schema references correctly
  - Prevents malicious users from creating same-named objects in other schemas
  - Follows PostgreSQL security best practices

  All functions are updated to use: SET search_path = public, pg_temp
*/

-- ============================================================================
-- TICKET MANAGEMENT FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_tickets(p_user_id uuid)
RETURNS TABLE (
  tickets_available integer,
  tickets_used integer,
  next_reset timestamptz,
  is_premium boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ut.tickets_available,
    ut.tickets_used,
    ut.next_reset,
    COALESCE(p.plan_type = 'premium', false) as is_premium
  FROM user_tickets ut
  LEFT JOIN profiles p ON p.id = ut.user_id
  WHERE ut.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_tickets_info(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'tickets_available', COALESCE(ut.tickets_available, 300),
    'tickets_used', COALESCE(ut.tickets_used, 0),
    'next_reset', COALESCE(ut.next_reset, calculate_next_reset()),
    'is_premium', COALESCE(p.plan_type = 'premium', false)
  ) INTO result
  FROM user_tickets ut
  LEFT JOIN profiles p ON p.id = ut.user_id
  WHERE ut.user_id = p_user_id;

  RETURN COALESCE(result, json_build_object(
    'tickets_available', 300,
    'tickets_used', 0,
    'next_reset', calculate_next_reset(),
    'is_premium', false
  ));
END;
$$;

CREATE OR REPLACE FUNCTION spend_tickets(p_user_id uuid, p_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  available_tickets integer;
BEGIN
  SELECT tickets_available INTO available_tickets
  FROM user_tickets
  WHERE user_id = p_user_id;

  IF available_tickets >= p_amount THEN
    UPDATE user_tickets
    SET
      tickets_available = tickets_available - p_amount,
      tickets_used = tickets_used + p_amount
    WHERE user_id = p_user_id;
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION deduct_tickets(p_user_id uuid, p_amount integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN spend_tickets(p_user_id, p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION check_and_reset_tickets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE user_tickets
  SET
    tickets_available = 300,
    tickets_used = 0,
    next_reset = calculate_next_reset()
  WHERE next_reset <= NOW();
END;
$$;

CREATE OR REPLACE FUNCTION reset_weekly_tickets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE user_tickets
  SET
    tickets_available = 300,
    tickets_used = 0,
    next_reset = calculate_next_reset()
  WHERE next_reset <= NOW();
END;
$$;

CREATE OR REPLACE FUNCTION create_user_tickets_safely(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO user_tickets (user_id, tickets_available, tickets_used, next_reset)
  VALUES (p_user_id, 300, 0, calculate_next_reset())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- ============================================================================
-- DATE/TIME UTILITY FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION next_monday()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT date_trunc('week', NOW() + INTERVAL '1 week') AT TIME ZONE 'UTC';
$$;

CREATE OR REPLACE FUNCTION calculate_next_reset()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT date_trunc('week', NOW() + INTERVAL '1 week') AT TIME ZONE 'UTC';
$$;

CREATE OR REPLACE FUNCTION get_next_reset_time()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT date_trunc('week', NOW() + INTERVAL '1 week') AT TIME ZONE 'UTC';
$$;

-- ============================================================================
-- PROFILE FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_profile_by_id(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
BEGIN
  SELECT row_to_json(profiles.*) INTO result
  FROM profiles
  WHERE id = p_user_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION get_profile_by_username(p_username text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
BEGIN
  SELECT row_to_json(profiles.*) INTO result
  FROM profiles
  WHERE username = p_username;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NOW(),
    NOW()
  );

  INSERT INTO public.user_tickets (user_id, tickets_available, tickets_used, next_reset)
  VALUES (NEW.id, 300, 0, calculate_next_reset())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- PREMIUM/SUBSCRIPTION FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_premium_status(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_premium boolean;
BEGIN
  SELECT plan_type = 'premium' INTO is_premium
  FROM profiles
  WHERE id = p_user_id;

  RETURN COALESCE(is_premium, false);
END;
$$;

CREATE OR REPLACE FUNCTION get_user_premium_status(p_user_id uuid)
RETURNS TABLE (
  is_premium boolean,
  plan_type text,
  subscription_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(p.plan_type = 'premium', false) as is_premium,
    COALESCE(p.plan_type, 'free') as plan_type,
    COALESCE(s.status, 'inactive') as subscription_status
  FROM profiles p
  LEFT JOIN stripe_subscriptions s ON s.user_id = p.id AND s.status = 'active'
  WHERE p.id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION is_premium_active(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  premium_active boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM stripe_subscriptions
    WHERE user_id = p_user_id
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > NOW())
  ) INTO premium_active;

  RETURN COALESCE(premium_active, false);
END;
$$;

CREATE OR REPLACE FUNCTION update_user_plan(p_user_id uuid, p_plan_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE profiles
  SET plan_type = p_plan_type, updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION activate_premium_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE profiles
  SET plan_type = 'premium', updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION activate_premium_for_customer(p_customer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM stripe_customers
  WHERE customer_id = p_customer_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE profiles
    SET plan_type = 'premium', updated_at = NOW()
    WHERE id = v_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION activate_premium_for_stripe_customer(p_customer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM activate_premium_for_customer(p_customer_id);
END;
$$;

-- ============================================================================
-- STRIPE WEBHOOK HANDLERS
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_subscription_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE profiles
  SET plan_type = 'premium', updated_at = NOW()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_subscription_canceled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE profiles
  SET plan_type = 'free', updated_at = NOW()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_subscription_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE profiles
    SET plan_type = 'premium', updated_at = NOW()
    WHERE id = NEW.user_id;
  ELSIF NEW.status IN ('canceled', 'unpaid', 'past_due') THEN
    UPDATE profiles
    SET plan_type = 'free', updated_at = NOW()
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION handle_subscription_renewed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.current_period_end > NOW() THEN
    UPDATE profiles
    SET plan_type = 'premium', updated_at = NOW()
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- STRIPE UTILITY FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION create_stripe_customer(p_user_id uuid, p_customer_id text, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO stripe_customers (user_id, customer_id, email)
  VALUES (p_user_id, p_customer_id, p_email)
  ON CONFLICT (user_id) DO UPDATE
  SET customer_id = EXCLUDED.customer_id, email = EXCLUDED.email;
END;
$$;

CREATE OR REPLACE FUNCTION get_subscription_status_by_user(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  sub_status text;
BEGIN
  SELECT status INTO sub_status
  FROM stripe_subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN COALESCE(sub_status, 'none');
END;
$$;

CREATE OR REPLACE FUNCTION sync_premium_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE profiles p
  SET plan_type = CASE
    WHEN EXISTS (
      SELECT 1 FROM stripe_subscriptions s
      WHERE s.user_id = p.id
      AND s.status = 'active'
      AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
    ) THEN 'premium'
    ELSE 'free'
  END,
  updated_at = NOW()
  WHERE p.plan_type IS DISTINCT FROM (
    CASE
      WHEN EXISTS (
        SELECT 1 FROM stripe_subscriptions s
        WHERE s.user_id = p.id
        AND s.status = 'active'
        AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
      ) THEN 'premium'
      ELSE 'free'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION sync_subscription_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM sync_premium_status();
END;
$$;

CREATE OR REPLACE FUNCTION sync_customer_subscription_status(p_customer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM stripe_customers
  WHERE customer_id = p_customer_id;

  IF v_user_id IS NOT NULL THEN
    PERFORM sync_premium_status();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_premium_status_for_all_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM sync_premium_status();
END;
$$;

CREATE OR REPLACE FUNCTION expire_old_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE stripe_subscriptions
  SET status = 'expired'
  WHERE status = 'active'
  AND current_period_end < NOW();

  PERFORM sync_premium_status();
END;
$$;

CREATE OR REPLACE FUNCTION diagnose_subscription_issues(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'profile', (SELECT row_to_json(p.*) FROM profiles p WHERE p.id = p_user_id),
    'customer', (SELECT row_to_json(c.*) FROM stripe_customers c WHERE c.user_id = p_user_id),
    'subscriptions', (SELECT json_agg(row_to_json(s.*)) FROM stripe_subscriptions s WHERE s.user_id = p_user_id),
    'active_sub_exists', EXISTS (
      SELECT 1 FROM stripe_subscriptions
      WHERE user_id = p_user_id AND status = 'active'
    )
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION process_stripe_webhook_event(p_event_type text, p_data json)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Process webhook based on type
  -- Implementation depends on specific webhook needs
  NULL;
END;
$$;

-- ============================================================================
-- MOVIE AND LIST FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_all_movie_ids()
RETURNS TABLE (movie_id integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT id as movie_id FROM movies;
$$;

CREATE OR REPLACE FUNCTION get_user_lists_by_id(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(lists.*)) INTO result
  FROM lists
  WHERE user_id = p_user_id
  ORDER BY created_at DESC;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================================
-- RECOMMENDATION FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION count_unread_recommendations(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  unread_count integer;
BEGIN
  SELECT COUNT(*) INTO unread_count
  FROM recommendations
  WHERE to_user_id = p_user_id
  AND is_read = false
  AND expires_at > NOW();

  RETURN COALESCE(unread_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION delete_expired_recommendations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM recommendations
  WHERE expires_at < NOW();
END;
$$;

CREATE OR REPLACE FUNCTION count_user_recommendations_this_week(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec_count integer;
BEGIN
  SELECT COUNT(*) INTO rec_count
  FROM recommendations
  WHERE from_user_id = p_user_id
  AND created_at >= date_trunc('week', NOW());

  RETURN COALESCE(rec_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION get_user_recommendation_limit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_premium boolean;
BEGIN
  SELECT plan_type = 'premium' INTO is_premium
  FROM profiles
  WHERE id = p_user_id;

  RETURN CASE WHEN COALESCE(is_premium, false) THEN 999999 ELSE 5 END;
END;
$$;

CREATE OR REPLACE FUNCTION can_send_recommendation(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count integer;
  user_limit integer;
BEGIN
  SELECT count_user_recommendations_this_week(p_user_id) INTO current_count;
  SELECT get_user_recommendation_limit(p_user_id) INTO user_limit;

  RETURN current_count < user_limit;
END;
$$;
