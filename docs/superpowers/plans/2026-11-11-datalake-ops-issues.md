# Data Lake Operations: Merge Requests and Issues implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Data Lake Operations **Requests** view into **Merge Requests** and
**Issues** tabs. Admins can add both kinds of item by hand. Issues are routed to owners using
an editable ownership directory and get escalation flags.

**Spec:** `docs/superpowers/specs/2026-11-11-datalake-ops-issues-design.md`. Read it first;
it holds the directory seed data and the decisions.

**Architecture:**
- **Storage.** One `ops_requests` table holds imported and manual items, told apart by a
  `source` column. The existing `is_merge_request` flag decides the tab.
- **New tables.** `ops_areas` holds the ownership directory and `ops_settings` holds the
  escalation days.
- **Writes.** All writes go through admin-only `security definer` RPCs, as in
  `0033`/`0034`/`0040`.
- **UI.** `components/ops/ops-requests-view.tsx` becomes a container with the second
  toggle. The current request content moves into a Merge Requests panel, and a new Issues
  panel is added.

**Conventions:**
- **Repo patterns.** Follow them throughout:
  - `SegmentedToggle` (`components/ui/segmented-toggle.tsx`)
  - `ModalDialog` (`components/ui/modal-dialog.tsx`)
  - `ConfirmDialog` (see how `components/pe-daily/delete-report.tsx` confirms)
  - form classes `form-field`, `form-row`, `form-actions`, `primary-button`,
    `secondary-button`, `form-error`
  - tables with `ops-table`, panels with `ops-panel`
- **Tests.** Vitest and Testing Library. Database tests use PGlite; see
  `tests/ops-requests-database.test.ts`.
- **Commands.**
  - `npm run test:unit -- <files>` runs focused unit tests.
  - `npx vitest run <file>` runs a database test.
  - `npx tsc --noEmit` type-checks.
  - `npm run lint` lints.
- **Known baseline.** 2 failures in `tests/security-audit-realtime.test.ts` are
  pre-existing.
- **Git.** Don't push. Commit at the end of each task. If git fails in the sandbox, re-run
  it with full permissions.

---

### Task 1: Database migration and database tests

**Files:**
- Create: `supabase/migrations/0041_ops_issues.sql`
- Modify: `tests/ops-requests-database.test.ts`. Load `0041` after `0040` in `beforeAll`,
  then add the tests below.

- [ ] **Step 1: Write the failing database tests.** Add these to
  `tests/ops-requests-database.test.ts`. Use the file's existing helpers (`setIdentity`,
  `replace`, `row`, `expectError`) and its per-test `begin`/`rollback`. Add a small helper
  that calls RPCs as the admin. The tests:
  1. **Directory seed.** 11 areas exist, with the exact groups, names, owners and
     "reports to" values from the spec table, ordered by group (reporting, operations,
     demand) and then `sort_order`. `ops_settings.escalation_days` is 5.
  2. **Upload defaults.** Imported non-merge rows get the operations area's id. Imported
     merge rows get a null area. Every imported row has `source = 'import'`.
  3. **Manual items survive uploads.** An upload keeps manual items. A manual item whose
     `interaction_id` appears in the upload is removed, and the imported row takes its
     place.
  4. **Routing survives uploads.** Route an imported issue with `route_ops_request` (B2B
     area, owner `"Someone"`), then upload the same `interaction_id` again. Its `area_id`
     and `owner_name` are kept.
  5. **`save_ops_manual_item`.**
     - It inserts an issue. A blank id produces `interaction_id` like `^MAN-[0-9A-F]{8}$`,
       with `source = 'manual'`, `upload_id = null`, and lowercase `requestor_key` and
       `assigned_to_key`.
     - It updates the same item when `id` is passed.
     - A merge item always stores a null area and an empty owner.
     - It rejects:
       - a duplicate `interaction_id` (message matches `/already exists/`)
       - an unknown kind or status
       - an empty title
       - updating an imported row through this function
  6. **Delete and route.**
     - `delete_ops_manual_item` deletes manual rows and rejects imported rows (message
       matches `/not found/`).
     - `route_ops_request` rejects merge requests (`/not found/`).
  7. **Areas.**
     - `save_ops_area` inserts and updates.
     - It rejects a duplicate name (ignoring case) with `/already exists/`, an unknown group,
       and an empty name.
     - `delete_ops_area` sets referencing items' `area_id` to null.
  8. **Settings.** `save_ops_settings(7)` stores 7. 0 and 366 are rejected.
  9. **Access.** Every new function rejects a signed-in non-admin
     (`/admin access required/i`) and cannot be executed by `anon`. Follow how the existing
     tests check `replace_ops_requests`.

