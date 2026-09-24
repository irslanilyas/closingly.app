-- A Google event id is unique per event, not per person: every guest on the
-- same event sees the same id. With the id unique across the whole table, the
-- second Closingly user on a shared call hit the first user's row during
-- calendar sync, row-level security refused the update, and that user's
-- entire sync failed ("new row violates row-level security policy (USING
-- expression) for table meetings").
--
-- Step 1 of 2. Apply BEFORE deploying the code that upserts on
-- (user_id, google_event_id): Postgres needs a matching unique constraint for
-- that conflict target. The old single-column one stays for now so the code
-- still live keeps working. Every existing row already satisfies this.
alter table public.meetings
  add constraint meetings_user_google_event_key unique (user_id, google_event_id);
