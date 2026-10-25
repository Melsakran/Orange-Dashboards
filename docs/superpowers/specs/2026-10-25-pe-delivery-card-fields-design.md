# PE Development card fields: design

Date: 2026-10-25
Status: Approved in brainstorming

## Goal

On the PE Development dashboard (workspace slug `pe-delivery`), projects and
their subtasks get five fields:

- Start Date
- Deployment Date
- Readiness Date
- Team Efforts
- Time to market efforts

The "Target" field is removed.

## Decisions

| Topic | Decision |
| --- | --- |
| Existing Target dates | Discarded. Deployment Date and Readiness Date start empty. |
| Date order | Start Date ≤ Deployment Date ≤ Readiness Date. Each check applies only when both dates are set. Readiness must also be on or after Start when Deployment is empty. |
| Team Efforts | Admin-entered working days, e.g. "8 WDs" |
| Time to market efforts | Admin-entered working days |
| Precision | 0 to 9999.9, at most one decimal place (e.g. 2.5) |
| Scope | Project cards, the project form, and subtasks (shown in the details view and edited in the subtask form) |
| Storage | Reuse `work_items.end_date` as Deployment Date, the same way Digital uses it for "RFT Date". Add `readiness_date`, `team_effort_wd`, and `time_to_market_wd`. |
| Other dashboards | Unchanged |

## Data

New migration: `supabase/migrations/0035_pe_delivery_card_fields.sql`.

- **One-time clear.** Before adding the new columns, if `work_items.readiness_date`
  doesn't exist yet, set `end_date = null` for every PE Development work item.
  Checking for the column makes the clear run only once, so re-running the file
  never wipes Deployment Dates that admins entered later.
- **New columns.**
  - `readiness_date date`
  - `team_effort_wd numeric(5,1)` with check `>= 0`
  - `time_to_market_wd numeric(5,1)` with check `>= 0`
- **Readiness check.** `readiness_date` is null, or it is on or after `end_date`
  (when set) and on or after `start_date` (when set).
- **Start → Deployment.** Already enforced by the existing
  `end_date >= start_date` check.
- **Types.** `types/database.ts` gains the three columns.

## UI

- **Shared helpers** in `lib/dashboard/card-format.ts`:
  - `formatCardDate`, moved out of `project-card.tsx`
  - `formatWorkingDays`: "Not set", "1 WD", "2.5 WDs", "8 WDs"
  - `parseWorkingDays`
  - `deliverySummary(item)`
- **Workspace check.** `usesDeliveryFields(slug)` in
  `lib/dashboard/workspace-style.ts` is true only for `pe-delivery`.
- **Card.** `ProjectCard` gets `scheduleMode="delivery"`, which renders:
  - Start Date and Deployment Date (empty shows "Not scheduled")
  - Readiness Date (empty shows "Not scheduled")
  - Team Efforts and Time to market efforts (empty shows "Not set")
- **Details view.** For PE Development, each subtask's line in
  `ProjectDetailsModal` reads "{status} · Start 1 Oct 2026 · Deployment … ·
  Readiness … · Team 8 WDs · Time to market 12 WDs". Fields that aren't set are
  left out.
- **Form.** `WorkItemForm` gets `deliveryFields`. When it's on, the form shows:
  - date inputs labelled Start Date, Deployment Date, and Readiness Date
  - number inputs labelled "Team Efforts (WDs)" and "Time to market efforts
    (WDs)" (`step="0.1"`, `min="0"`)
- **Validation errors.**
  - "Deployment Date must be on or after the Start Date."
  - "Readiness Date must be on or after the Deployment Date."
  - "Readiness Date must be on or after the Start Date."
  - "Enter working days as a number from 0 to 9999.9 with at most one decimal."
- **Saving.** `WorkItemFormValue` gains optional `readinessDate`,
  `teamEffortWd`, and `timeToMarketWd`. They are sent only when
  `deliveryFields` is on, so other dashboards' rows are never touched. The view
  model maps them to `readinessDate`, `teamEffortWd`, and `timeToMarketWd`.

## Testing

- **Database (PGlite).**
  - The clear runs only for `pe-delivery` and only once.
  - The new checks reject a readiness date before the deployment date, a
    readiness date before the start date, and negative efforts.
  - One-decimal values round-trip.
- **Unit.** `card-format` helpers and form validation.
- **Components.** The card shows the five fields and no "Target". The form saves
  the new values. The details view shows the subtask summary.
- **Regression.** Existing tests for other dashboards pass unchanged.

## Deployment

- Merging to `main` deploys the code.
- Paste `0035` into the Supabase SQL editor once. That one-time step clears
  PE Development's old Target dates.