- [ ] **Step 2: Run the tests and confirm they fail.**
  `npx vitest run tests/ops-requests-database.test.ts`. It should fail with ENOENT for
  `0041`.

- [ ] **Step 3: Write the migration** `supabase/migrations/0041_ops_issues.sql`:

```sql
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
   where source = 'import';

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
           request_type = case when v_is_merge then 'Merge Request' else request_type end,
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
```

  If a test shows a real bug in this SQL, fix it and say so in your report. Don't weaken a
  test to make it pass.

- [ ] **Step 4: Run the database test.** It should pass. Then run
  `npm run test:database -- --maxWorkers=2`; only the known baseline may fail.
- [ ] **Step 5: Commit** with the message
  `feat(ops): database for manual items, ownership areas and escalation`.

---

### Task 2: Types, loading, mutations and import defaults

**Files:**
- Modify:
  - `types/database.ts`: add the `ops_areas` and `ops_settings` tables, the new
    `ops_requests` columns (`upload_id` becomes `string | null`), and the six new RPCs under
    `Functions`, following the existing `replace_ops_requests` entry.
  - `lib/ops/types.ts`
  - `lib/ops/load.ts`
  - `lib/ops/mutations.ts`
  - `lib/ops/normalize.ts`
  - `tests/fixtures/ops-requests.ts`
  - every place that builds an empty `OpsDataset` (search `requests: [], upload: null`)
- Test:
  - `tests/ops-load-mutations.test.ts`
  - `tests/ops-normalize.test.ts`
  - a new `tests/ops-issue-mutations.test.ts`

**Types** (`lib/ops/types.ts`):

```ts
export type OpsSource = "import" | "manual";
export type OpsAreaGroup = "reporting" | "operations" | "demand";
export const OPS_AREA_GROUPS: readonly OpsAreaGroup[] = ["reporting", "operations", "demand"];
export const OPS_AREA_GROUP_LABELS: Record<OpsAreaGroup, string> = {
  reporting: "Reporting & Dashboarding SPOCs",
  operations: "Data Lake Operations",
  demand: "Demand Projects",
};
export interface OpsArea {
  id: string;
  group: OpsAreaGroup;
  name: string;
  ownerName: string;
  reportsTo: string;
  sortOrder: number;
}
export interface OpsSettings { escalationDays: number }
export const DEFAULT_OPS_SETTINGS: OpsSettings = { escalationDays: 5 };
// OpsRequest gains:
//   id: string;            // database id ("" before saving)
//   source: OpsSource;
//   areaId: string | null;
//   ownerName: string;     // per-item override; "" means use the area's owner
// OpsDataset gains: areas: OpsArea[]; settings: OpsSettings;
export function emptyOpsDataset(): OpsDataset;  // { requests: [], upload: null, areas: [], settings: DEFAULT_OPS_SETTINGS }
```

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - `mapOpsRequestRow` maps `id`, `source`, `area_id` and `owner_name`.
  - `loadOpsDataset` also loads areas and settings. Areas are ordered by group
    (reporting, operations, demand), then `sort_order`, then name. Missing settings fall
    back to 5 days. Errors from those queries raise `Could not load Ops Requests: …`.
  - A `null` client returns `emptyOpsDataset()`.
  - `normalizeRequests` outputs `id: ""`, `source: "import"`, `areaId: null` and
    `ownerName: ""`.
  - `ops-issue-mutations.test.ts` covers each new mutation with a fake `rpc`:
    - It sends the right RPC name and snake_case payload.
    - It returns the id where one is returned.
    - "admin access required" becomes "Only admins can change Ops Requests.".
    - Any other error becomes `Saving failed: <message>`.
- [ ] **Step 2: Implement** the types and `emptyOpsDataset`, then update `load.ts`. Add these
  to `mutations.ts`:

