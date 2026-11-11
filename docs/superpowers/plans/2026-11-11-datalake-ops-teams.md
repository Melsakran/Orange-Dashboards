# Data Lake Operations Requests: team split implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Data Lake Operations stays **Projects | Requests**. Requests stays **Merge Requests |
Issues**, and each of those gets an **Operations | Data Analytics** team toggle, giving four
views.

- **One layout everywhere.** All four views use the current Merge Requests layout: status
  KPIs, closure rate, average resolution and open aging; the weekly chart; closure codes;
  "By requestor"; and the searchable list with details.
- **Uploads go to the selected team.** A file replaces only that team's imported rows.
  Merge Request rows go to that team's Merge Requests and all other rows go to its Issues.
- **Manual items** belong to the selected team. Add, edit and delete stay.
- **Existing data becomes Operations.**
- **Ownership and escalation leave the app.** Remove from the UI and app code: the
  ownership board, area directory, routing, area and owner fields in the issue form, the
  escalation KPI, escalation badges and the escalation setting. **Keep the database tables**
  (`ops_areas`, `ops_settings`) and their columns and functions; the app simply stops using
  them.

**User decisions (binding):** see the Goal above. These reverse parts of
`docs/superpowers/specs/2026-11-11-datalake-ops-issues-design.md`. That spec still holds for
manual items, upload replacement of imported rows only, generated `MAN-` IDs, and the
duplicate-ID replacement.

**Conventions:** as in `docs/superpowers/plans/2026-11-11-datalake-ops-issues.md`: repo
patterns, Vitest/PGlite, commands, the known baseline, and no pushing. Commit at the end of
each task. If git fails in the sandbox, re-run it with full permissions.

**Teams:** the stored values are `operations` and `data_analytics`, labelled "Operations" and
"Data Analytics". The URL parameter is `team=analytics` for Data Analytics; Operations is the
default and is left out of the URL.

---

### Task 1: Database (migration 0042) and database tests

**Files:** Create `supabase/migrations/0042_ops_teams.sql`. Modify
`tests/ops-requests-database.test.ts` to load `0042` after `0041`, and add the tests below.

- [ ] **Step 1: Failing tests first.** Cover:
  1. **Existing rows.** Existing rows and uploads get `team = 'operations'`.
  2. **Upload scope.** `replace_ops_requests(file, rows, 'data_analytics')`:
     - stores the upload with `team = 'data_analytics'`
     - replaces only Data Analytics imported rows, leaving Operations imported and manual rows
       untouched
     - removes Data Analytics manual items whose ID is in the file
  3. **Same ID in both teams.** The same `interaction_id` can exist in both teams.
     Re-uploading the same ID within one team in the same file still fails, as today.
  4. **Two-argument version.** `replace_ops_requests(file, rows)` behaves as Operations.
  5. **Team validation.** An unknown team is rejected (`/unknown team/`).
  6. **Manual items.** `save_ops_manual_item` stores `team` from the payload (default
     `operations`) and rejects an unknown team. The duplicate-ID check works per team. An
     update keeps the item's team.
  7. **Access.** The new three-argument function rejects non-admins and `anon`.

- [ ] **Step 2: Migration** `supabase/migrations/0042_ops_teams.sql`:

```sql
-- Data Lake Operations Requests: every item belongs to a team (Operations or Data Analytics);
-- uploads are per team. The ownership tables from 0041 stay but are no longer used. Re-runnable.

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
```

  Then `create or replace function public.save_ops_manual_item(p_item jsonb)` must be the
  0041 body with these changes:
  - Read `v_team text := coalesce(nullif(p_item ->> 'team', ''), 'operations');` and, after
    the admin check, `raise exception 'unknown team'` when it isn't one of the two.
  - The duplicate check adds `and team = v_team` on insert. On update, it uses the existing
    row's team: look it up first by `id`, and raise `manual item not found` if it doesn't
    exist or isn't manual.
  - The insert includes `team` = `v_team`. The update never changes `team`.
  - Keep everything else, including the area and owner handling, so the function signature
    and callers stay compatible. The app no longer sends area or owner, so they stay
    null/''.

  Finish with grants:

```sql
revoke all on function public.replace_ops_requests(text, jsonb, text) from public, anon;
revoke all on function public.replace_ops_requests(text, jsonb) from public, anon;
revoke all on function public.save_ops_manual_item(jsonb) from public, anon;
grant execute on function public.replace_ops_requests(text, jsonb, text) to authenticated;
grant execute on function public.replace_ops_requests(text, jsonb) to authenticated;
grant execute on function public.save_ops_manual_item(jsonb) to authenticated;
```

  Existing 0041 tests that check routing or the default area on upload test behaviour that
  the three-argument function no longer has. The two-argument version now delegates to it.
  Update those tests to the new behaviour (imported rows get a null area) and note this in
  your report. Keep all other 0041 tests, such as the RPCs for areas and settings, since
  those functions still exist.
