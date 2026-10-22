# Ops Requests upload dashboard — design

Date: 2026-10-22
Status: Approved in brainstorming, pending written-spec review

## Goal

A standalone page at `/ops` called **Ops Requests**. Admins upload a service-desk
export (CSV or Excel). The page turns the uploaded rows into an analytics
dashboard that anyone with the link can view.

## Decisions

| Topic | Decision |
| --- | --- |
| URL and navigation | `/ops` only. Not in the workspace dropdown, not linked from other pages. |
| Page name | Ops Requests |
| Who can view | Anyone with the link, read-only |
| Who can upload | Admins only (same `is_admin()` check as the other dashboards) |
| File types | `.csv` and `.xlsx` |
| Upload behavior | Replace everything: the dashboard always reflects exactly the latest sheet |
| Statuses | `Open`, `Pending`, `Closed` |
| Storage | Parse in the browser, store rows in a Supabase table, replace in one transaction |
| Search engines | Page sets `noindex` |

## Input format

Reference file: a service-desk export with these 11 headers, in any order:

`Interaction ID, Status, Assignment Time, Title, Request Title, Description,
Requestor Name, Close Date, Closure Code, Closure Comments, Assigned To`

Rules:

- Header matching ignores case and surrounding whitespace. If a required header
  is missing, the upload stops and the error names the missing headers. Extra
  columns are ignored.
- Rows where every cell is empty are skipped. The sample file has about 410 of
  these after its 19 real rows.
- A UTF-8 byte-order mark at the start of a CSV file is stripped.
- `Interaction ID` is required and must be unique within the file.
- `Status` is required and must be Open, Pending, or Closed, matched without
  regard to case. It is stored as `open`, `pending`, or `closed`.
- Dates are month/day/year with optional `H:MM` time, and leading zeros are
  optional, for example `5/17/2026 13:50` and `06/09/2026 14:53`. In `.xlsx`
  files, real date cells are also accepted. Dates are treated as local times
  with no timezone conversion.
- `Assignment Time` is required. `Close Date` is optional; when it is present,
  it must parse and must not be earlier than `Assignment Time`.
- All other text fields are optional and stored trimmed. The page displays
  `Request Title` because `Title` is always "New Task" in the sample.
- Requestor and assignee names are stored as written plus a lowercase key for
  grouping, so `HElGhandour` and `helghandour` count as one person. The
  display name is the most common spelling for that key; on a tie, the first
  spelling in the file wins.

Any rule violation blocks the upload and lists every failing row as row number,
interaction ID, and reason. Nothing is saved until the file passes every check.

## Data model

New migration: `supabase/migrations/0033_ops_requests.sql`.

`ops_requests`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | default `gen_random_uuid()` |
| `interaction_id` | text | unique, not null |
| `status` | text | check in (`open`, `pending`, `closed`) |
| `assignment_time` | timestamp | not null |
| `title` | text | |
| `request_title` | text | |
| `description` | text | |
| `requestor_name` | text | |
| `requestor_key` | text | lowercase of requestor name |
| `close_date` | timestamp | nullable |
| `closure_code` | text | |
| `closure_comments` | text | |
| `assigned_to` | text | |
| `assigned_to_key` | text | lowercase of assigned to |
| `upload_id` | uuid | references `ops_request_uploads` |

`ops_request_uploads`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `uploaded_at` | timestamptz | default `now()` |
| `uploaded_by` | uuid | `auth.uid()` |
| `uploaded_by_email` | text | |
| `file_name` | text | |
| `row_count` | integer | |

Row-level security:

- `select` is allowed for `anon` and `authenticated` on both tables.
- There are no direct insert, update, or delete policies. All writes go through
  the function below.

Function `replace_ops_requests(p_file_name text, p_rows jsonb) returns uuid`:

- Declared `security definer`. It raises an error unless `public.is_admin()`
  returns true.
- In one transaction, it inserts an upload record, deletes every existing
  `ops_requests` row, inserts the new rows from `p_rows`, and returns the
  upload id.
- Any failure rolls the whole call back, so the previous data stays intact.
- `execute` is granted to `authenticated` only.

`types/database.ts` gains the two tables and the function.

## Upload flow (admin)

1. **Upload** button, shown only to admins, opens a file picker accepting
   `.csv` and `.xlsx`.
2. In the browser:
   - `parse-sheet` turns the file into an array of header-to-value records. CSV
     uses a small built-in parser that handles quotes, commas, and newlines
     inside quotes. `.xlsx` uses `exceljs` and reads the first worksheet.
   - `normalize` applies the input rules and returns either typed rows or a list
     of errors.
3. A preview dialog, built on the existing `ModalDialog` component, shows
   either the list of errors with no way to save, or a summary such as
   "19 requests found — 0 open, 0 pending, 19 closed" with **Cancel** and
   **Replace data** buttons. The dialog warns that this replaces all current
   data.
