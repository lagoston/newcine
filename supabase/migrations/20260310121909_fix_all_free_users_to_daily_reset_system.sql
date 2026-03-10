/*
  # Correct All Free Users to Daily Reset System

  ## Problem
  The migration `20260309121647_redesign_tickets_to_daily_reset_system.sql` updated
  the functions but did NOT migrate existing user_tickets rows. All free users created
  before this fix still have:
  - tickets_remaining: 300 (or varied amounts from old system)
  - next_reset: last_reset_at + 30 days (monthly cadence)

  Additionally, 2 users (julioaqs, ikeda) have 3000 tickets with plan_type 'free'
  from a previous inconsistency, and their next_reset is in November 2025 (expired).

  ## Fix
  Update ALL free users who are still on the monthly reset cycle to:
  - tickets_remaining = 3 (correct daily allowance)
  - next_reset = get_next_daily_reset() (next midnight, America/Sao_Paulo)
  - last_reset_at = NOW()

  Users who have already used tickets today (remaining < 3) keep their current
  remaining count so they are not penalized unfairly.
*/

UPDATE user_tickets
SET
  tickets_remaining = CASE
    WHEN tickets_remaining > 3 THEN 3
    ELSE tickets_remaining
  END,
  next_reset  = get_next_daily_reset(),
  last_reset_at = NOW(),
  updated_at  = NOW()
WHERE
  plan_type = 'free'
  AND (
    -- Monthly reset cycle: window is > 7 days (daily would be <= 1 day)
    (next_reset - last_reset_at) > INTERVAL '7 days'
    -- Or next_reset already expired (stuck in old cycle)
    OR next_reset < NOW()
  );
