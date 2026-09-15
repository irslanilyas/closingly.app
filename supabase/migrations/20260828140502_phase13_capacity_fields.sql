alter table public.deals
  add column estimated_hours numeric,
  add column start_date date,
  add column target_end_date date;

alter table public.profiles
  add column weekly_capacity_hours integer not null default 30;

comment on column public.deals.estimated_hours is 'Total hours the consultant expects this deal to take. Manually entered — powers capacity forecasting.';
comment on column public.deals.start_date is 'When work on this deal is expected to start. Powers capacity forecasting.';
comment on column public.deals.target_end_date is 'When work on this deal is expected to finish. Powers capacity forecasting.';
comment on column public.profiles.weekly_capacity_hours is 'How many billable hours per week this consultant has available. Default 30.';