```ts
export interface OpsManualItemInput {
  id?: string;
  kind: "merge" | "issue";
  interactionId: string;          // "" lets the database generate MAN-XXXXXXXX
  status: OpsStatus;
  assignmentTime: string;         // YYYY-MM-DDTHH:MM:SS wall clock
  closeDate: string | null;
  requestTitle: string;
  description: string;
  requestorName: string;
  assignedTo: string;
  closureCode: string;
  areaId: string | null;          // issues only
  ownerName: string;              // issues only; "" = area owner
}
export async function saveOpsManualItem(supabase, input: OpsManualItemInput): Promise<string>;
export async function deleteOpsManualItem(supabase, id: string): Promise<void>;
export async function routeOpsRequest(supabase, id: string, areaId: string | null, ownerName: string): Promise<void>;
export async function saveOpsArea(
  supabase,
  area: { id?: string; group: OpsAreaGroup; name: string; ownerName: string; reportsTo: string; sortOrder: number },
): Promise<string>;
export async function deleteOpsArea(supabase, id: string): Promise<void>;
export async function saveOpsSettings(supabase, escalationDays: number): Promise<void>;
```

  Then update the normalizer defaults and the fixture: `makeOpsRequest` defaults
  `id: "<interactionId>-id"`, `source: "import"`, `areaId: null` and `ownerName: ""`.
  Replace every `{ requests: [], upload: null }` with `emptyOpsDataset()`.
- [ ] **Step 3:** Run `npm run test:unit`, `npx tsc --noEmit` and `npm run lint`; all must
  pass. Commit with the message `feat(ops): load and save areas, settings and manual items`.

---

### Task 3: Issue analytics

**Files:**
- Create: `lib/ops/issues.ts`
- Test: `tests/ops-issues.test.ts`

```ts
export interface IssueView {
  request: OpsRequest;
  area: OpsArea | null;      // null = Unrouted (no area, or the area no longer exists)
  owner: string;             // request.ownerName.trim() || area?.ownerName || "Unassigned"
  reportsTo: string;         // area?.reportsTo ?? ""
  openAgeMs: number | null;  // not closed and the clock is known: nowMs - assignment
  needsEscalation: boolean;  // openAgeMs !== null && openAgeMs > escalationDays * DAY_MS
}
export function describeIssues(requests: OpsRequest[], areas: OpsArea[], settings: OpsSettings, nowMs: number | null): IssueView[];
// only requests with !isMergeRequest

export interface OwnershipCard {
  key: string;               // area id, or "unrouted"
  area: OpsArea | null;
  name: string;              // area name, or "Unrouted"
  owner: string;             // area owner ("" for Unrouted)
  reportsTo: string;
  open: number;              // not closed
  closed: number;
  escalations: number;
  oldestOpenMs: number | null;
  avgResolutionMs: number | null;
}
export interface OwnershipGroup {
  key: OpsAreaGroup | "unrouted";
  label: string;
  cards: OwnershipCard[];
}
export function buildOwnershipBoard(issues: IssueView[], areas: OpsArea[]): OwnershipGroup[];
// Groups in OPS_AREA_GROUPS order. Every area appears, even with 0 issues; cards are
// ordered by sortOrder, then name. Groups with no areas are omitted. A final "Unrouted"
// group (label "Unrouted") appears only when some issue has no area.

export interface IssueFilters {
  status: OpsStatusFilter;
  areaKey: string;           // "all" | area id | "unrouted"
  escalationLine: string;    // "all" | reportsTo name
  escalationOnly: boolean;
  query: string;
}
export function filterIssues(issues: IssueView[], filters: IssueFilters): IssueView[];
// Newest assignment first. The query matches, ignoring case: ID, title, description,
// requestor, owner, area name.
export function escalationLines(areas: OpsArea[]): string[];   // distinct, non-empty, sorted
export function summarizeIssues(issues: IssueView[]): {
  total: number;
  counts: Record<OpsStatus, number>;
  needsEscalation: number;
};
```

- [ ] **Step 1:** Write the tests first, using fixture areas and requests, and the clock
  helpers from `lib/ops/analytics.ts` (`timestampMs`, `DAY_MS`). Cover:
  - owner override and fallback, and an area that no longer exists becoming Unrouted
  - the escalation boundary: exactly N days does not escalate, N days plus 1 ms does
  - closed issues never escalate, and a null clock means no escalation
  - board ordering, areas with 0 issues still appearing, and the Unrouted group
  - each filter on its own and combined
  - `escalationLines`
- [ ] **Step 2:** Implement, run the tests, type-check and lint. Commit with the message
  `feat(ops): issue routing, escalation and ownership board`.

---

### Task 4: Requests sub-tabs and the Merge Requests panel

**Files:**
- Create: `components/ops/merge-requests-panel.tsx`, moving the current KPIs, timeline,
  breakdowns and list out of `ops-requests-view.tsx`.
