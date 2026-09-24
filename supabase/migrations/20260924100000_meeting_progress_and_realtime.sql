-- Visible progress for a call on its way to becoming a deal.
--
-- Safe to apply before or after the code that writes it: the worker treats a
-- missing column as "progress not recorded" and carries on.
--
-- Written only by the server (webhook, import route, worker) through the
-- service role. It is deliberately absent from the column grants in
-- 20260924091000_lock_meeting_columns.sql, so a session can read it but never
-- fake it.
alter table public.meetings
  add column if not exists progress jsonb;

comment on column public.meetings.progress is
  '{stage, started_at, stage_at}: queued, transcript, reading, writing, then done or failed. Drives the "just finished" card.';

-- The page listens for its own meetings changing instead of polling hard.
-- Realtime applies the table's RLS, so a subscriber only ever hears about
-- rows it could already select.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'meetings'
     ) then
    alter publication supabase_realtime add table public.meetings;
  end if;
end $$;
