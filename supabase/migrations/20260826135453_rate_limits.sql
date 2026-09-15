-- Server-side, fixed-window rate limiting for user-triggered AI calls.
--
-- Serverless functions have no shared memory between invocations, so an
-- in-process counter is worthless here — every request could land on a
-- different instance. Postgres already is the shared state every other part
-- of this app trusts, so it's the shared state for this too.
create table rate_limits (
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, action, window_start)
);

-- Deny-all RLS, same pattern as job_queue: only ever touched by the admin
-- client from server routes, never from the browser.
alter table rate_limits enable row level security;

-- Atomic increment-and-read. A plain client-side upsert can't express
-- "count = count + 1" as an expression — it would just overwrite with
-- whatever the client last read, which loses concurrent increments. This
-- does the read-modify-write as one statement, so two requests landing at
-- the same instant both get counted rather than one clobbering the other.
create or replace function increment_rate_limit(
  p_user_id uuid,
  p_action text,
  p_window_start timestamptz
) returns int
language sql
security definer
set search_path = public
as $$
  insert into rate_limits (user_id, action, window_start, count)
  values (p_user_id, p_action, p_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set count = rate_limits.count + 1
  returning count;
$$;

-- Old windows are pure bloat once they age out — nothing ever reads a
-- window after it closes. Cheap to sweep opportunistically rather than run
-- a separate scheduled job for it.
create or replace function prune_rate_limits() returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limits where window_start < now() - interval '2 days';
$$;