- Modify:
  - `components/ops/ops-requests-view.tsx`
  - `components/ops/ops-kpis.tsx`
  - `components/ops/ops-breakdowns.tsx`
  - `components/ops/ops-ticket-list.tsx`
  - `components/dashboard/dashboard-shell.tsx`
  - `app/[workspaceSlug]/page.tsx`
  - `lib/ops/analytics.ts` (drop now-unused kind helpers if nothing uses them)
- Test:
  - `tests/ops-requests-view.test.tsx`
  - `tests/ops-upload.test.tsx`
  - `tests/dashboard-shell.test.tsx`

**Behavior:**
- **`OpsRequestsView` layout.** Props: `dataset`, `isAdmin`, `loadError`, `toolbar`, and
  `initialTab?: "merge" | "issues"` (default `"merge"`).
  - Row 1 is unchanged: the toolbar, the "Last updated …" line, and Upload.
  - Row 2: `<SegmentedToggle label="Request category">` with **Merge Requests** and
    **Issues**, plus a slot on the right for the active tab's admin actions.
- **Tab link.** Switching tabs updates the URL query with `history.replaceState`, keeping
  `view`. `tab=merge` is removed from the URL because it's the default; `tab=issues` is
  set. The shell and page pass `initialTab` from `searchParams.tab`. Switching the main
  toggle back to Projects also clears `tab`.
- **Merge Requests panel.** Shows only `isMergeRequest` items: the status KPI cards, the
  weekly chart, closure codes, "By requestor" and the list.
  - It no longer has the Merge/Other KPI cards, the "By request type" table, or the
    request type filter in the list. All three are redundant now.
  - Manual items show a `Manual` badge (class `ops-manual-flag`) next to the title in the
    list.
- **Issues tab.** For this task, render a placeholder panel showing "Issues" and a count.
  Task 5 replaces it.
- **Upload preview.** Keep the merge count. Change the replace note to: "Replacing will
  update all imported Ops Requests data. Manually added items are kept."

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - The default tab is Merge Requests and shows only merge items: KPI totals count merge
    items, and list ids are merge items only.
  - Switching to Issues updates `?tab=issues`, and `initialTab="issues"` opens on it.
  - The Manual badge shows on manual merge items.
  - The upload note text matches.
  - In the shell test for the Requests toggle, switching to Projects removes both `view`
    and `tab` from the URL.
- [ ] **Step 2:** Implement, run the unit tests, type-check, lint and build. Commit with the
  message `feat(ops): Merge Requests / Issues tabs`.

---

### Task 5: Issues panel (read-only)

**Files:**
- Create:
  - `components/ops/issues-panel.tsx`
  - `components/ops/issues-board.tsx`
  - `components/ops/issue-list.tsx`
