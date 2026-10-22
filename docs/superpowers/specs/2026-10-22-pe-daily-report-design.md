# PE Daily Report dashboard — design

Date: 2026-10-22
Status: Approved in brainstorming, pending written-spec review

## Goal

A standalone page at `/pe-daily-report` that replaces the daily "Promo Engine"
PowerPoint (`Daily_Report.pptx`). It shows the same sections, fields, and charts.
Admins upload the daily export (CSV or Excel). The six sections that aren't in
the export are typed in by admins on the page. The charts are interactive:
hovering shows the values.

## Decisions

| Topic | Decision |
| --- | --- |
| URL and navigation | `/pe-daily-report` only. It is not in the workspace dropdown and not linked from other pages. |
| Page title | PE Daily Report, with the subtitle "Promo Engine" |
| Who can view | Anyone with the link, read-only. The page sets `noindex`. |
| Who can edit | Admins only, using the existing `is_admin()` and `getAdminStatus` checks |
| Uploaded sections | H_DYNAMIC promos (`PROMO` block), SMS (`SERVICE` block), Upselling Layer (`DATE` / `UPSELLING_COUNT` block) |
| Admin-entered sections | Promos – TX_PROV, Actions, Offer Sheet Tool, Data Lake, IT First Line Cases, Grafana |
| History | One report is kept per report date. The latest is shown by default, and a picker selects earlier dates. |
| Re-upload of an existing date | Replaces only that date's uploaded data. That date's admin-entered rows are kept. |
| New date | Starts with a copy of the admin-entered rows from the most recent earlier report |
| Charts | Recharts, with hover tooltips and clickable legends |
| Chart visibility | Admins choose which of the 4 charts everyone sees. Default: TX_PROV and H_DYNAMIC only, matching the deck. |
| H_DYNAMIC chart scale | One chart with a "Hide promos over 1M" switch, on by default |
| File types | `.csv` and `.xlsx` (first sheet) |

## Deck sections being replaced

| # | Slide | Fields | Source |
| --- | --- | --- | --- |
| 1 | Promos – TX_PROV (+ bar chart) | #, Promo Name, Last Week Count, Day Before Count, Yesterday Count | Admin-entered |
| 2 | Promos – H_DYNAMIC (+ bar charts) | #, Promo Name, Last Week Count, Day Before Count, Yesterday Count | Upload `PROMO` |
| 3 | Actions | #, Action, Status | Admin-entered |
| 4 | Upselling Layer | Date, Count | Upload `DATE` block |
| 5 | SMS | #, Promo Name, Type (Offline/Online), Last Week Count, Day Before Count, Yesterday Count | Upload `SERVICE` |
| 6 | Offer Sheet Tool | #, Promo Name, Owner, On GUI, Utilized Business | Admin-entered |
| 7 | Data Lake | #, File Path | Admin-entered |
| 8 | IT First Line Cases | #, Case, Promo Name, Is it 1st line?, Feedback | Admin-entered |
| 9 | Grafana | #, Issue, Server, Feedback | Admin-entered |

The title slide and the "Thanks" slide are not carried over.

## Upload format

Reference file: `daily report.csv`. The same layout is accepted from the first
worksheet of an `.xlsx` file.

```
REPORT_DATE,,,
22-10-2026,,,
,,,
PROMO<padding>,LAST_WEEK_COUNT,DAY_BEFORE_COUNT,YESTERDAY_COUNT
shop-internet-gifts<padding>,0,0,1
...
,,,
SERVICE<padding>,LAST_WEEK_COUNT,DAY_BEFORE_COUNT,YESTERDAY_COUNT
OFFLINE_charges-platform<padding>,3066693,3080900,3033645
...
,,,
DATE     ,UPSELLING_COUNT,,
15-Oct-26,13310531,,
...
```

Parsing rules:

- Every cell is trimmed. Promo and service names in the export carry long
  trailing-space padding.
- A row whose cells are all empty is a separator.
- **Report date.** A row whose first cell is `REPORT_DATE` (any case) must be
  followed, on the next non-separator row, by a date in `DD-MM-YYYY` format,
  for example `22-10-2026`. In `.xlsx` files a real date cell is also accepted.
  It is required and must be a real calendar date.
