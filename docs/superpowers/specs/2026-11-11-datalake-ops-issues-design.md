# Data Lake Operations: Merge Requests and Issues (design)

Date: 2026-11-11
Status: approved in brainstorming

## Goal

On Data Lake Operations (`datalake-ops`), the **Requests** view gets a second toggle:

- **Merge Requests**: imported rows flagged as Merge Request, plus merge requests that
  admins add by hand.
- **Issues**: imported rows that are not merge requests, plus issues that admins add by
  hand. Each issue is routed to an owner using the "One Point of Contact for Every Module"
  setup.

The top-level toggle stays **Projects | Requests**.

## Ownership directory (admin-editable, seeded from the presentation)

| Group | Area / scope | Owner | Reports to |
| --- | --- | --- | --- |
| Reporting & Dashboarding SPOCs | CVM & B2C | Mohamed Adel | Dina Sallam |
| | Orange Cash & Sales | Asmaa | Dina Sallam |
| | Digital | Farida | Dina Sallam |
| | B2B | Eman Kandil | Dina Sallam |
| | NTRA | Eman Abdelnasser | Dina Sallam |
| | Finance | Amira Hanafy | Dina Sallam |
| | Customer Experience & Customer Service | Sara Hossam | Dina Sallam |
| Data Lake Operations (covers all areas) | Data Lake Operations | On-call member | Mohamed Habib |
| Demand Projects | Data Lake | Sherif | Dina Sallam |
| | Promo Engine | Yasmine | Mohamed Habib |
| | New Platforms & APIs | Abdallah | Mohamed Habib |

Admins can rename areas, change owners and managers, add areas, and delete areas. Items in
a deleted area become **Unrouted**.

## Decisions

| Topic | Decision |
| --- | --- |
| Sources | Each item is either `import` (from the sheet) or `manual` (added by an admin). |
| Upload | Replaces only imported items; manual items are kept. A manual item whose Interaction ID appears in the upload is replaced by the imported row. |
| Routing on re-upload | The area and owner an admin set on an imported item are kept when the same Interaction ID is uploaded again. |
| Imported issues | Start in the Data Lake Operations (on-call) area. Admins can re-route them. |
| Manual issue owner | Taken from the chosen area automatically. Admins can override it per issue. |
| Manual merge requests | Same fields as imported ones; no area. |
| Manual IDs | Optional. When left blank, an ID like `MAN-1A2B3C4D` is generated. IDs must be unique. |
| Escalation | An issue that is not closed and has been open longer than N days (default 5, set by admins) needs escalation to its area's "Reports to" person. |
| Links | `/datalake-ops?view=requests&tab=merge` (default) or `&tab=issues`. |

## UI

- **Requests view.**
  - First row: the Projects | Requests toggle, the "Last updated …" line, and Upload
    (admins; one upload feeds both tabs).
  - Second row: the Merge Requests | Issues toggle on the left and that tab's admin actions
    on the right.
- **Merge Requests tab.** The current KPIs (Total, Open, In Progress, Pending, Closed,
  closure rate, average resolution, open aging), the weekly chart, closure codes,
  "By requestor", and the searchable list, all limited to merge requests. Manual items show
  a "Manual" badge. Admins can **Add merge request**, and can edit or delete manual items.
- **Issues tab.**
  - KPIs: Total issues, Open, In Progress, Pending, Closed, and **Needs escalation**. The
    status cards and Needs escalation filter the list.
  - Ownership board, grouped as Reporting & Dashboarding SPOCs, Data Lake Operations, and
    Demand Projects (plus Unrouted when it has items). Each card shows area, owner, reports
    to, open and closed counts, oldest open age, and average resolution. Clicking a card
    filters the list by that area.
  - List: ID, issue, area, owner, status, raised date, age or resolution, and an
    "Escalate to …" badge. Filters: search, status, area, escalation line (the distinct
    "Reports to" names).
  - Admins: **Add issue**, **Edit** or **Delete** for manual issues, **Route** for imported
    issues (area and owner), **Manage areas**, and **Escalation** days.

## Data

Migration `0041_ops_issues.sql`:

- **`ops_areas`**: `id`, `area_group` (`reporting` | `operations` | `demand`), `name`
  (unique, case-insensitive), `owner_name`, `reports_to`, `sort_order`. Seeded with the
  directory above.
- **`ops_settings`**: a single row holding `escalation_days`, default 5, allowed range
  1–365.
- **`ops_requests` new columns**:
  - `source` (`import` | `manual`, default `import`)
  - `area_id` (references `ops_areas`, set to null when the area is deleted)
  - `owner_name` (an override; empty means use the area's owner)
- **`replace_ops_requests`**:
  - deletes imported rows only
  - deletes manual rows whose IDs are in the upload
  - keeps routing by Interaction ID
  - defaults imported non-merge rows to the operations area
- **New admin-only functions** (`security definer` RPCs):
  - `save_ops_manual_item`
  - `delete_ops_manual_item`
  - `route_ops_request`
  - `save_ops_area`
  - `delete_ops_area`
  - `save_ops_settings`
- **Read access**: public read on the new tables, the same as the existing Ops tables.

## Testing

- **Database (PGlite)**:
  - seed data
  - upload keeps manual items, removes duplicates, keeps routing, applies the default area
  - each RPC accepts admins and rejects everyone else
  - validation (unique ID, item kinds, area group, escalation range)
- **Unit**: mapping, analytics (owner resolution, escalation, ownership board, filters),
  and mutations.
- **Components**: tabs and links, Merge Requests limited to merge requests, Issues board,
  filters and badges, and the admin forms (add, edit, delete, route, manage areas,
  escalation days).
