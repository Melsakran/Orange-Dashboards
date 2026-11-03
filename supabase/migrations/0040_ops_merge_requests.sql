-- Ops Requests: keep the Request Type from the service-desk form ("Svc Options") and flag
-- merge requests. Rows from older uploads default to an empty type and not-a-merge-request
-- until the next upload replaces them. Re-runnable.

alter table public.ops_requests
  add column if not exists request_type text not null default '',
  add column if not exists is_merge_request boolean not null default false;

create or replace function public.replace_ops_requests(p_file_name text, p_rows jsonb)
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

  delete from public.ops_requests where true;

  insert into public.ops_requests (
    interaction_id, status, assignment_time, title, request_title, description,
    requestor_name, requestor_key, close_date, closure_code, closure_comments,
    assigned_to, assigned_to_key, request_type, is_merge_request, upload_id
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

revoke all on function public.replace_ops_requests(text, jsonb) from public;
revoke all on function public.replace_ops_requests(text, jsonb) from anon;
grant execute on function public.replace_ops_requests(text, jsonb) to authenticated;