- **Blocks.** A block starts at a header row whose first cell is `PROMO`,
  `SERVICE`, or `DATE` (any case). It ends at the next separator row, the next
  header row, or the end of the file.
  - `PROMO` and `SERVICE` header rows must have the columns `LAST_WEEK_COUNT`,
    `DAY_BEFORE_COUNT`, `YESTERDAY_COUNT` in columns 2–4 (any case).
  - The `DATE` header row must have `UPSELLING_COUNT` in column 2.
- **`PROMO` rows.** The promo name (required), then three counts.
- **`SERVICE` rows.** The first cell must be `OFFLINE_<promo>` or
  `ONLINE_<promo>`. The prefix is matched in any case; the promo name keeps its
  case. The row gives the channel (`offline` or `online`), the promo name, and
  three counts.
- **`DATE` rows.** The day in `DD-Mon-YY` format, for example `15-Oct-26`, read
  as year 2000 + YY, or a real date cell in `.xlsx`. Then a count.
- **Counts.** Whole numbers zero or greater. Thousands separators are allowed
  (`1,234`). An empty count is an error.
- **Required content.** Each of the three blocks must appear exactly once and
  have at least one row.
- **Errors.** Any of the following blocks the whole upload:
  - a missing or invalid report date
  - a missing, repeated, or empty block, or a header with the wrong columns
  - a duplicate promo in `PROMO`
  - a duplicate (channel, promo) in `SERVICE`
  - a duplicate day in `DATE`
  - a bad name prefix, count, or day

  Every problem is listed as the row number and a reason. Nothing is saved
  until the file passes.
- **Order.** Rows keep the order they had in the file.

Preview before saving: "Report for 22 Oct 2026: 29 promos, 11 SMS rows,
7 upselling days". If a report for that date already exists, the preview adds
"This replaces the uploaded data for 22 Oct 2026. Admin-entered sections are
kept." Admins confirm with **Save report** or cancel.

## Data model

New migration: `supabase/migrations/0034_pe_daily_report.sql`.

- `pe_daily_reports`
  - `report_date date primary key`
  - `uploaded_at timestamptz not null default now()`
  - `uploaded_by uuid` references `auth.users(id)` on delete set null
  - `uploaded_by_email text`
  - `file_name text not null`
- `pe_daily_promos`
  - `report_date` references `pe_daily_reports` on delete cascade
  - `position int`
  - `promo text`
  - `last_week bigint`, `day_before bigint`, `yesterday bigint`, each `>= 0`
  - unique `(report_date, promo)`
- `pe_daily_sms`
  - `report_date`, `position`, `promo`
  - `channel text` check in (`offline`, `online`)
  - `last_week`, `day_before`, `yesterday` as above
  - unique `(report_date, channel, promo)`
- `pe_daily_upselling`
  - `report_date`, `position`
  - `day date`, `count bigint >= 0`
  - unique `(report_date, day)`
- `pe_daily_manual_rows`
  - `report_date` references `pe_daily_reports` on delete cascade
  - `section text` check in (`tx_prov`, `actions`, `offer_sheet`, `data_lake`,
    `it_cases`, `grafana`)
  - `position int`
  - `fields jsonb not null`, an object of field key → string, or a number for
    TX_PROV counts
- `pe_daily_settings`
  - a single row, `id boolean primary key default true check (id)`
  - `visible_charts text[] not null default '{tx_prov,h_dynamic}'`, where every
    element is in (`tx_prov`, `h_dynamic`, `upselling`, `sms`)
  - the migration seeds the row

Bigint counts are needed because some counts reach about 15 million and must
keep room to grow. They are returned to the client as JS numbers, which stays
exact below 2^53.

Row-level security: `select` for `anon` and `authenticated` on every table. No
direct insert, update, or delete policies, and the default grants are revoked.
Writes go only through these `security definer` functions with
`set search_path = ''`. Each raises `admin access required` unless
`public.is_admin()`. Each revokes execute from `public` and `anon` and grants it
to `authenticated`.

- `save_pe_daily_report(p_report_date date, p_file_name text, p_promos jsonb, p_sms jsonb, p_upselling jsonb) returns void`
  - rejects empty arrays
  - upserts the report row, recording who uploaded it, when, and the file name
  - deletes that date's promos, SMS, and upselling rows, then inserts the new
    ones
  - if the date is new, copies `pe_daily_manual_rows` from the latest earlier
    `report_date`, if there is one
  - runs as one transaction
