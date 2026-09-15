-- Follow-ups, notifications, and deal notes.
--
-- These three are what turn a record of past calls into something that tells
-- you what to do next. Follow-ups are the work queue, notifications are how
-- that queue reaches you when the app is closed, and notes are the human
-- context a transcript can never contain.

-- ------------------------------------------------------------- follow_ups --
-- One row per thing that wants doing on a deal. Raised automatically by rules
-- (a proposal sent and never opened, a deal that stopped moving) or by hand.
--
-- The draft lives on the row rather than being generated on open: the point
-- of the workspace is that the work is already done when you get there.
create table if not exists public.follow_ups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  deal_id       uuid references public.deals(id) on delete cascade,

  kind          text not null default 'nudge'
                check (kind in ('nudge','proposal_chase','unanswered_question',
                                'check_in','scope_risk','custom')),
  status        text not null default 'open'
                check (status in ('open','snoozed','sent','dismissed','done')),

  -- Why this appeared, in the user's language. A queue item with no stated
  -- reason is noise, and noise is what makes people abandon a queue.
  reason        text not null,
  priority      smallint not null default 2 check (priority between 1 and 3),

  due_at        timestamptz not null default now(),
  snoozed_until timestamptz,

  draft_subject text,
  draft_body    text,
  drafted_at    timestamptz,

  sent_at       timestamptz,
  sent_via      text check (sent_via in ('gmail','copied','external')),

  source        text not null default 'auto' check (source in ('auto','manual')),
  -- Lets a rule recognise the item it already raised instead of raising it
  -- again on every sweep.
  dedupe_key    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.follow_ups is
  'The work queue. One row per thing that wants doing on a deal, with the draft already written and the reason it surfaced.';

create unique index if not exists follow_ups_dedupe_idx
  on public.follow_ups (user_id, dedupe_key)
  where dedupe_key is not null and status in ('open','snoozed');

create index if not exists follow_ups_queue_idx
  on public.follow_ups (user_id, status, due_at);
create index if not exists follow_ups_deal_idx
  on public.follow_ups (deal_id, created_at desc);

-- ---------------------------------------------------------- notifications --
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  kind        text not null,
  title       text not null,
  body        text,
  -- Where clicking it goes. Stored rather than derived so an old notification
  -- keeps working after a route is renamed.
  href        text,

  entity_type text,
  entity_id   uuid,

  read_at     timestamptz,
  -- Set once the digest that carried it has gone out, so a notification is
  -- never emailed twice.
  emailed_at  timestamptz,

  created_at  timestamptz not null default now()
);

comment on table public.notifications is
  'In-app notification store. Also the queue the email digest reads from; emailed_at is what stops a second send.';

create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index if not exists notifications_feed_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_pending_email_idx
  on public.notifications (user_id, created_at)
  where emailed_at is null;

-- ------------------------------------------------------------- deal_notes --
-- What a transcript cannot hold: the read on the room, the thing they said
-- off-recording, the correction to what the model extracted.
create table if not exists public.deal_notes (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  -- Private notes must never be copied into a client-facing document without
  -- an explicit transformation step. This flag is what generation checks.
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.deal_notes.is_private is
  'Private by default. Generation may only read a note when this is false, or through an explicit review step.';

create index if not exists deal_notes_deal_idx
  on public.deal_notes (deal_id, created_at desc);

-- ------------------------------------------------------------ preferences --
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default
    '{"email_digest":"daily","proposal_opened":true,"follow_up_due":true,"meeting_processed":true}'::jsonb,
  add column if not exists timezone text not null default 'UTC';

comment on column public.profiles.notification_prefs is
  'Per-kind delivery. email_digest is off | daily | weekly; the booleans gate in-app notifications by kind.';

-- -------------------------------------------------------------------- RLS --
alter table public.follow_ups    enable row level security;
alter table public.notifications enable row level security;
alter table public.deal_notes    enable row level security;

create policy follow_ups_select on public.follow_ups for select
  using ((select auth.uid()) = user_id);
create policy follow_ups_insert on public.follow_ups for insert
  with check ((select auth.uid()) = user_id);
create policy follow_ups_update on public.follow_ups for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy follow_ups_delete on public.follow_ups for delete
  using ((select auth.uid()) = user_id);

-- Notifications are written by the server, never by the browser: a client that
-- can create its own notifications can fake one from the product.
create policy notifications_select on public.notifications for select
  using ((select auth.uid()) = user_id);
create policy notifications_update on public.notifications for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy deal_notes_select on public.deal_notes for select
  using ((select auth.uid()) = user_id);
create policy deal_notes_insert on public.deal_notes for insert
  with check ((select auth.uid()) = user_id);
create policy deal_notes_update on public.deal_notes for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy deal_notes_delete on public.deal_notes for delete
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- triggers --
drop trigger if exists set_follow_ups_updated_at on public.follow_ups;
create trigger set_follow_ups_updated_at before update on public.follow_ups
  for each row execute function public.handle_updated_at();

drop trigger if exists set_deal_notes_updated_at on public.deal_notes;
create trigger set_deal_notes_updated_at before update on public.deal_notes
  for each row execute function public.handle_updated_at();
