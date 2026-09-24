-- Rate limiting for callers with no account yet.
--
-- `rate_limits` is keyed by profile id (with a foreign key to profiles), which
-- is right for AI features and impossible for sign-in, the OAuth callback and
-- the public proposal tracker, where nobody is signed in. This is the same
-- fixed-window counter keyed by an opaque string instead: the server passes a
-- SHA-256 of the client IP, so no raw address is ever stored.
--
-- Additive and safe to apply at any time. Until it exists the app's limiter
-- fails open (logs, and lets the request through), the same way the existing
-- limiter behaves when its table is unreachable.

create table if not exists public.keyed_rate_limits (
  key text not null,
  action text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, action, window_start)
);

-- Deny-all, like rate_limits and job_queue: only the server touches it.
alter table public.keyed_rate_limits enable row level security;

create or replace function public.increment_keyed_rate_limit(
  p_key text,
  p_action text,
  p_window_start timestamptz
) returns int
language sql
security definer
set search_path = public
as $$
  insert into keyed_rate_limits (key, action, window_start, count)
  values (p_key, p_action, p_window_start, 1)
  on conflict (key, action, window_start)
  do update set count = keyed_rate_limits.count + 1
  returning count;
$$;

revoke execute on function public.increment_keyed_rate_limit(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.increment_keyed_rate_limit(text, text, timestamptz)
  to service_role;

-- One sweep for both tables. `create or replace` keeps the existing grants,
-- which the previous migration already restricted to service_role.
create or replace function public.prune_rate_limits() returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limits where window_start < now() - interval '2 days';
  delete from keyed_rate_limits where window_start < now() - interval '2 days';
$$;
