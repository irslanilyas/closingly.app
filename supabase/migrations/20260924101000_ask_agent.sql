-- Ask Closingly: saved conversations, and the actions the agent proposes.
--
-- Every write here goes through the API with the service role after the
-- caller is authenticated, so the browser gets read access to its own rows
-- and nothing else. The actions themselves (moving a deal, deleting a note)
-- run through the caller's own session when confirmed, so row-level security
-- decides what they can touch, exactly as if the person had clicked it.

create table if not exists public.ask_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ask_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ask_conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  -- Plain text: what is replayed to the model as history.
  content          text not null default '',
  -- What the panel draws: the steps taken, action cards, buttons.
  parts            jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

-- A write the agent wants to make. Nothing happens until the person confirms
-- it (or, in "act automatically" mode, the server decides it is safe), and a
-- proposal nobody answers expires.
create table if not exists public.ask_actions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  conversation_id  uuid references public.ask_conversations(id) on delete cascade,
  kind             text not null,
  params           jsonb not null,
  status           text not null default 'pending'
                   check (status in ('pending', 'running', 'done', 'cancelled', 'failed', 'expired')),
  result           jsonb,
  error            text,
  created_at       timestamptz not null default now(),
  decided_at       timestamptz,
  expires_at       timestamptz not null default (now() + interval '30 minutes')
);

create index if not exists ask_conversations_user_idx on public.ask_conversations (user_id, updated_at desc);
create index if not exists ask_messages_conversation_idx on public.ask_messages (conversation_id, created_at);
create index if not exists ask_messages_user_idx on public.ask_messages (user_id);
create index if not exists ask_actions_user_idx on public.ask_actions (user_id, created_at desc);
create index if not exists ask_actions_conversation_idx on public.ask_actions (conversation_id);

alter table public.ask_conversations enable row level security;
alter table public.ask_messages      enable row level security;
alter table public.ask_actions       enable row level security;

drop policy if exists "ask_conversations_select_own" on public.ask_conversations;
create policy "ask_conversations_select_own" on public.ask_conversations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ask_messages_select_own" on public.ask_messages;
create policy "ask_messages_select_own" on public.ask_messages
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ask_actions_select_own" on public.ask_actions;
create policy "ask_actions_select_own" on public.ask_actions
  for select to authenticated using (user_id = (select auth.uid()));

-- On top of RLS: the browser never writes these directly.
revoke insert, update, delete on public.ask_conversations from anon, authenticated;
revoke insert, update, delete on public.ask_messages      from anon, authenticated;
revoke insert, update, delete on public.ask_actions       from anon, authenticated;
revoke all on public.ask_conversations from anon;
revoke all on public.ask_messages      from anon;
revoke all on public.ask_actions       from anon;

drop trigger if exists set_ask_conversations_updated_at on public.ask_conversations;
create trigger set_ask_conversations_updated_at before update on public.ask_conversations
  for each row execute function public.handle_updated_at();
