-- When this user's follow-up rules last ran.
--
-- The sweep costs a model call per drafted item, so it cannot run per user on
-- every worker tick. This column is the throttle: the worker picks the few
-- least-recently-swept accounts each minute and leaves the rest alone.
alter table public.profiles
  add column if not exists follow_ups_swept_at timestamptz,
  add column if not exists digest_sent_at timestamptz;

comment on column public.profiles.follow_ups_swept_at is
  'Throttle for the follow-up sweep. Null means never swept, which sorts first.';
comment on column public.profiles.digest_sent_at is
  'Last email digest. Stops a restarted worker from sending the same digest twice.';

create index if not exists profiles_sweep_due_idx
  on public.profiles (follow_ups_swept_at nulls first);
