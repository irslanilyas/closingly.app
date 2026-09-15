-- Which calendar entries are actually calls.
--
-- A calendar holds flight confirmations, birthdays, focus blocks and holidays
-- alongside client meetings. Showing all of them buried the four that matter.
--
-- Classified rather than filtered at sync: a real call that the rules get
-- wrong would otherwise vanish with no way to find it. The meetings list
-- defaults to calls and offers the rest behind a toggle.
alter table public.meetings
  add column if not exists is_call boolean not null default true,
  add column if not exists event_type text,
  add column if not exists not_call_reason text;

comment on column public.meetings.is_call is
  'Whether this calendar entry looks like a call worth recording. False for flights, birthdays, focus blocks and solo holds.';
comment on column public.meetings.event_type is
  'Google eventType: default | outOfOffice | focusTime | workingLocation | birthday | fromGmail.';
comment on column public.meetings.not_call_reason is
  'Why it was classified out, so the user can see the reason rather than just the absence.';

-- The meetings list reads calls-first, most recent first, in both directions.
create index if not exists meetings_call_list_idx
  on public.meetings (user_id, is_call, starts_at desc);
