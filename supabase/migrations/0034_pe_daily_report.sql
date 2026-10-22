-- PE Daily Report: one report per date, uploaded by admins, plus admin-entered sections.

create table if not exists public.pe_daily_reports (
  report_date date primary key,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  file_name text not null
);

create table if not exists public.pe_daily_promos (
  report_date date not null references public.pe_daily_reports(report_date) on delete cascade,
  position integer not null check (position >= 0),
  promo text not null check (promo <> ''),
  last_week bigint not null check (last_week >= 0),
  day_before bigint not null check (day_before >= 0),
  yesterday bigint not null check (yesterday >= 0),
  primary key (report_date, promo)
);

create table if not exists public.pe_daily_sms (
  report_date date not null references public.pe_daily_reports(report_date) on delete cascade,
  position integer not null check (position >= 0),
  promo text not null check (promo <> ''),
  channel text not null check (channel in ('offline', 'online')),
  last_week bigint not null check (last_week >= 0),
  day_before bigint not null check (day_before >= 0),
  yesterday bigint not null check (yesterday >= 0),
  primary key (report_date, channel, promo)
);

create table if not exists public.pe_daily_upselling (
  report_date date not null references public.pe_daily_reports(report_date) on delete cascade,
  position integer not null check (position >= 0),
  day date not null,
  count bigint not null check (count >= 0),
  primary key (report_date, day)
);

create table if not exists public.pe_daily_manual_rows (
  report_date date not null references public.pe_daily_reports(report_date) on delete cascade,
  section text not null check (
    section in ('tx_prov', 'actions', 'offer_sheet', 'data_lake', 'it_cases', 'grafana')
  ),
  position integer not null check (position >= 0),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  primary key (report_date, section, position)
);

create table if not exists public.pe_daily_settings (
  id boolean primary key default true check (id),
  visible_charts text[] not null default '{tx_prov,h_dynamic}'
    check (visible_charts <@ array['tx_prov', 'h_dynamic', 'upselling', 'sms']::text[])
);

insert into public.pe_daily_settings (id) values (true) on conflict (id) do nothing;

alter table public.pe_daily_reports enable row level security;
alter table public.pe_daily_promos enable row level security;
alter table public.pe_daily_sms enable row level security;
alter table public.pe_daily_upselling enable row level security;
alter table public.pe_daily_manual_rows enable row level security;
alter table public.pe_daily_settings enable row level security;

revoke all on table
  public.pe_daily_reports,
  public.pe_daily_promos,
  public.pe_daily_sms,
  public.pe_daily_upselling,
  public.pe_daily_manual_rows,
  public.pe_daily_settings
from anon, authenticated;

grant select on table
  public.pe_daily_reports,
  public.pe_daily_promos,
  public.pe_daily_sms,
  public.pe_daily_upselling,
  public.pe_daily_manual_rows,
  public.pe_daily_settings
to anon, authenticated;

drop policy if exists pe_daily_reports_public_read on public.pe_daily_reports;
create policy pe_daily_reports_public_read on public.pe_daily_reports
for select to anon, authenticated using (true);

drop policy if exists pe_daily_promos_public_read on public.pe_daily_promos;
create policy pe_daily_promos_public_read on public.pe_daily_promos
for select to anon, authenticated using (true);

drop policy if exists pe_daily_sms_public_read on public.pe_daily_sms;
create policy pe_daily_sms_public_read on public.pe_daily_sms
for select to anon, authenticated using (true);

drop policy if exists pe_daily_upselling_public_read on public.pe_daily_upselling;
create policy pe_daily_upselling_public_read on public.pe_daily_upselling
for select to anon, authenticated using (true);

drop policy if exists pe_daily_manual_rows_public_read on public.pe_daily_manual_rows;
create policy pe_daily_manual_rows_public_read on public.pe_daily_manual_rows
for select to anon, authenticated using (true);

drop policy if exists pe_daily_settings_public_read on public.pe_daily_settings;
create policy pe_daily_settings_public_read on public.pe_daily_settings
for select to anon, authenticated using (true);