- `save_pe_daily_section(p_report_date date, p_section text, p_rows jsonb) returns void`
  - replaces that date's rows for one section
  - the report must exist
- `delete_pe_daily_report(p_report_date date) returns void`
  - removes the report and, by cascade, all its rows
- `save_pe_daily_chart_settings(p_visible_charts text[]) returns void`

Client-supplied values are re-checked by constraints: counts `>= 0`, the
channel and section values, and the unique keys.

`types/database.ts` gains the tables and functions.

## Admin-entered sections

Defined once in `lib/pe-daily/sections.ts`. Every consumer reads this one
definition: the tables, the editors, validation, and the fields sent to
`save_pe_daily_section`.

| Section key | Title | Fields (key: label, type) |
| --- | --- | --- |
| `tx_prov` | Promos – TX_PROV | `promo`: Promo Name (text, required); `last_week`: Last Week Count (count); `day_before`: Day Before Count (count); `yesterday`: Yesterday Count (count) |
| `actions` | Actions | `action`: Action (text, required); `status`: Status (text) |
| `offer_sheet` | Offer Sheet Tool | `promo`: Promo Name (text, required); `owner`: Owner (text); `on_gui`: On GUI (text); `utilized_business`: Utilized Business (text) |
| `data_lake` | Data Lake | `file_path`: File Path (text, required) |
| `it_cases` | IT First Line Cases | `case`: Case (text, required); `promo`: Promo Name (text); `first_line`: Is it 1st line? (text); `feedback`: Feedback (text) |
| `grafana` | Grafana | `issue`: Issue (text, required); `server`: Server (text); `feedback`: Feedback (text) |

Validation:

- Text is trimmed and at most 2,000 characters.
- "Required" means the field can't be empty.
- Count fields are whole numbers zero or greater, and may be empty, which is
  shown as "-".
- A row whose fields are all empty is dropped on save.
- Errors show inline next to the field. **Save** stays disabled until every row
  is valid.

## Page layout

1. **Header.** "PE Daily Report", with the subtitle "Promo Engine".
   - A **Report date** select listing all saved dates, newest first. It shows
     the latest by default and drives the `?date=YYYY-MM-DD` URL parameter.
   - "Uploaded {Cairo time} by {email}".
   - Admins also see:
     - **Upload**
     - **Chart settings**
     - **Delete this date**, which asks for confirmation in an in-app dialog
       using the existing `ConfirmDialog`
2. **Sections, in the deck's order.** Each section is a panel with its title
   and table. Numbers use `en-US` thousands separators. Empty tables show
   "No entries".
   - **Promos – TX_PROV.** A table, plus a grouped bar chart when it's visible.
   - **Promos – H_DYNAMIC.**
     - A table of every promo, in file order.
     - A grouped bar chart when it's visible, with a **Hide promos over 1M**
       switch. The switch is on by default. It hides promos whose yesterday
       count is at least 1,000,000, and the chart says how many it hides
       ("2 hidden").
     - The switch is per viewer and isn't saved.
   - **Actions.**
   - **Upselling Layer.** A Date and Count table, plus a 7-day line chart when
     it's visible.
   - **SMS.** A table with one Offline row and one Online row per promo, in the
     order each promo first appears in the file. The promo name shows on the
     first row only. A missing channel shows "-" in the counts. There's a
     grouped bar chart of Offline vs Online (yesterday count per promo) when
     it's visible.
   - **Offer Sheet Tool.**
   - **Data Lake.**
   - **IT First Line Cases.**
   - **Grafana.**
3. **Charts** (Recharts, loaded only on this page):
   - Grouped bars use three series, "Last week", "Day before", and
     "Yesterday", in three distinct colors.
   - Hovering a bar group shows a tooltip with the category and each series
     value with separators.
   - Clicking a legend item toggles that series for the viewer.
   - Y axes use compact labels (1.2M, 450K).
   - Charts fill their panel width. A chart with more than 15 categories
     scrolls sideways at about 48px per category and doesn't squeeze.
