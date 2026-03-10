/*
  # Fix handle_new_user: Apply Daily Reset System to New Accounts

  ## Problem
  The migration `20260309121647_redesign_tickets_to_daily_reset_system.sql` rewrote
  `check_and_reset_tickets` and `sync_premium_status` to use the new daily reset
  system (3 tickets for free, 20 for premium, reset at Brasilia midnight), but it
  did NOT update the `handle_new_user` trigger function.

  As a result, every new account was still being created with:
  - 300 tickets (old monthly value)
  - next_reset = now() + 30 days (old monthly cadence)

  ## Fix
  Rewrite `handle_new_user` so that new users receive:
  - Free:    3 tickets, next_reset = next midnight (America/Sao_Paulo)
  - Premium: 20 tickets (handled by sync_premium_status after Stripe webhook)

  Uses the existing `get_next_daily_reset()` helper introduced in the daily-reset
  migration to keep the reset time consistent across all functions.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  username_from_metadata text;
  final_username          text;
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
    3,
    'free',
    now(),
    get_next_daily_reset()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN new;
END;
$$;
