-- Data Lake Operations Requests: manual items, an ownership directory for issues
-- ("One Point of Contact for Every Module"), and an escalation threshold. Re-runnable.

create table if not exists public.ops_areas (
  id uuid primary key default gen_random_uuid(),
  area_group text not null check (area_group in ('reporting', 'operations', 'demand')),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  owner_name text not null default '' check (char_length(owner_name) <= 100),
  reports_to text not null default '' check (char_length(reports_to) <= 100),
  sort_order integer not null default 0
);

create unique index if not exists ops_areas_name_ci_key on public.ops_areas (lower(btrim(name)));

create table if not exists public.ops_settings (
  id boolean primary key default true check (id),
  escalation_days integer not null default 5 check (escalation_days between 1 and 365)
);

insert into public.ops_settings (id) values (true) on conflict (id) do nothing;

insert into public.ops_areas (id, area_group, name, owner_name, reports_to, sort_order) values
  ('51000000-0000-4000-8000-000000000001', 'reporting', 'CVM & B2C', 'Mohamed Adel', 'Dina Sallam', 0),
  ('51000000-0000-4000-8000-000000000002', 'reporting', 'Orange Cash & Sales', 'Asmaa', 'Dina Sallam', 1),
  ('51000000-0000-4000-8000-000000000003', 'reporting', 'Digital', 'Farida', 'Dina Sallam', 2),
  ('51000000-0000-4000-8000-000000000004', 'reporting', 'B2B', 'Eman Kandil', 'Dina Sallam', 3),
  ('51000000-0000-4000-8000-000000000005', 'reporting', 'NTRA', 'Eman Abdelnasser', 'Dina Sallam', 4),
  ('51000000-0000-4000-8000-000000000006', 'reporting', 'Finance', 'Amira Hanafy', 'Dina Sallam', 5),
  ('51000000-0000-4000-8000-000000000007', 'reporting', 'Customer Experience & Customer Service', 'Sara Hossam', 'Dina Sallam', 6),
  ('51000000-0000-4000-8000-000000000008', 'operations', 'Data Lake Operations', 'On-call member', 'Mohamed Habib', 0),
  ('51000000-0000-4000-8000-000000000009', 'demand', 'Data Lake', 'Sherif', 'Dina Sallam', 0),
  ('51000000-0000-4000-8000-00000000000a', 'demand', 'Promo Engine', 'Yasmine', 'Mohamed Habib', 1),
  ('51000000-0000-4000-8000-00000000000b', 'demand', 'New Platforms & APIs', 'Abdallah', 'Mohamed Habib', 2)
on conflict (id) do nothing;

alter table public.ops_requests
  add column if not exists source text not null default 'import',
  add column if not exists area_id uuid references public.ops_areas(id) on delete set null,
  add column if not exists owner_name text not null default '';

alter table public.ops_requests alter column upload_id drop not null;

-- Rows imported before this migration have no area: put imported issues in the on-call area.
update public.ops_requests
   set area_id = (select id from public.ops_areas where area_group = 'operations' order by sort_order, name limit 1)
 where source = 'import' and not is_merge_request and area_id is null;

alter table public.ops_requests drop constraint if exists ops_requests_source_check;
alter table public.ops_requests
  add constraint ops_requests_source_check check (source in ('import', 'manual'));

alter table public.ops_areas enable row level security;
alter table public.ops_settings enable row level security;
revoke all on table public.ops_areas, public.ops_settings from anon, authenticated;
grant select on table public.ops_areas, public.ops_settings to anon, authenticated;

drop policy if exists ops_areas_public_read on public.ops_areas;
create policy ops_areas_public_read on public.ops_areas for select to anon, authenticated using (true);
drop policy if exists ops_settings_public_read on public.ops_settings;
create policy ops_settings_public_read on public.ops_settings for select to anon, authenticated using (true);

