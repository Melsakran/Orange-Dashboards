-- Ops Requests: service-desk exports uploaded by admins, replaced wholesale on each upload.

create table if not exists public.ops_request_uploads (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  file_name text not null,
  row_count integer not null check (row_count >= 0)
);

create table if not exists public.ops_requests (
  id uuid primary key default gen_random_uuid(),
  interaction_id text not null unique,
  status text not null check (status in ('open', 'pending', 'closed')),
  assignment_time timestamp not null,
  title text not null default '',
  request_title text not null default '',
  description text not null default '',
  requestor_name text not null default '',
  requestor_key text not null default '',
  close_date timestamp,
  closure_code text not null default '',
  closure_comments text not null default '',
  assigned_to text not null default '',
  assigned_to_key text not null default '',
  upload_id uuid not null references public.ops_request_uploads(id) on delete cascade,
  constraint ops_requests_close_after_assignment
    check (close_date is null or close_date >= assignment_time)
);

create index if not exists ops_requests_assignment_time_idx
  on public.ops_requests (assignment_time desc);

alter table public.ops_request_uploads enable row level security;
alter table public.ops_requests enable row level security;

revoke all on table public.ops_request_uploads, public.ops_requests from anon, authenticated;
grant select on table public.ops_request_uploads, public.ops_requests to anon, authenticated;

drop policy if exists ops_request_uploads_public_read on public.ops_request_uploads;
create policy ops_request_uploads_public_read
on public.ops_request_uploads
for select
to anon, authenticated
using (true);

drop policy if exists ops_requests_public_read on public.ops_requests;
create policy ops_requests_public_read
on public.ops_requests
for select
to anon, authenticated
using (true);

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

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
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
    assigned_to, assigned_to_key, upload_id
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
    assigned_to_key text
  );

  return v_upload_id;
end;
$$;

revoke all on function public.replace_ops_requests(text, jsonb) from public;
grant execute on function public.replace_ops_requests(text, jsonb) to authenticated;
