-- Ops Requests: accept "In Progress" as its own status. Re-runnable.

alter table public.ops_requests
  drop constraint if exists ops_requests_status_check;

alter table public.ops_requests
  add constraint ops_requests_status_check
    check (status in ('open', 'in_progress', 'pending', 'closed'));
