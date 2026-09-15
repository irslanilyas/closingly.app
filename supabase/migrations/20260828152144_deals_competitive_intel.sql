alter table public.deals
  add column competitor_mentioned text,
  add column competitive_note text;

comment on column public.deals.competitor_mentioned is 'Competitor name the client mentioned during discovery, if any. Extracted at transcript ingestion.';
comment on column public.deals.competitive_note is 'AI-suggested positioning note against the mentioned competitor.';
