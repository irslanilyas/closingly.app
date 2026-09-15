alter table public.meetings
  add column transcript_segments jsonb;

comment on column public.meetings.transcript_segments is 'Structured transcript from Recall: [{speaker, start, end, text}]. Powers synced playback. The flat transcript column stays the source for AI extraction.';
