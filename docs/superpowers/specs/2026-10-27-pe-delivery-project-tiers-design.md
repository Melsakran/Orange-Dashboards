# PE Development: Critical / Standard KPI rows (design)

Date: 2026-10-27
Status: approved in brainstorming

## Goal

On PE Development (`pe-delivery`):

- Add an "Upcoming Delivery" status and KPI card right after Development.
- Move On Hold after Delayed.
- Show the KPI cards twice, as two titled rows: "Critical Projects" and
  "Standard Projects".
- Each row counts only projects with that tag. Admins set the tag on each
  project, and it defaults to Standard.

## Decisions

| Topic | Decision |
| --- | --- |
| Status order | Planning, Development, Upcoming Delivery, Testing, Live, Delayed, On Hold |
| Upcoming Delivery | Color `#23b123` (same as Development), reporting category `active` |
| Tag | `standard` (default) or `critical`. Applies to projects only, not subtasks. Not shown on cards. |
| Each row | Its own "Projects / CRS" total, then one card per status, counting projects with that tag |
| Card click | Filters the list by tag and status. A row's total card filters by tag only. Clicking the active card again clears the filter. |
| Status chips | Still filter by status and keep the selected tag. A removable "Critical projects ×" or "Standard projects ×" chip shows the active tag. |
| Other dashboards | Unchanged: single row, no tag |

## Data

Migration `supabase/migrations/0036_pe_delivery_project_tiers.sql`:

- **Tag column.** `work_items.project_tier text not null default 'standard'`,
  with a check that the value is `standard` or `critical`. All existing rows
  become Standard.
- **New status.** Insert "Upcoming Delivery" (id
  `20000000-0000-4000-8000-00000000003d`). The insert is skipped if a status
  with that name already exists in the workspace, for example one an admin
  created by hand.
- **Order.** Reorder the PE Development statuses to the order above. Before
  reordering, shift all sort orders by 1000, because the workspace's sort
  orders must stay unique.
- **Re-runs.** The file can be re-run safely.

Also update `supabase/seed.sql`, `types/database.ts`, and the PE Development
fixture statuses so they match.

## UI

- **View model.** `DashboardWorkItem.projectTier?: "critical"`. The key is only
  present for critical items, and a missing key means Standard.
- **Form.** `WorkItemFormValue.projectTier?: "standard" | "critical"`. The
  value is only sent when the form shows the field, so other dashboards' rows
  are untouched. `WorkItemForm` gets `showProjectTier`. On PE Development
  project forms it shows a "Project type" select with "Standard project" and
  "Critical project".
- **KPI rows.** `KpiGrid` gets an optional `title`. With a title, it renders a
  headed row. On PE Development, the shell renders two `KpiGrid` rows inside a
  "Workspace status overview" region. Each row gets that tag's projects, and
  `activeFilter` is null unless that row's tag is the one selected.
- **Filtering.** The shell keeps a `tierFilter` (`all`, `critical` or
  `standard`) next to the status filter. The project list is filtered by tag
  and status.

## Testing

- **Database (PGlite).** The status order, the default tag, the tag check, an
  idempotent re-run, and an existing "Upcoming Delivery" not being duplicated.
- **Unit.** Mapping, payloads, and the form field.
- **Shell.** Both row titles and their counts, filtering by card, clearing the
  filter (active card or chip), and the status chips keeping the tag. Other
  dashboards keep a single row.

## Deployment

Paste `0036` into Supabase, then push to `main`.
