-- PE Development: Readiness Date may fall before the Deployment Date; it only
-- has to be on or after the Start Date. Re-runnable.

alter table public.work_items
  drop constraint if exists work_items_readiness_date_order;

alter table public.work_items
  add constraint work_items_readiness_date_order check (
    readiness_date is null
    or start_date is null
    or readiness_date >= start_date
  );
