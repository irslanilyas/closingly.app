-- ============================================================================
-- Bring the original tables up to the same standard as the Phase 1 tables:
--   * (select auth.uid()) so the function runs once per query, not per row
--   * one policy per action instead of overlapping permissive policies
--   * cover the remaining unindexed foreign key
-- ============================================================================

-- ------------------------------------------------------------- profiles ----
-- Was carrying four overlapping policies: a catch-all "Users see own profile"
-- (FOR ALL) plus three per-action ones. Every query evaluated both. Collapse
-- to one policy per action.
drop policy if exists "Users see own profile"           on public.profiles;
drop policy if exists "Profiles are viewable by owner"  on public.profiles;
drop policy if exists "Profiles are insertable by owner" on public.profiles;
drop policy if exists "Profiles are updatable by owner" on public.profiles;

create policy profiles_select on public.profiles for select
  using ((select auth.uid()) = id);
create policy profiles_insert on public.profiles for insert
  with check ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------- deals ----
drop policy if exists "Users see own deals" on public.deals;

create policy deals_select on public.deals for select
  using ((select auth.uid()) = user_id);
create policy deals_insert on public.deals for insert
  with check ((select auth.uid()) = user_id);
create policy deals_update on public.deals for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy deals_delete on public.deals for delete
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------- generations ----
drop policy if exists "Users see own generations" on public.generations;

create policy generations_select on public.generations for select
  using ((select auth.uid()) = user_id);
create policy generations_insert on public.generations for insert
  with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------------- indexes -----
create index if not exists generations_deal_id_idx on public.generations (deal_id);

-- ------------------------------------------------------------ functions ----
-- handle_new_user() is a SECURITY DEFINER trigger function, but it was also
-- reachable as an RPC by anon and authenticated. Triggers fire as the table
-- owner regardless, so revoking direct execution costs nothing.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
