-- ============================================================================
-- ROS Phase 1 — meeting pipeline, proposals, sharing, tracking, job queue
-- ============================================================================

-- ---------------------------------------------------------------- helpers --
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- profiles --
-- Google OAuth tokens (Phase 2) + recording metering (Recall is billed per
-- hour, so the allowance has to be enforced in-app, not discovered on invoice).
alter table public.profiles
  add column if not exists google_tokens jsonb,
  add column if not exists recording_seconds_used integer not null default 0,
  add column if not exists recording_seconds_limit integer not null default 18000;

comment on column public.profiles.google_tokens is
  'Google OAuth access/refresh tokens for Calendar + Gmail. Never expose to the client.';
comment on column public.profiles.recording_seconds_limit is
  'Recall.ai recording allowance. Default 18000s = 5 hours (beta tier).';

-- --------------------------------------------------------------- meetings --
create table if not exists public.meetings (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references public.profiles(id) on delete cascade,
  deal_id                    uuid references public.deals(id) on delete set null,

  google_event_id            text unique,
  recall_bot_id              text unique,

  title                      text,
  starts_at                  timestamptz,
  ends_at                    timestamptz,
  attendees                  jsonb not null default '[]'::jsonb,
  meet_link                  text,
  platform                   text check (platform in ('google_meet','zoom','teams','other')),

  agent_enabled              boolean not null default false,
  status                     text not null default 'scheduled'
                             check (status in ('scheduled','bot_scheduled','recording','processing','completed','failed','cancelled')),

  transcript                 text,
  transcript_fetched_at      timestamptz,
  recording_seconds          integer,
  meeting_kind               text check (meeting_kind in ('discovery','check_in','kickoff','internal','other')),

  error                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

comment on table public.meetings is
  'Calendar events synced from Google, plus Recall.ai bot state and the resulting transcript.';
comment on column public.meetings.recall_bot_id is
  'Join key for the Recall webhook — how an inbound bot.done is attributed to a user.';
comment on column public.meetings.meeting_kind is
  'Set by the triage pass. Only discovery calls auto-draft a proposal.';

-- -------------------------------------------------------------- templates --
create table if not exists public.templates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete cascade,
  name              text not null,
  description       text,
  component_source  text not null,
  is_builtin        boolean not null default false,
  created_at        timestamptz not null default now()
);

comment on table public.templates is
  'Proposal visual templates. Generated rarely by Kimi; a null user_id means built-in.';

