/*
  # Redesign Ticket System: Daily Reset Synchronized to Brasilia Midnight

  ## Summary
  Replaces the previous monthly/subscription-period ticket reset with a daily reset
  synchronized to midnight in the America/Sao_Paulo timezone (GMT-3) — the same
  clock used by "Recomendação do Dia" and "Do Oráculo para Você".

  ## New Allocations
  - Free users:    3 tickets per day
  - Premium users: 20 tickets per day

  ## Premium Upgrade Behavior
  When a free user activates premium, their tickets are immediately set to 20
  regardless of how many they currently have (even if at 0).

  ## New & Updated Functions
  1. `get_next_daily_reset()` — helper that returns the next midnight timestamp in
     America/Sao_Paulo converted to UTC.
  2. `check_and_reset_tickets(user_id_param)` — rewritten to use daily cadence;
     also handles mid-cycle premium upgrades by boosting tickets to 20.
  3. `sync_premium_status(user_id_param)` — rewritten so premium activation always
     sets tickets to 20 immediately and schedules next reset to next midnight.

  ## Notes
  - `activate_premium_for_customer` calls `sync_premium_status` internally, so it
    inherits the new behavior automatically.
  - All existing `next_reset` values are updated to the next midnight for active
    premium users; free users keep their current next_reset if it is still in the
    future (they will be corrected on their next oracle call).
*/

-- ============================================================
-- 1. Helper: next midnight in America/Sao_Paulo (returned as UTC)
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_daily_reset()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    (NOW() AT TIME ZONE 'America/Sao_Paulo')::date + INTERVAL '1 day'
  )::timestamp AT TIME ZONE 'America/Sao_Paulo';
END;
$$;

-- ============================================================
-- 2. check_and_reset_tickets — daily cadence, new allocations
-- ============================================================
CREATE OR REPLACE FUNCTION check_and_reset_tickets(user_id_param uuid)
RETURNS TABLE (
  tickets_remaining integer,
  last_reset_at     timestamptz,
  next_reset        timestamptz,
  plan_type         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tickets user_tickets%ROWTYPE;
  new_ticket_count integer;
  premium_user     boolean;
  next_midnight    timestamptz;
BEGIN
  premium_user  := is_premium_active(user_id_param);
  next_midnight := get_next_daily_reset();

  SELECT * INTO current_tickets
  FROM user_tickets
  WHERE user_id = user_id_param;

  IF NOT FOUND THEN
    INSERT INTO user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
    VALUES (
      user_id_param,
      CASE WHEN premium_user THEN 20 ELSE 3 END,
      CASE WHEN premium_user THEN 'premium' ELSE 'free' END,
      NOW(),
      next_midnight
    )
    RETURNING * INTO current_tickets;

    RETURN QUERY
    SELECT
      current_tickets.tickets_remaining,
      current_tickets.last_reset_at,
      current_tickets.next_reset,
      current_tickets.plan_type;
    RETURN;
  END IF;

  -- Daily reset: triggered when next_reset has passed
  IF current_tickets.next_reset <= NOW() THEN
    new_ticket_count := CASE WHEN premium_user THEN 20 ELSE 3 END;

    UPDATE user_tickets
    SET
      tickets_remaining = new_ticket_count,
      plan_type         = CASE WHEN premium_user THEN 'premium' ELSE 'free' END,
      last_reset_at     = NOW(),
      next_reset        = next_midnight,
      updated_at        = NOW()
    WHERE user_id = user_id_param
    RETURNING * INTO current_tickets;

  -- Mid-cycle premium upgrade: user just became premium
  ELSIF premium_user AND current_tickets.plan_type = 'free' THEN
    UPDATE user_tickets
    SET
      tickets_remaining = 20,
      plan_type         = 'premium',
      next_reset        = next_midnight,
      updated_at        = NOW()
    WHERE user_id = user_id_param
    RETURNING * INTO current_tickets;

  -- Mid-cycle premium downgrade: user is no longer premium
  ELSIF NOT premium_user AND current_tickets.plan_type = 'premium' THEN
    UPDATE user_tickets
    SET
      plan_type  = 'free',
      next_reset = next_midnight,
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
$$;

-- ============================================================
-- 3. sync_premium_status — immediate 20-ticket grant on upgrade
-- ============================================================
CREATE OR REPLACE FUNCTION sync_premium_status(user_id_param uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  premium_active   boolean;
  new_plan_type    text;
  next_midnight    timestamptz;
  result           json;
BEGIN
  premium_active := is_premium_active(user_id_param);
  next_midnight  := get_next_daily_reset();

  IF premium_active THEN
    new_plan_type := 'premium';
  ELSE
    new_plan_type := 'free';
  END IF;

  UPDATE profiles
  SET
    plan_type  = new_plan_type,
    updated_at = NOW()
  WHERE id = user_id_param;

  IF premium_active THEN
    -- Always grant 20 tickets immediately on premium activation/sync
    UPDATE user_tickets
    SET
      plan_type         = 'premium',
      tickets_remaining = 20,
      next_reset        = next_midnight,
      last_reset_at     = NOW(),
      updated_at        = NOW()
    WHERE user_id = user_id_param;

    -- Create row if it doesn't exist yet
    INSERT INTO user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
    VALUES (user_id_param, 20, 'premium', NOW(), next_midnight)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    UPDATE user_tickets
    SET
      plan_type  = 'free',
      next_reset = next_midnight,
      updated_at = NOW()
    WHERE user_id = user_id_param;
  END IF;

  result := json_build_object(
    'user_id',    user_id_param,
    'plan_type',  new_plan_type,
    'is_premium', premium_active,
    'tickets',    CASE WHEN premium_active THEN 20 ELSE 3 END,
    'next_reset', next_midnight,
    'synced_at',  NOW()
  );

  RETURN result;
END;
$$;

-- ============================================================
-- 4. Migrate existing rows to the new daily schedule
--    Premium users get next_reset = next midnight
--    Free users also get corrected to next midnight
-- ============================================================
UPDATE user_tickets
SET
  next_reset = get_next_daily_reset(),
  updated_at = NOW()
WHERE next_reset > NOW();