create or replace function public.save_pe_daily_report(
  p_report_date date,
  p_file_name text,
  p_promos jsonb,
  p_sms jsonb,
  p_upselling jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_is_new boolean;
  v_previous date;
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;

  if p_report_date is null then
    raise exception 'report date is required';
  end if;

  if jsonb_typeof(p_promos) is distinct from 'array'
     or jsonb_typeof(p_sms) is distinct from 'array'
     or jsonb_typeof(p_upselling) is distinct from 'array' then
    raise exception 'promos, sms, and upselling must be JSON arrays';
  end if;

  if jsonb_array_length(p_promos) = 0
     or jsonb_array_length(p_sms) = 0
     or jsonb_array_length(p_upselling) = 0 then
    raise exception 'promos, sms, and upselling must not be empty';
  end if;

  lock table public.pe_daily_reports in exclusive mode;

  select email into v_email
    from public.admin_users
   where auth_user_id = (select auth.uid());

  v_is_new := not exists (
    select 1 from public.pe_daily_reports where report_date = p_report_date
  );

  insert into public.pe_daily_reports (report_date, uploaded_at, uploaded_by, uploaded_by_email, file_name)
  values (
    p_report_date,
    now(),
    (select auth.uid()),
    v_email,
    coalesce(nullif(trim(p_file_name), ''), 'upload')
  )
  on conflict (report_date) do update
    set uploaded_at = excluded.uploaded_at,
        uploaded_by = excluded.uploaded_by,
        uploaded_by_email = excluded.uploaded_by_email,
        file_name = excluded.file_name;

  delete from public.pe_daily_promos where report_date = p_report_date;
  delete from public.pe_daily_sms where report_date = p_report_date;
  delete from public.pe_daily_upselling where report_date = p_report_date;

  insert into public.pe_daily_promos (report_date, position, promo, last_week, day_before, yesterday)
  select
    p_report_date,
    (r.ordinality - 1)::integer,
    trim(r.value->>'promo'),
    (r.value->>'last_week')::bigint,
    (r.value->>'day_before')::bigint,
    (r.value->>'yesterday')::bigint
  from jsonb_array_elements(p_promos) with ordinality as r(value, ordinality);

  insert into public.pe_daily_sms (report_date, position, promo, channel, last_week, day_before, yesterday)
  select
    p_report_date,
    (r.ordinality - 1)::integer,
    trim(r.value->>'promo'),
    lower(trim(r.value->>'channel')),
    (r.value->>'last_week')::bigint,
    (r.value->>'day_before')::bigint,
    (r.value->>'yesterday')::bigint
  from jsonb_array_elements(p_sms) with ordinality as r(value, ordinality);

  insert into public.pe_daily_upselling (report_date, position, day, count)
  select
    p_report_date,
    (r.ordinality - 1)::integer,
    (r.value->>'day')::date,
    (r.value->>'count')::bigint
  from jsonb_array_elements(p_upselling) with ordinality as r(value, ordinality);

  if v_is_new then
    select max(report_date) into v_previous
      from public.pe_daily_reports
     where report_date < p_report_date;

    if v_previous is not null then
      insert into public.pe_daily_manual_rows (report_date, section, position, fields)
      select p_report_date, section, position, fields
        from public.pe_daily_manual_rows
       where report_date = v_previous;
    end if;
  end if;
end;
$$;

create or replace function public.save_pe_daily_section(
  p_report_date date,
  p_section text,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;

  if p_section is null
     or p_section not in ('tx_prov', 'actions', 'offer_sheet', 'data_lake', 'it_cases', 'grafana') then
    raise exception 'unknown section';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  if not exists (select 1 from public.pe_daily_reports where report_date = p_report_date) then
    raise exception 'report does not exist';
  end if;

  delete from public.pe_daily_manual_rows
   where report_date = p_report_date
     and section = p_section;

  insert into public.pe_daily_manual_rows (report_date, section, position, fields)
  select p_report_date, p_section, (r.ordinality - 1)::integer, r.value
    from jsonb_array_elements(p_rows) with ordinality as r(value, ordinality);
end;
$$;

create or replace function public.delete_pe_daily_report(p_report_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;

  delete from public.pe_daily_reports where report_date = p_report_date;
  if not found then
    raise exception 'report does not exist';
  end if;
end;
$$;

create or replace function public.save_pe_daily_chart_settings(p_visible_charts text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'admin access required';
  end if;

  if p_visible_charts is null then
    raise exception 'visible charts are required';
  end if;

  insert into public.pe_daily_settings (id, visible_charts)
  values (true, p_visible_charts)
  on conflict (id) do update set visible_charts = excluded.visible_charts;
end;
$$;

revoke all on function public.save_pe_daily_report(date, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.save_pe_daily_report(date, text, jsonb, jsonb, jsonb) from anon;
grant execute on function public.save_pe_daily_report(date, text, jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.save_pe_daily_section(date, text, jsonb) from public;
revoke all on function public.save_pe_daily_section(date, text, jsonb) from anon;
grant execute on function public.save_pe_daily_section(date, text, jsonb) to authenticated;

revoke all on function public.delete_pe_daily_report(date) from public;
revoke all on function public.delete_pe_daily_report(date) from anon;
grant execute on function public.delete_pe_daily_report(date) to authenticated;

revoke all on function public.save_pe_daily_chart_settings(text[]) from public;
revoke all on function public.save_pe_daily_chart_settings(text[]) from anon;
grant execute on function public.save_pe_daily_chart_settings(text[]) to authenticated;
