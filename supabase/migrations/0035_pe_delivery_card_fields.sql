-- PE Development cards: Deployment Date (stored in end_date), Readiness Date,
-- and Team / Time to market efforts in working days.

-- Discard the retired "Target" dates once. This only runs while readiness_date
-- does not exist yet, so re-running the file never clears Deployment Dates.
do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'work_items'
       and column_name = 'readiness_date'
  ) then
    update public.work_items as item
       set end_date = null
      from public.workspaces as workspace
     where workspace.id = item.workspace_id
       and workspace.slug = 'pe-delivery'
       and item.end_date is not null;
  end if;
end;
$$;

alter table public.work_items
  add column if not exists readiness_date date,
  add column if not exists team_effort_wd numeric(5, 1),
  add column if not exists time_to_market_wd numeric(5, 1);

alter table public.work_items
  drop constraint if exists work_items_readiness_date_order,
  drop constraint if exists work_items_team_effort_wd_nonnegative,
  drop constraint if exists work_items_time_to_market_wd_nonnegative;

alter table public.work_items
  add constraint work_items_readiness_date_order check (
    readiness_date is null
    or start_date is null
    or readiness_date >= start_date
  ),
  add constraint work_items_team_effort_wd_nonnegative
    check (team_effort_wd is null or team_effort_wd >= 0),
  add constraint work_items_time_to_market_wd_nonnegative
    check (time_to_market_wd is null or time_to_market_wd >= 0);