create or replace function public.replace_ops_requests(p_file_name text, p_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload_id uuid;
  v_email text;
  v_routing jsonb;
  v_operations_area uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;

  lock table public.ops_requests in exclusive mode;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'rows must not be empty';
  end if;

  select email into v_email
    from public.admin_users
   where auth_user_id = (select auth.uid());

  insert into public.ops_request_uploads (uploaded_by, uploaded_by_email, file_name, row_count)
  values (
    (select auth.uid()),
    v_email,
    coalesce(nullif(trim(p_file_name), ''), 'upload'),
    jsonb_array_length(p_rows)
  )
  returning id into v_upload_id;

  select coalesce(
           jsonb_object_agg(
             interaction_id,
             jsonb_build_object('area_id', area_id, 'owner_name', owner_name)
           ),
           '{}'::jsonb
         )
    into v_routing
    from public.ops_requests
   where source = 'import' and not is_merge_request;

  select id into v_operations_area
    from public.ops_areas
   where area_group = 'operations'
   order by sort_order, name
   limit 1;

  delete from public.ops_requests where source = 'import';
  delete from public.ops_requests
   where source = 'manual'
     and interaction_id in (select trim(value ->> 'interaction_id') from jsonb_array_elements(p_rows));

  insert into public.ops_requests (
    interaction_id, status, assignment_time, title, request_title, description,
    requestor_name, requestor_key, close_date, closure_code, closure_comments,
    assigned_to, assigned_to_key, request_type, is_merge_request,
    source, area_id, owner_name, upload_id
  )
  select
    trim(r.interaction_id),
    lower(trim(r.status)),
    r.assignment_time,
    coalesce(r.title, ''),
    coalesce(r.request_title, ''),
    coalesce(r.description, ''),
    coalesce(r.requestor_name, ''),
    coalesce(r.requestor_key, ''),
    r.close_date,
    coalesce(r.closure_code, ''),
    coalesce(r.closure_comments, ''),
    coalesce(r.assigned_to, ''),
    coalesce(r.assigned_to_key, ''),
    coalesce(r.request_type, ''),
    coalesce(r.is_merge_request, false),
    'import',
    case
      when coalesce(r.is_merge_request, false) then null
      when v_routing ? trim(r.interaction_id)
        then (select a.id from public.ops_areas as a
               where a.id = (v_routing -> trim(r.interaction_id) ->> 'area_id')::uuid)
      else v_operations_area
    end,
    case
      when coalesce(r.is_merge_request, false) then ''
      else coalesce(v_routing -> trim(r.interaction_id) ->> 'owner_name', '')
    end,
    v_upload_id
  from jsonb_to_recordset(p_rows) as r(
    interaction_id text,
    status text,
    assignment_time timestamp,
    title text,
    request_title text,
    description text,
    requestor_name text,
    requestor_key text,
    close_date timestamp,
    closure_code text,
    closure_comments text,
    assigned_to text,
    assigned_to_key text,
    request_type text,
    is_merge_request boolean
  );

  return v_upload_id;
end;
$$;

create or replace function public.save_ops_manual_item(p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_kind text := p_item ->> 'kind';
  v_interaction_id text := nullif(btrim(coalesce(p_item ->> 'interaction_id', '')), '');
  v_status text := lower(btrim(coalesce(p_item ->> 'status', '')));
  v_title text := btrim(coalesce(p_item ->> 'request_title', ''));
  v_requestor text := btrim(coalesce(p_item ->> 'requestor_name', ''));
  v_assignee text := btrim(coalesce(p_item ->> 'assigned_to', ''));
  v_is_merge boolean;
  v_area uuid;
  v_owner text;
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;
  if v_kind is null or v_kind not in ('merge', 'issue') then
    raise exception 'kind must be merge or issue';
  end if;
  if v_status not in ('open', 'in_progress', 'pending', 'closed') then
    raise exception 'unknown status';
  end if;
  if v_title = '' or char_length(v_title) > 300 then
    raise exception 'title is required (300 characters at most)';
  end if;

  v_is_merge := v_kind = 'merge';
  v_area := case when v_is_merge then null else nullif(p_item ->> 'area_id', '')::uuid end;
  v_owner := case when v_is_merge then '' else btrim(coalesce(p_item ->> 'owner_name', '')) end;

  if v_interaction_id is not null and exists (
    select 1 from public.ops_requests
     where interaction_id = v_interaction_id and (v_id is null or id <> v_id)
  ) then
    raise exception 'interaction id % already exists', v_interaction_id;
  end if;

  if v_id is null then
    insert into public.ops_requests (
      interaction_id, status, assignment_time, close_date, request_title, description,
      requestor_name, requestor_key, assigned_to, assigned_to_key, closure_code,
      is_merge_request, request_type, source, area_id, owner_name, upload_id
    ) values (
      coalesce(v_interaction_id,
        'MAN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
      v_status,
      (p_item ->> 'assignment_time')::timestamp,
      nullif(p_item ->> 'close_date', '')::timestamp,
      v_title,
      btrim(coalesce(p_item ->> 'description', '')),
      v_requestor,
      lower(v_requestor),
      v_assignee,
      lower(v_assignee),
      btrim(coalesce(p_item ->> 'closure_code', '')),
      v_is_merge,
      case when v_is_merge then 'Merge Request' else '' end,
      'manual',
      v_area,
      v_owner,
      null
    )
    returning id into v_id;
  else
    update public.ops_requests
       set interaction_id = coalesce(v_interaction_id, interaction_id),
           status = v_status,
           assignment_time = (p_item ->> 'assignment_time')::timestamp,
           close_date = nullif(p_item ->> 'close_date', '')::timestamp,
           request_title = v_title,
           description = btrim(coalesce(p_item ->> 'description', '')),
           requestor_name = v_requestor,
           requestor_key = lower(v_requestor),
           assigned_to = v_assignee,
           assigned_to_key = lower(v_assignee),
           closure_code = btrim(coalesce(p_item ->> 'closure_code', '')),
           is_merge_request = v_is_merge,
           request_type = case when v_is_merge then 'Merge Request' when request_type = 'Merge Request' then '' else request_type end,
           area_id = v_area,
           owner_name = v_owner
     where id = v_id and source = 'manual';
    if not found then
      raise exception 'manual item not found';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_ops_manual_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;
  delete from public.ops_requests where id = p_id and source = 'manual';
  if not found then
    raise exception 'manual item not found';
  end if;
end;
$$;

create or replace function public.route_ops_request(p_id uuid, p_area_id uuid, p_owner_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;
  update public.ops_requests
     set area_id = p_area_id,
         owner_name = btrim(coalesce(p_owner_name, ''))
   where id = p_id and not is_merge_request;
  if not found then
    raise exception 'issue not found';
  end if;
end;
$$;

create or replace function public.save_ops_area(p_area jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_area ->> 'id', '')::uuid;
  v_group text := p_area ->> 'area_group';
  v_name text := btrim(coalesce(p_area ->> 'name', ''));
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;
  if v_group is null or v_group not in ('reporting', 'operations', 'demand') then
    raise exception 'unknown area group';
  end if;
  if v_name = '' then
    raise exception 'area name is required';
  end if;
  if exists (
    select 1 from public.ops_areas
     where lower(btrim(name)) = lower(v_name) and (v_id is null or id <> v_id)
  ) then
    raise exception 'area % already exists', v_name;
  end if;

  if v_id is null then
    insert into public.ops_areas (area_group, name, owner_name, reports_to, sort_order)
    values (
      v_group,
      v_name,
      btrim(coalesce(p_area ->> 'owner_name', '')),
      btrim(coalesce(p_area ->> 'reports_to', '')),
      coalesce((p_area ->> 'sort_order')::integer, 0)
    )
    returning id into v_id;
  else
    update public.ops_areas
       set area_group = v_group,
           name = v_name,
           owner_name = btrim(coalesce(p_area ->> 'owner_name', '')),
           reports_to = btrim(coalesce(p_area ->> 'reports_to', '')),
           sort_order = coalesce((p_area ->> 'sort_order')::integer, sort_order)
     where id = v_id;
    if not found then
      raise exception 'area not found';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_ops_area(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;
  delete from public.ops_areas where id = p_id;
  if not found then
    raise exception 'area not found';
  end if;
end;
$$;

create or replace function public.save_ops_settings(p_escalation_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;
  if p_escalation_days is null or p_escalation_days < 1 or p_escalation_days > 365 then
    raise exception 'escalation days must be between 1 and 365';
  end if;
  insert into public.ops_settings (id, escalation_days) values (true, p_escalation_days)
  on conflict (id) do update set escalation_days = excluded.escalation_days;
end;
$$;

revoke all on function public.replace_ops_requests(text, jsonb) from public, anon;
revoke all on function public.save_ops_manual_item(jsonb) from public, anon;
revoke all on function public.delete_ops_manual_item(uuid) from public, anon;
revoke all on function public.route_ops_request(uuid, uuid, text) from public, anon;
revoke all on function public.save_ops_area(jsonb) from public, anon;
revoke all on function public.delete_ops_area(uuid) from public, anon;
revoke all on function public.save_ops_settings(integer) from public, anon;
grant execute on function public.replace_ops_requests(text, jsonb) to authenticated;
grant execute on function public.save_ops_manual_item(jsonb) to authenticated;
grant execute on function public.delete_ops_manual_item(uuid) to authenticated;
grant execute on function public.route_ops_request(uuid, uuid, text) to authenticated;
grant execute on function public.save_ops_area(jsonb) to authenticated;
grant execute on function public.delete_ops_area(uuid) to authenticated;
grant execute on function public.save_ops_settings(integer) to authenticated;
