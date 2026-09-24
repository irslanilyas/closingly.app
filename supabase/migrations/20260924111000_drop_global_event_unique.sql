-- Step 2 of 2. Apply only AFTER the code upserting on
-- (user_id, google_event_id) is deployed: the older code upserts on
-- google_event_id alone and fails once this constraint is gone. Until this
-- runs, two users on the same event still collide.
alter table public.meetings
  drop constraint if exists meetings_google_event_id_key;