4. **Replace data** calls `replace_ops_requests`. On success the page refreshes
   from the server. On failure it shows the error with **Retry**, and the
   existing data is untouched.

## Dashboard

All metrics are computed by pure functions in `lib/ops/analytics.ts` from the
loaded rows. They run in the browser, inside the client shell, so open aging
uses the viewer's clock rather than the server's UTC time.

1. **Header**: the "Ops Requests" title, "Last updated {date} by {email} ·
   {row count} requests", and the admin-only Upload button.
2. **KPI cards**:
   - Total requests
   - Open, Pending, and Closed counts. Clicking one filters the ticket list, and
     clicking it again clears the filter.
   - Closure rate: closed ÷ total, as a percentage
   - Average and median resolution time for closed rows, from assignment time
     to close date. Values under 24 hours show in hours; longer values show in
     days with one decimal.
   - Open aging: the average and the oldest age of Open and Pending rows, from
     assignment time to now.
3. **Closure codes**: a horizontal bar per closure code with count and share.
   Rows with no code are grouped as "(none)".
4. **By assignee**: a table with name, total, open, pending, closed, and
   average and median resolution time, sorted by total, highest first.
5. **By requestor**: a table with name, total, open, pending, and closed,
   sorted by total, highest first.
6. **Over time**: weekly buckets, with weeks starting Monday. Each week shows
   paired bars for the number assigned and the number closed, covering the
   earliest to the latest date in the data. Bars are plain CSS or SVG; no
   charting library is added.
7. **Ticket list**:
   - A search box that matches ID, request title, description, requestor,
     assignee, and closure comments, ignoring case.
   - Status and assignee filters.
   - Sorted by assignment time, newest first.
   - Columns: ID, request title, status, requestor, assignee, assigned, closed,
     and resolution time.
   - Clicking a row opens a detail dialog with all fields, including the full
     description and closure comments.
8. **Empty state**: when there are no rows, the page shows "No data uploaded
   yet", plus an Upload button for admins.

## Code layout

- `app/ops/page.tsx`: a server component. It loads the rows and the latest
  upload with the server Supabase client, checks whether the visitor is an
  admin (reusing `getAdminStatus`), and sets `robots: { index: false }`.
  Without Supabase environment variables it renders the empty state with no
  Upload button.
- `lib/ops/types.ts`: `OpsRequest`, `OpsStatus`, and `OpsUpload`.
- `lib/ops/parse-sheet.ts`: turns a file into raw records, for CSV and `.xlsx`.
- `lib/ops/normalize.ts`: turns raw records into typed rows or errors.
- `lib/ops/analytics.ts`: KPIs, breakdowns, resolution times, aging, weekly
  buckets, and duration formatting.
- `lib/ops/load.ts`: server-side reads.
- `lib/ops/mutations.ts`: the client-side `replaceOpsRequests` RPC wrapper.
- `components/ops/`:
  - `ops-requests-page.tsx`: the client shell that owns the filter and
    selection state.
  - `ops-upload.tsx`: the picker, the preview dialog, and the confirm step.
  - `ops-kpis.tsx`
  - `ops-breakdowns.tsx`: closure codes, assignees, and requestors.
  - `ops-timeline.tsx`
  - `ops-ticket-list.tsx`: the list plus the detail dialog.
- Styles go in `app/globals.css`, reusing the existing KPI-card, table, and
  modal classes.

## Testing

- `tests/fixtures/ops-requests-sample.csv`: a copy of the provided export,
  blank rows included.
- `parse-sheet` tests: CSV with a byte-order mark, quoted commas, and blank
  rows; `.xlsx` generated in the test with `exceljs`.
- `normalize` tests: a missing header, a bad status, a bad date, a close date
  before the assignment time, a duplicate ID, mixed-case names, and the sample
  file producing 19 valid rows.
- `analytics` tests: KPI counts, closure rate, average and median resolution,
  aging with a fixed "now", assignee and requestor grouping, weekly buckets,
  and duration formatting.
- Component tests: Upload hidden for non-admins; preview shows errors or a
  summary; Cancel doesn't save; Replace calls the RPC; empty state; status-card
  filtering and search in the ticket list.
- Database test, in PGlite like the existing database tests: a non-admin call
  to `replace_ops_requests` fails; an admin call fully replaces the previous
  rows; a failed insert leaves the previous rows in place.

## Deployment

- Merging to `main` deploys the code to Vercel production.
- The migration `0033_ops_requests.sql` must be run once in the Supabase SQL
  editor, as with earlier migrations.

## Out of scope

- Upload history, or switching between earlier uploads
- Editing individual requests in the UI
- Mapping usernames to full names
- Exporting the dashboard