- CSS: `app/globals.css` (reuse the existing ops styles; add only what's new)
- Test: `tests/ops-issues-panel.test.tsx`

**Behavior:**
- **Data.** Uses `describeIssues` with the client clock. Copy the
  `useSyncExternalStore` "now" pattern from `ops-requests-view.tsx`.
- **KPIs** (`kpi-grid kpi-grid-status`, region "Issue overview"):
  - Total issues
  - Open, In Progress, Pending and Closed. These are buttons that filter by status, and a
    second click clears the filter.
  - **Needs escalation**: a button that toggles `escalationOnly`. It uses a red accent.
- **Ownership board** (region "Ownership").
  - One section per group, headed by the group label.
  - Each area is a button card showing: area name, owner, "Reports to <name>", open count,
    closed count, "Oldest open <duration>" and "Avg resolution <duration>" (use
    `formatDuration`), plus an "N to escalate" chip when greater than 0.
  - Clicking a card sets the list's area filter, and the card shows as pressed. Clicking
    again clears it.
- **List** (`ops-panel`, heading "Issues").
  - Filters: Search, Status, Area (All areas, then each area grouped with `<optgroup>`
    under its group label, plus Unrouted when present), and Escalation line (All, then
    `escalationLines`).
  - Columns: ID (the details button, as in the merge list), Issue (title plus a `Manual`
    badge), Area, Owner, Status, Raised, Age / Resolution, and an "Escalate to <reportsTo>"
    badge (class `ops-escalate-flag`) on rows that need escalation.
  - Empty states: "No issues match these filters." and, with no issues at all, "No issues
    yet."
- **Details dialog.** Like the merge one, plus Area, Owner and Reports to.

**Steps:**
- [ ] **Step 1: Write the failing tests** with fixture areas and requests (imported and
  manual issues, one old open issue, one unrouted). Assert:
  - KPI counts and the Needs escalation filter
  - board groups, cards, counts and the escalate chip
  - clicking a card filters the list
  - the area and escalation-line filters
  - the badges
  - the details content
- [ ] **Step 2:** Implement, run the tests, type-check and lint. Commit with the message
  `feat(ops): Issues panel with ownership board and escalation`.

---

### Task 6: Admin forms for manual items and routing

**Files:**
- Create: `components/ops/manual-item-form.tsx` and `components/ops/route-issue-dialog.tsx`
- Modify: the panels and lists from Tasks 4 and 5
- Test: `tests/ops-issue-admin.test.tsx`, plus additions to `tests/ops-requests-view.test.tsx`

**Behavior** (admins only; visitors see none of these controls):
- **Add merge request.** On the Merge Requests tab, this opens `ManualItemForm` with
  kind `merge`. Fields:
  - Interaction ID (optional, hint "Leave blank to generate one")
  - Title (required)
  - Description
  - Requestor
  - Assignee
  - Status (select)
  - Assignment date and time (`datetime-local`, required)
  - Close date and time (`datetime-local`)
  - Closure code

  Validation messages: "Title is required.", "Assignment time is required.", and "Close
  time can't be earlier than the assignment time." Save calls `saveOpsManualItem`, then
  refreshes the page data (`router.refresh()`), as the upload does.
- **Add issue.** On the Issues tab, the same form with kind `issue`, plus an **Area** select
  (grouped, required) and **Owner**. Owner pre-fills with the selected area's owner and
  follows area changes until the admin types into it. Saving an owner equal to the area
  owner stores `""`, so later directory changes still apply.
- **Manual items.** The details dialog shows **Edit** and **Delete** for manual items. Edit
  opens the form pre-filled. Delete asks for confirmation ("Delete <ID>?") and then calls
  `deleteOpsManualItem`.
- **Imported issues.** The details dialog shows **Route**. It opens `RouteIssueDialog`
  with an Area select and an Owner field, filled in the same way, and saves with
  `routeOpsRequest`.
- **Errors.** Errors stay visible in the dialog (`role="alert"`), the dialog stays open,
  and double submits are blocked while saving.

**Steps:**
- [ ] **Step 1: Write the failing tests.** Mock `@/lib/ops/mutations` and `next/navigation`.
  Assert:
  - each button appears only for admins
  - the form payloads, including the owner-equal-to-area-owner-stored-as-empty rule
  - validation messages
  - delete confirmation
  - routing
  - error display
  - `router.refresh` called after success
- [ ] **Step 2:** Implement, run the tests, type-check and lint. Commit with the message
  `feat(ops): add, edit, delete and route requests manually`.

---

### Task 7: Manage areas and the escalation setting

**Files:**
- Create: `components/ops/manage-areas-dialog.tsx` and
  `components/ops/escalation-settings.tsx`
- Modify: `components/ops/issues-panel.tsx`
- Test: `tests/ops-areas-admin.test.tsx`

**Behavior** (admins only, on the Issues tab's action slot):
- **Manage areas.** Opens a dialog listing areas by group.
  - Each row can be edited inline: Name, Owner, Reports to, plus Save and Delete.
  - Each group has an "Add area" row with Name, Owner, Reports to and Add. A new area gets
    `sortOrder` equal to the largest in its group plus 1.
  - Delete confirms with "Delete <name>? Its issues become Unrouted.".
  - Calls go through `saveOpsArea` and `deleteOpsArea`, then `router.refresh()`. Errors
    show inline.
- **Escalation.** A button labeled "Escalation: N days" opens a small dialog with a number
  input (1–365) and Save, which calls `saveOpsSettings`. It shows the validation message
  "Enter a whole number of days from 1 to 365.".

**Steps:**
- [ ] **Step 1: Write the failing tests** for each behavior, plus visitors seeing neither
  button.
- [ ] **Step 2:** Implement, run the tests, type-check and lint. Commit with the message
  `feat(ops): manage ownership areas and escalation days`.

---

### Task 8: Verification

- [ ] Run `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, and
  `npm run test:database -- --maxWorkers=2`; only the known baseline may fail. Run
  `npm run build`.
- [ ] Check in the browser with a temporary preview page that renders `OpsRequestsView`
  from the merge sample fixture and the seeded areas:
  - both tabs
  - the board
  - filters
  - escalation badges

  Delete the preview page afterwards.