- [ ] **Step 3:** Run the focused database test and then `npm run test:database -- --maxWorkers=2`
  (only the known baseline may fail). Commit with the message
  `feat(ops): per-team requests and uploads (database)`.

---

### Task 2: Data layer

**Files:**
- `types/database.ts`
- `lib/ops/types.ts`
- `lib/ops/load.ts`
- `lib/ops/mutations.ts`
- `lib/ops/normalize.ts` (adds `team` to its output only if `OpsRequest` requires it; use
  `"operations"`, and the caller overrides it)
- `tests/fixtures/ops-requests.ts`
- the related tests

**Steps:**
- **Types.**
  - `export type OpsTeam = "operations" | "data_analytics";`
  - `OPS_TEAMS` and `OPS_TEAM_LABELS`
  - `OpsRequest.team: OpsTeam`
  - `OpsUpload.team: OpsTeam`
  - `OpsDataset` becomes `{ requests: OpsRequest[]; uploads: Record<OpsTeam, OpsUpload | null> }`,
    replacing `upload`
  - Remove `areas`, `settings`, `OpsArea*`, `OpsSettings` and `DEFAULT_OPS_SETTINGS` from the
    app types, along with every use of them, once the UI is gone in Task 3.
    - In this task, keep the build green. If removing them now breaks UI that Task 3
      rewrites, do the removals in Task 3 instead and say so.
  - Keep `emptyOpsDataset()`.
- **Load.** `loadOpsDataset` loads the latest upload per team (one query per team or one
  ordered query) and no longer loads areas or settings. It maps `team`.
- **Mutations.**
  - `replaceOpsRequests(supabase, team, fileName, requests)` calls the three-argument RPC
    with `p_team`.
  - `OpsManualItemInput` gains `team: OpsTeam` and sends `team`. Drop `areaId`/`ownerName`
    from the input; the RPC tolerates them missing.
  - Remove `routeOpsRequest`, `saveOpsArea`, `deleteOpsArea` and `saveOpsSettings`, plus
    their tests, if nothing still uses them after Task 3. They can be removed in Task 3.
- **Tests first,** then implement. Run `npm run test:unit`, `npx tsc --noEmit` and
  `npm run lint`. Commit with the message `feat(ops): per-team requests in the data layer`.

---

### Task 3: UI

**Files:**
- `components/ops/ops-requests-view.tsx`
- `components/ops/merge-requests-panel.tsx` (generalize it into a `RequestsPanel`)
- `components/ops/ops-upload.tsx`
- `components/ops/manual-item-form.tsx`
- `components/ops/request-admin-actions.tsx`
- the dashboard shell and page (URL `team`)
- CSS
- tests

**Delete:**
- `components/ops/issues-panel.tsx`, `issues-board.tsx`, `issue-list.tsx`
- `route-issue-dialog.tsx`, `manage-areas-dialog.tsx`, `escalation-settings.tsx`,
  `area-owner-fields.tsx`
- `lib/ops/issues.ts`
- their tests and any CSS that only they use

**Behavior:**
- **Rows in the Requests view.**
  - Row 1 (unchanged): the Projects | Requests toggle, the summary line, and Upload.
  - Row 2: the Merge Requests | Issues toggle (`tab`), then an **Operations | Data
    Analytics** `SegmentedToggle` (label "Team", URL `team`, Operations is the default and
    is left out of the URL), with the Add button on the right.
- **Summary line.** Shows the selected team's latest upload, for example "Last updated … by
  … · N imported", or "No data uploaded yet for Data Analytics".
- **Upload.** The button is labelled "Upload" and uploads for the selected team.
  - The dialog title or preview names the team: "Upload for Data Analytics".
  - The replace note says the file replaces that team's imported requests.
  - The collision count only considers that team's manual items.
- **`RequestsPanel` for all four views.** Props: the requests already filtered by kind
  (merge or issue) and team, plus a noun such as "merge requests" or "issues" for the copy.
  - It keeps today's merge layout: KPIs, weekly chart, closure codes, "By requestor", and
    the list with details.
  - Empty state, for example: "No issues for Data Analytics yet."
- **Manual form.** Drop the Area and Owner fields. Kind comes from the tab and team from the
  team toggle. Edit keeps the item's team.
- **Shell and page.** Carry `team` like `tab`. When leaving Requests, remove `view`, `tab`
  and `team`. The page passes `initialTeam` from `searchParams.team` (`analytics` maps to
  Data Analytics).
- **Tests first.** Cover:
  - the four views each showing only their kind and team
  - URL syncing for `team`
  - the upload sending the selected team and the preview naming it
  - the per-team summary
  - the Add form using the current kind and team
  - removed controls being absent (Manage areas, Escalation, the Ownership board, the
    Needs escalation card)

  Then run `npm run test:unit`, `npx tsc --noEmit`, `npm run lint` and `npm run build`.
  Commit with the message
  `feat(ops): Operations / Data Analytics team views; remove ownership and escalation UI`.