4. **Chart settings dialog** (admins only). Four checkboxes: TX_PROV,
   H_DYNAMIC, Upselling trend, SMS Offline vs Online. **Save** saves the choice
   for everyone.
5. **Section editing** (admins only). Each admin-entered section has an
   **Edit** button that turns its table into input rows, with a **Delete** on
   each row, **Add row**, **Save**, and **Cancel**. Saving replaces that
   section's rows for the date being viewed.

## States and errors

- **No reports at all.** "No report uploaded yet". Admins still see Upload.
- **Unknown `?date=`.** "No report for {date}", with a link to the latest
  report.
- **Load failure.** "Couldn't load the report" in an alert. The empty-state
  wording isn't shown.
- **Upload validation errors.** Listed in full in the upload dialog, with no
  way to save.
- **Save failures** (report, section, chart settings, delete). The error shows
  with **Retry**. The data on the server is unchanged, and the open editor
  keeps the admin's input.
- **Dialogs.** None of them can be closed while a save is in progress, and late
  results from a superseded attempt are ignored, as on Ops Requests.

## Code layout

- `lib/sheets/parse-sheet.ts`: the CSV and `.xlsx` readers, moved from
  `lib/ops/parse-sheet.ts`. `lib/ops/*` and its tests then import from here.
  Behavior is unchanged.
- `lib/pe-daily/types.ts`
- `lib/pe-daily/parse-report.ts`: the export → typed report, or errors
- `lib/pe-daily/sections.ts`: the definitions of the admin-entered sections,
  plus row validation
- `lib/pe-daily/format.ts`: number and compact-axis formatting, date labels,
  and the 1M filter
- `lib/pe-daily/load.ts`: server reads (dates list, one report, settings)
- `lib/pe-daily/mutations.ts`: RPC wrappers for the four functions
- `app/pe-daily-report/page.tsx`: server page with `noindex` and
  `force-dynamic`
- `components/pe-daily/`
  - `pe-daily-page.tsx`: shell, header, date select, and section order
  - `report-upload.tsx`
  - `chart-settings.tsx`
  - `data-table.tsx`
  - `manual-section.tsx`: the view and edit modes
  - `promo-bar-chart.tsx`: grouped bars for TX_PROV, H_DYNAMIC, and SMS
  - `upselling-trend-chart.tsx`
- `app/globals.css`: `pe-daily-*` styles
- `supabase/migrations/0034_pe_daily_report.sql`, plus additions to
  `types/database.ts`
- New dependencies: `recharts` (MIT) and its peer `react-is`

## Testing

- `tests/fixtures/pe-daily-report-sample.csv`: a copy of the provided export.
- **Parser tests.** The sample yields 22 Oct 2026, 29 promos, 11 SMS rows, and
  7 upselling days. They cover padded names, both date formats, an `.xlsx`
  version with real date cells, thousands separators, and each error case.
- **Section tests.** Required fields, count validation, dropping empty rows,
  and the length limit.
- **Format tests.** Compact labels, separators, and the 1M filter.
- **Component tests** (Testing Library):
  - Only admins see Upload, Edit, Chart settings, and Delete.
  - The date select changes the URL.
  - The 1M switch hides and shows promos in the chart.
  - The chart settings decide which charts render.
  - Edit, save, and cancel work for a section.
  - Upload shows the preview and errors.
  - The tooltip shows values on hover. Recharts' `ResponsiveContainer` is given
    a fixed test size.
- **Database tests** (PGlite, with Supabase default privileges modelled as in
  Ops Requests):
  - Signed-out visitors and non-admins can't write.
  - Saving a report for a new date copies the previous date's manual rows.
  - Re-saving a date replaces only that date's uploaded rows and keeps its
    manual rows.
  - Empty arrays are rejected.
  - A failed save leaves the previous data in place.
  - A section save needs an existing report.
  - Deleting a date cascades to its rows only.
  - The chart settings function validates its values.

## Deployment

- Merging to `main` deploys to Vercel production.
- `0034_pe_daily_report.sql` is run once in the Supabase SQL editor.

## Out of scope

- Comparing two dates side by side
- Editing uploaded numbers on the page (fix the export and re-upload instead)
- Exporting the dashboard back to PowerPoint or PDF
- Linking promos between sections
