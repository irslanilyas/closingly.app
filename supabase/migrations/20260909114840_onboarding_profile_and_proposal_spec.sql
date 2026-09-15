-- Applied 2026-09-09 as `onboarding_profile_and_proposal_spec`.
--
-- Onboarding data model.
--
-- Three records, versioned rather than mutated: the answers a person gave
-- (workspace_profiles), the visual system derived from them or from an
-- uploaded brand book (brand_profiles), and the provider-neutral generation
-- requirement built from both (proposal_specifications).
--
-- Versioned because a proposal must be explainable months later. "Which
-- answers produced this document" is unanswerable if editing settings
-- overwrites the row the document was generated from.

create table if not exists public.workspace_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  -- Grouped exactly as the normalized-facts model, each group carrying its
  -- own `source` and `confidence` so a website-inferred value can never be
  -- mistaken later for something the person actually confirmed.
  professional jsonb not null default '{}'::jsonb,
  business jsonb not null default '{}'::jsonb,
  proposal jsonb not null default '{}'::jsonb,
  brand jsonb not null default '{}'::jsonb,
  commercial jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

comment on table public.workspace_profiles is
  'Versioned normalized facts from onboarding. Never updated in place — a new answer writes a new version so past proposals stay explainable.';

create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  source text not null default 'onboarding'
    check (source in ('onboarding', 'brand_book')),
  color_direction text,
  typography_direction text,
  -- Filled by extraction when a brand book is uploaded; the direction labels
  -- above are the fallback when it is not.
  palette jsonb not null default '[]'::jsonb,
  typography jsonb not null default '{}'::jsonb,
  tone_examples jsonb not null default '[]'::jsonb,
  brand_book_path text,
  extraction_status text not null default 'none'
    check (extraction_status in ('none', 'pending', 'done', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

comment on table public.brand_profiles is
  'Normalized brand signals. The uploaded file stays an asset reference; generation reads the summary, never the raw file.';

create table if not exists public.proposal_specifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  workspace_profile_id uuid not null
    references public.workspace_profiles(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  spec jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

comment on table public.proposal_specifications is
  'Provider-neutral generation requirement built from a profile + brand pair. Swapping the generation service replaces the renderer, not this.';

create index if not exists workspace_profiles_user_version_idx
  on public.workspace_profiles (user_id, version desc);
create index if not exists brand_profiles_user_version_idx
  on public.brand_profiles (user_id, version desc);
create index if not exists proposal_specifications_user_version_idx
  on public.proposal_specifications (user_id, version desc);

alter table public.workspace_profiles enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.proposal_specifications enable row level security;

create policy "Users see own workspace profiles" on public.workspace_profiles
  for all using (auth.uid() = user_id);
create policy "Users see own brand profiles" on public.brand_profiles
  for all using (auth.uid() = user_id);
create policy "Users see own proposal specs" on public.proposal_specifications
  for all using (auth.uid() = user_id);

-- Onboarding state lives on the profile: it gates every signed-in route, so
-- it must be readable in one query the shell already makes.
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_step smallint not null default 0,
  add column if not exists calendar_status text not null default 'pending',
  add column if not exists checklist_state jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_calendar_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_calendar_status_check
      check (calendar_status in ('connected', 'skipped', 'pending'));
  end if;
end $$;

comment on column public.profiles.calendar_status is
  'connected | skipped | pending. Skipping must never block the dashboard.';

-- The starter proposal has no deal behind it, by definition: it is written
-- before any client conversation has happened. Making deal_id nullable is
-- what lets it live in the same table and be reviewed on the same screen.
alter table public.proposals
  alter column deal_id drop not null;

alter table public.proposals
  add column if not exists kind text not null default 'client',
  add column if not exists generation_state text not null default 'ready_for_review',
  add column if not exists generation_meta jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'proposals_kind_check'
  ) then
    alter table public.proposals add constraint proposals_kind_check
      check (kind in ('client', 'starter'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'proposals_generation_state_check'
  ) then
    alter table public.proposals add constraint proposals_generation_state_check
      check (generation_state in (
        'queued', 'processing_profile', 'processing_document', 'validating',
        'ready_for_review', 'needs_input', 'failed_retryable', 'failed_terminal'
      ));
  end if;

  -- A client proposal without a deal is a bug, not a starter proposal.
  if not exists (
    select 1 from pg_constraint where conname = 'proposals_deal_required_for_client_check'
  ) then
    alter table public.proposals
      add constraint proposals_deal_required_for_client_check
      check (kind = 'starter' or deal_id is not null);
  end if;
end $$;

comment on column public.proposals.generation_meta is
  'Audit trail: profile version, brand version, spec version, model request id, validation result. Required to debug or explain any generated document.';

-- Exactly one starter proposal per person; regeneration replaces its content.
create unique index if not exists proposals_one_starter_per_user_idx
  on public.proposals (user_id) where kind = 'starter';
