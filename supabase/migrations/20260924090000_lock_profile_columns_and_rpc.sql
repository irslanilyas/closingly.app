-- Two holes a browser session could reach directly through PostgREST, closed.
-- Safe to apply before or after the matching code deploy: nothing the app
-- writes from a user session is affected.

-- ── 1. Security-definer functions callable by anyone ──────────────────────
-- Both were executable by `anon` and `authenticated` over /rest/v1/rpc. The
-- limiter takes the user id as an argument, so anyone could exhaust another
-- user's limits, or fill the table. Only the server calls either function,
-- and it does so as service_role.
revoke execute on function public.increment_rate_limit(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.prune_rate_limits()
  from public, anon, authenticated;
grant execute on function public.increment_rate_limit(uuid, text, timestamptz)
  to service_role;
grant execute on function public.prune_rate_limits()
  to service_role;

-- ── 2. Profile columns a user may write ───────────────────────────────────
-- The update policy scopes a user to their own row, but not to its columns,
-- so a session could raise its own recording_seconds_limit (Recall bills per
-- hour), reset recording_seconds_used, or overwrite google_tokens. Row-level
-- security cannot express "these columns only"; column privileges can.
--
-- The grant list is exactly what the app writes from a user session:
-- notification settings, the setup checklist, calendar status, and the
-- onboarding upsert (which also sets id and email, hence both). Everything
-- else is written by the server with the service role, which is unaffected.
revoke insert, update on public.profiles from anon, authenticated;

grant insert (
  id, email, full_name, avatar_url, onboarding_completed_at, onboarding_step
) on public.profiles to authenticated;

grant update (
  id, email, full_name, username, website, avatar_url, timezone,
  weekly_capacity_hours, onboarding_completed_at, onboarding_step,
  calendar_status, checklist_state, notification_prefs
) on public.profiles to authenticated;
