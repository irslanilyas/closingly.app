-- Profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  created_at timestamptz default now()
);

-- Deals (central entity)
create table deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  client_name text,
  client_company text,
  client_email text,
  transcript text,
  pain_point text,
  budget_signal text,
  timeline text,
  decision_maker text,
  fit_score int check (fit_score between 1 and 10),
  proposal_data jsonb,
  suggested_replies jsonb,
  stage text default 'lead' check (stage in ('lead','proposal_sent','negotiating','won','lost')),
  source text default 'proposal_generator',
  notes text,
  proposed_amount numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Generations (audit log of all AI calls)
create table generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  module text not null,
  input text,
  output text,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index idx_deals_user_id on deals(user_id);
create index idx_deals_stage on deals(stage);
create index idx_generations_user_id on generations(user_id);
create index idx_generations_module on generations(module);

-- RLS
alter table profiles enable row level security;
alter table deals enable row level security;
alter table generations enable row level security;

create policy "Users see own profile" on profiles for all using (auth.uid() = id);
create policy "Users see own deals" on deals for all using (auth.uid() = user_id);
create policy "Users see own generations" on generations for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