-- -------------------------------------------------------------- proposals --
create table if not exists public.proposals (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references public.deals(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  meeting_id        uuid references public.meetings(id) on delete set null,
  template_id       uuid references public.templates(id) on delete set null,

  proposal_data     jsonb not null,
  status            text not null default 'draft'
                    check (status in ('draft','shared','accepted','rejected')),

  share_token       text unique,
  share_expires_at  timestamptz,
  shared_at         timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.proposals is
  'Structured proposal content. Rendered through a template — never stored as an HTML blob, so fields stay editable and queryable.';
comment on column public.proposals.share_token is
  'Null until shared. Powers the public /p/[token] route.';

comment on column public.deals.proposal_data is
  'DEPRECATED — superseded by public.proposals. Drop in Phase 6 once the module pages are gone.';

-- ------------------------------------------------------ proposal_versions --
create table if not exists public.proposal_versions (
  id              uuid primary key default gen_random_uuid(),
  proposal_id     uuid not null references public.proposals(id) on delete cascade,
  proposal_data   jsonb not null,
  change_summary  text,
  created_by      text not null default 'user' check (created_by in ('ai','user')),
  created_at      timestamptz not null default now()
);

comment on table public.proposal_versions is
  'Immutable snapshot per edit. Makes prompt-driven refinement undoable.';

-- --------------------------------------------------------- proposal_views --
create table if not exists public.proposal_views (
  id                uuid primary key default gen_random_uuid(),
  proposal_id       uuid not null references public.proposals(id) on delete cascade,
  ip_hash           text,
  user_agent        text,
  referrer          text,
  opened_at         timestamptz not null default now(),
  duration_seconds  integer,
  sections_viewed   jsonb not null default '[]'::jsonb
);

comment on table public.proposal_views is
  'Client-side engagement signal. Per-section dwell time is the metric that matters, not raw view count.';
comment on column public.proposal_views.ip_hash is
  'Hashed, never raw — enough to distinguish visitors without storing an identifier.';

-- ------------------------------------------------------------ deal_events --
create table if not exists public.deal_events (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  from_value  text,
  to_value    text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.deal_events is
  'Append-only deal activity: stage changes, proposal drafted/shared/viewed, meeting recorded.';

-- ------------------------------------------------------------- job_queue ---
create table if not exists public.job_queue (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  payload       jsonb not null,
  status        text not null default 'pending'
                check (status in ('pending','running','done','failed')),
  attempts      integer not null default 0,
  max_attempts  integer not null default 3,
  run_after     timestamptz not null default now(),
  locked_at     timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.job_queue is
  'Keeps slow AI work out of the Recall webhook, which must return fast or Recall retries and duplicates the work.';

-- ---------------------------------------------------------------- indexes --
create index if not exists meetings_user_id_idx           on public.meetings (user_id);
create index if not exists meetings_deal_id_idx           on public.meetings (deal_id);
create index if not exists meetings_starts_at_idx         on public.meetings (user_id, starts_at desc);
create index if not exists meetings_status_idx            on public.meetings (status) where status in ('bot_scheduled','recording','processing');

create index if not exists templates_user_id_idx          on public.templates (user_id);

create index if not exists proposals_deal_id_idx          on public.proposals (deal_id);
create index if not exists proposals_user_id_idx          on public.proposals (user_id);
create index if not exists proposals_meeting_id_idx       on public.proposals (meeting_id);
create index if not exists proposals_template_id_idx      on public.proposals (template_id);

create index if not exists proposal_versions_proposal_idx on public.proposal_versions (proposal_id, created_at desc);

create index if not exists proposal_views_proposal_idx    on public.proposal_views (proposal_id, opened_at desc);

create index if not exists deal_events_deal_id_idx        on public.deal_events (deal_id, created_at desc);
create index if not exists deal_events_user_id_idx        on public.deal_events (user_id);

create index if not exists job_queue_claim_idx            on public.job_queue (status, run_after) where status = 'pending';

-- --------------------------------------------------------------- triggers --
drop trigger if exists set_meetings_updated_at on public.meetings;
create trigger set_meetings_updated_at before update on public.meetings
  for each row execute function public.handle_updated_at();

drop trigger if exists set_proposals_updated_at on public.proposals;
create trigger set_proposals_updated_at before update on public.proposals
  for each row execute function public.handle_updated_at();

drop trigger if exists set_job_queue_updated_at on public.job_queue;
create trigger set_job_queue_updated_at before update on public.job_queue
  for each row execute function public.handle_updated_at();

-- -------------------------------------------------------------------- RLS --
-- auth.uid() is wrapped in a subselect throughout: called once per query
-- rather than once per row.

alter table public.meetings           enable row level security;
alter table public.templates          enable row level security;
alter table public.proposals          enable row level security;
alter table public.proposal_versions  enable row level security;
alter table public.proposal_views     enable row level security;
alter table public.deal_events        enable row level security;
alter table public.job_queue          enable row level security;

-- meetings
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select
  using ((select auth.uid()) = user_id);
drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings for delete
  using ((select auth.uid()) = user_id);

-- templates: own rows, plus read-only access to built-ins
drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates for select
  using (is_builtin or (select auth.uid()) = user_id);
drop policy if exists templates_insert on public.templates;
create policy templates_insert on public.templates for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists templates_update on public.templates;
create policy templates_update on public.templates for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists templates_delete on public.templates;
create policy templates_delete on public.templates for delete
  using ((select auth.uid()) = user_id);

-- proposals: denormalised user_id means no join needed on the hot path
drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals for select
  using ((select auth.uid()) = user_id);
drop policy if exists proposals_insert on public.proposals;
create policy proposals_insert on public.proposals for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists proposals_update on public.proposals;
create policy proposals_update on public.proposals for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists proposals_delete on public.proposals;
create policy proposals_delete on public.proposals for delete
  using ((select auth.uid()) = user_id);

-- proposal_versions: reached through the parent proposal
drop policy if exists proposal_versions_select on public.proposal_versions;
create policy proposal_versions_select on public.proposal_versions for select
  using (exists (
    select 1 from public.proposals p
    where p.id = proposal_versions.proposal_id and p.user_id = (select auth.uid())
  ));
drop policy if exists proposal_versions_insert on public.proposal_versions;
create policy proposal_versions_insert on public.proposal_versions for insert
  with check (exists (
    select 1 from public.proposals p
    where p.id = proposal_versions.proposal_id and p.user_id = (select auth.uid())
  ));

-- proposal_views: owner reads only. Writes come from the public share page via
-- the service role, so there is deliberately no insert policy here.
drop policy if exists proposal_views_select on public.proposal_views;
create policy proposal_views_select on public.proposal_views for select
  using (exists (
    select 1 from public.proposals p
    where p.id = proposal_views.proposal_id and p.user_id = (select auth.uid())
  ));

-- deal_events
drop policy if exists deal_events_select on public.deal_events;
create policy deal_events_select on public.deal_events for select
  using ((select auth.uid()) = user_id);
drop policy if exists deal_events_insert on public.deal_events;
create policy deal_events_insert on public.deal_events for insert
  with check ((select auth.uid()) = user_id);

-- job_queue: service role only. RLS on with no policies = deny all to
-- anon/authenticated; the service role bypasses RLS entirely.
