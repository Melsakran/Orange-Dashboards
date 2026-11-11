-- Data Lake Operations Requests: every item belongs to a team (Operations or Data Analytics);
-- uploads are per team. The ownership tables from 0041 stay but are no longer used. Re-runnable.
-- Run the whole file as one batch. If 0041 is ever pasted again, run this file again afterwards.

alter table public.ops_requests
  add column if not exists team text not null default 'operations';
alter table public.ops_request_uploads
  add column if not exists team text not null default 'operations';

alter table public.ops_requests drop constraint if exists ops_requests_team_check;
alter table public.ops_requests
  add constraint ops_requests_team_check check (team in ('operations', 'data_analytics'));
alter table public.ops_request_uploads drop constraint if exists ops_request_uploads_team_check;
alter table public.ops_request_uploads
  add constraint ops_request_uploads_team_check check (team in ('operations', 'data_analytics'));

alter table public.ops_requests drop constraint if exists ops_requests_interaction_id_key;
alter table public.ops_requests drop constraint if exists ops_requests_team_interaction_id_key;
alter table public.ops_requests
  add constraint ops_requests_team_interaction_id_key unique (team, interaction_id);

create or replace function public.replace_ops_requests(p_file_name text, p_rows jsonb, p_team text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload_id uuid;
  v_email text;
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;
  if p_team is null or p_team not in ('operations', 'data_analytics') then
    raise exception 'unknown team';
  end if;

  lock table public.ops_requests in exclusive mode;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'rows must not be empty';
  end if;

  select email into v_email from public.admin_users where auth_user_id = (select auth.uid());

  insert into public.ops_request_uploads (uploaded_by, uploaded_by_email, file_name, row_count, team)
  values (
    (select auth.uid()),
    v_email,
    coalesce(nullif(trim(p_file_name), ''), 'upload'),
    jsonb_array_length(p_rows),
    p_team
  )
  returning id into v_upload_id;

  delete from public.ops_requests where source = 'import' and team = p_team;
  delete from public.ops_requests
   where source = 'manual'
     and team = p_team
     and interaction_id in (select trim(value ->> 'interaction_id') from jsonb_array_elements(p_rows));

  insert into public.ops_requests (
    interaction_id, status, assignment_time, title, request_title, description,
    requestor_name, requestor_key, close_date, closure_code, closure_comments,
    assigned_to, assigned_to_key, request_type, is_merge_request, source, team, upload_id
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
    p_team,
    v_upload_id
  from jsonb_to_recordset(p_rows) as r(
    interaction_id text, status text, assignment_time timestamp, title text,
    request_title text, description text, requestor_name text, requestor_key text,
    close_date timestamp, closure_code text, closure_comments text,
    assigned_to text, assigned_to_key text, request_type text, is_merge_request boolean
  );

  return v_upload_id;
end;
$$;

-- Clients deployed before this migration call the two-argument version: treat it as Operations.
create or replace function public.replace_ops_requests(p_file_name text, p_rows jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.replace_ops_requests(p_file_name, p_rows, 'operations');
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
  v_team text := coalesce(nullif(p_item ->> 'team', ''), 'operations');
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
  if v_team not in ('operations', 'data_analytics') then
    raise exception 'unknown team';
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

  if v_id is not null then
    -- An update keeps the item's team, whatever the payload says.
    select team into v_team
      from public.ops_requests
     where id = v_id and source = 'manual';
    if not found then
      raise exception 'manual item not found';
    end if;
  end if;

  if v_interaction_id is not null and exists (
    select 1 from public.ops_requests
     where interaction_id = v_interaction_id
       and team = v_team
       and (v_id is null or id <> v_id)
  ) then
    raise exception 'interaction id % already exists', v_interaction_id;
  end if;

  if v_id is null then
    insert into public.ops_requests (
      interaction_id, status, assignment_time, close_date, request_title, description,
      requestor_name, requestor_key, assigned_to, assigned_to_key, closure_code,
      is_merge_request, request_type, source, team, area_id, owner_name, upload_id
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
      v_team,
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

revoke all on function public.replace_ops_requests(text, jsonb, text) from public, anon;
revoke all on function public.replace_ops_requests(text, jsonb) from public, anon;
revoke all on function public.save_ops_manual_item(jsonb) from public, anon;
grant execute on function public.replace_ops_requests(text, jsonb, text) to authenticated;
grant execute on function public.replace_ops_requests(text, jsonb) to authenticated;
grant execute on function public.save_ops_manual_item(jsonb) to authenticated;
