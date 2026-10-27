-- PE Development: Critical / Standard project tag, an "Upcoming Delivery"
-- status after Development, and On Hold moved after Delayed. Re-runnable, but
-- each run resets the PE Development status order to the one below.

alter table public.work_items
  add column if not exists project_tier text not null default 'standard';

alter table public.work_items
  drop constraint if exists work_items_project_tier_check;

alter table public.work_items
  add constraint work_items_project_tier_check
    check (project_tier in ('standard', 'critical'));

-- Status sort orders are unique per workspace, so move them out of the way
-- before inserting and reordering.
update public.statuses as s
   set sort_order = s.sort_order + 1000
  from public.workspaces as w
 where s.workspace_id = w.id
   and w.slug = 'pe-delivery';

insert into public.statuses (id, workspace_id, name, color, sort_order, reporting_category)
select
  '20000000-0000-4000-8000-00000000003d',
  w.id,
  'Upcoming Delivery',
  '#23b123',
  (select coalesce(max(s.sort_order), 0) + 1 from public.statuses as s where s.workspace_id = w.id),
  'active'
from public.workspaces as w
where w.slug = 'pe-delivery'
  and not exists (
    select 1
      from public.statuses as s
     where s.workspace_id = w.id
       and lower(btrim(s.name)) = 'upcoming delivery'
  )
on conflict (id) do nothing;

with ranked as (
  select
    s.id,
    row_number() over (
      order by
        case lower(btrim(s.name))
          when 'planning' then 0
          when 'development' then 1
          when 'upcoming delivery' then 2
          when 'testing' then 3
          when 'live' then 4
          when 'delayed' then 5
          when 'on hold' then 6
          else 100 + s.sort_order
        end,
        s.name
    ) - 1 as next_sort
  from public.statuses as s
  join public.workspaces as w on w.id = s.workspace_id
 where w.slug = 'pe-delivery'
)
update public.statuses as s
   set sort_order = ranked.next_sort
  from ranked
 where s.id = ranked.id;
