# PE Daily Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `/pe-daily-report` page that replaces the daily Promo Engine PowerPoint. Admins upload the daily export (CSV or .xlsx). Six sections are admin-entered. Charts are interactive: hovering shows the values, and the legend toggles series.

**Architecture:** The browser parses the block-structured export (`REPORT_DATE` / `PROMO` / `SERVICE` / `DATE`) into a typed report. Admin-only Postgres functions save one report per date, the admin-entered section rows, chart visibility, and deletions. The server page loads the list of dates plus the chosen report. A client shell renders the deck's sections in order, using Recharts for the charts.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres + RLS + RPC), `recharts` 3 (new, MIT) with `react-is` (new, peer), `exceljs` (existing), Vitest + Testing Library + jsdom, PGlite for database tests.

**Spec:** `docs/superpowers/specs/2026-10-22-pe-daily-report-design.md`

## Global Constraints

- URL: `/pe-daily-report` only. Not in the workspace dropdown and not linked from other pages.
- Page title "PE Daily Report", subtitle "Promo Engine". Metadata `robots: { index: false, follow: false }`.
- Anyone with the link can view. Only admins, checked by `public.is_admin()` / `getAdminStatus`, see Upload, Chart settings, Delete this date, or Edit, or can call the write functions.
- Uploaded sections: H_DYNAMIC (`PROMO` block), SMS (`SERVICE` block), Upselling Layer (`DATE` / `UPSELLING_COUNT` block).
- Admin-entered sections: `tx_prov`, `actions`, `offer_sheet`, `data_lake`, `it_cases`, `grafana`, with titles and fields exactly as in the spec's table.
- One report per `report_date`. Re-uploading a date replaces only that date's uploaded rows. A new date copies the admin-entered rows from the most recent earlier report.
- Charts: keys `tx_prov`, `h_dynamic`, `upselling`, `sms`. Default visible: `tx_prov`, `h_dynamic`. Admins pick which are visible, and the choice is saved for everyone.
- The H_DYNAMIC chart has a "Hide promos over 1M" switch, on by default. It hides promos whose yesterday count is ≥ 1,000,000. It's per viewer and not saved.
- Counts are whole numbers ≥ 0. `en-US` thousands separators are used for display. Compact axis labels look like `1.2M` / `450K`.
- File types: `.csv` and `.xlsx` (first sheet). Anything else is rejected with `Upload a .csv or .xlsx file.`
- Dates: report date `DD-MM-YYYY`. Upselling day `DD-Mon-YY` (year 2000 + YY). Real `.xlsx` date cells are also accepted.
- Any parse error blocks the upload, and nothing is saved.
- Dialogs can't be closed while a save is running, and results from a superseded attempt are ignored.
- New dependencies: `recharts` and `react-is` only.
- Code style: match the surrounding code. Comments only for constraints the code can't show.

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/sheets/parse-sheet.ts` | Shared CSV / `.xlsx` readers, moved from `lib/ops/parse-sheet.ts`, plus a new `readSheetTable` |
| `lib/pe-daily/types.ts` | Report, promo, SMS, upselling, manual-row, and chart types and constants |
| `lib/pe-daily/format.ts` | Count parsing and formatting, compact labels, date labels, the 1M filter |
| `lib/pe-daily/chart-data.ts` | Chart datasets, SMS grouping, TX_PROV counts |
| `lib/pe-daily/sections.ts` | Definitions of the admin-entered sections, draft validation, display values |
| `lib/pe-daily/parse-report.ts` | Raw table → `ParsedReport` or row errors |
| `lib/pe-daily/load.ts` | Server reads for the page |
| `lib/pe-daily/mutations.ts` | RPC wrappers for the four functions |
| `supabase/migrations/0034_pe_daily_report.sql` | Tables, RLS, functions |
| `types/database.ts` | New tables and functions |
| `components/ui/use-file-upload.ts` | Shared upload state machine, also used by Ops Requests |
| `components/ui/file-picker-button.tsx` | Shared Upload button with hidden file input |
| `app/pe-daily-report/page.tsx` | Server page |
| `components/pe-daily/pe-daily-page.tsx` | Shell: header, date select, states, admin tools |
| `components/pe-daily/report-sections.tsx` | Deck sections in order |
| `components/pe-daily/section-panel.tsx` | Section panel chrome |
| `components/pe-daily/data-table.tsx` | Generic read-only table |
| `components/pe-daily/manual-section.tsx` | View and edit for an admin-entered section |
| `components/pe-daily/count-tooltip.tsx` | Chart tooltip content |
| `components/pe-daily/promo-bar-chart.tsx` | Grouped bars with a toggleable legend (TX_PROV, H_DYNAMIC, SMS) |
| `components/pe-daily/upselling-trend-chart.tsx` | 7-day line chart |
| `components/pe-daily/report-upload.tsx` | Upload dialog |
| `components/pe-daily/chart-settings.tsx` | Chart visibility dialog |
| `components/pe-daily/delete-report.tsx` | Delete date with confirmation |
| `app/globals.css` | `pe-daily-*` styles |
| `tests/fixtures/pe-daily-report-sample.csv`, `tests/fixtures/pe-daily.ts` | Fixtures |

---

### Task 1: Shared sheet readers

**Files:**
- Move: `lib/ops/parse-sheet.ts` → `lib/sheets/parse-sheet.ts`
- Move: `tests/ops-parse-sheet.test.ts` → `tests/sheets-parse-sheet.test.ts`
- Modify: `lib/ops/normalize.ts`, `components/ops/ops-upload.tsx`, `tests/ops-normalize.test.ts` (import paths)
- Modify: `lib/sheets/parse-sheet.ts` (add `readSheetTable`)

**Interfaces:**
- Produces: everything `lib/ops/parse-sheet.ts` exported (`RawRow`, `RawSheet`, `normalizeHeader`, `parseCsv`, `tableToSheet`, `formatSheetDate`, `readXlsxTable`, `parseSheetFile`), now from `@/lib/sheets/parse-sheet`, plus `readSheetTable(file: File): Promise<string[][]>`. It returns the file's raw rows, keeps blank rows, and throws `Upload a .csv or .xlsx file.` for other types.

- [ ] **Step 1: Move the files and update imports**

```bash
mkdir -p lib/sheets
git mv lib/ops/parse-sheet.ts lib/sheets/parse-sheet.ts
git mv tests/ops-parse-sheet.test.ts tests/sheets-parse-sheet.test.ts
sed -i '' 's#"@/lib/ops/parse-sheet"#"@/lib/sheets/parse-sheet"#' components/ops/ops-upload.tsx tests/ops-normalize.test.ts tests/sheets-parse-sheet.test.ts
sed -i '' 's#from "./parse-sheet"#from "@/lib/sheets/parse-sheet"#' lib/ops/normalize.ts
rg -n "parse-sheet" lib components tests app
```

Expected: every match points to `@/lib/sheets/parse-sheet`.

- [ ] **Step 2: Run the moved tests to confirm nothing broke**

Run: `npx vitest run tests/sheets-parse-sheet.test.ts tests/ops-normalize.test.ts tests/ops-upload.test.tsx`
Expected: PASS (same counts as before the move).

- [ ] **Step 3: Write the failing test for `readSheetTable`**

Append this block to the end of `tests/sheets-parse-sheet.test.ts`, and add `readSheetTable` to its existing import from `@/lib/sheets/parse-sheet`:

```ts
describe("readSheetTable", () => {
  it("returns raw CSV rows, keeping blank rows", async () => {
    const file = new File(["REPORT_DATE,,\n22-10-2026,,\n,,\nPROMO,LAST_WEEK_COUNT\n"], "report.csv");
    expect(await readSheetTable(file)).toEqual([
      ["REPORT_DATE", "", ""],
      ["22-10-2026", "", ""],
      ["", "", ""],
      ["PROMO", "LAST_WEEK_COUNT"],
    ]);
  });

  it("returns raw .xlsx rows", async () => {
    const buffer = await xlsxBuffer([["REPORT_DATE"], ["22-10-2026"]]);
    expect(await readSheetTable(new File([buffer], "report.xlsx"))).toEqual([
      ["REPORT_DATE"],
      ["22-10-2026"],
    ]);
  });

  it("rejects other file types", async () => {
    await expect(readSheetTable(new File(["x"], "report.txt"))).rejects.toThrow(
      "Upload a .csv or .xlsx file.",
    );
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/sheets-parse-sheet.test.ts`
Expected: FAIL. `readSheetTable` is not exported.

- [ ] **Step 5: Implement `readSheetTable` and reuse it in `parseSheetFile`**

In `lib/sheets/parse-sheet.ts`, replace the existing `parseSheetFile` function with:

```ts
export async function readSheetTable(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) return readXlsxTable(await file.arrayBuffer());
  throw new Error("Upload a .csv or .xlsx file.");
}

export async function parseSheetFile(file: File): Promise<RawSheet> {
  return tableToSheet(await readSheetTable(file));
}
```

- [ ] **Step 6: Run the tests and type check**

Run: `npx vitest run tests/sheets-parse-sheet.test.ts tests/ops-normalize.test.ts tests/ops-upload.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A lib/sheets lib/ops components/ops tests/sheets-parse-sheet.test.ts tests/ops-normalize.test.ts
git commit -m "refactor: share CSV and Excel readers under lib/sheets"
```

---

### Task 2: Types, formatting, and chart data

**Files:**
- Create: `lib/pe-daily/types.ts`, `lib/pe-daily/format.ts`, `lib/pe-daily/chart-data.ts`, `tests/fixtures/pe-daily.ts`
- Test: `tests/pe-daily-format.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`:
    - `CHART_KEYS`, `ChartKey`, `CHART_LABELS`, `DEFAULT_VISIBLE_CHARTS`, `isChartKey`
    - `SECTION_KEYS`, `SectionKey`, `isSectionKey`
    - `ManualFieldValue = string | number | null`, `ManualRow = Record<string, ManualFieldValue>`, `emptyManualSections(): Record<SectionKey, ManualRow[]>`
    - `PromoCounts { promo; lastWeek; dayBefore; yesterday }` (numbers), `SmsChannel`, `SmsCounts extends PromoCounts { channel }`, `UpsellingDay { day: string /* YYYY-MM-DD */; count }`
    - `ParsedReport { reportDate; promos; sms; upselling }`
    - `PeDailyReport extends ParsedReport { uploadedAt; uploadedByEmail: string | null; fileName; manual }`
    - `PeDailyPageData { dates: string[]; report: PeDailyReport | null; requestedDate: string | null; visibleCharts: ChartKey[] }`
  - `format.ts`: `parseCount(raw: string): number | null`, `formatCount(value?: number | null): string` (`"-"` when missing), `formatCompact(value: number): string`, `formatReportDate(iso): string` (`22 Oct 2026`), `formatDayLabel(iso): string` (`15 Oct`), `LARGE_PROMO_THRESHOLD`, `splitLargePromos(rows, hideLarge): { visible; hiddenCount }`
  - `chart-data.ts`: `ChartDatum`, `CountRow`, `promoChartData(rows: CountRow[])`, `txProvCounts(rows: ManualRow[]): CountRow[]`, `txProvChartData(rows: ManualRow[])`, `SmsGroup`, `groupSms(rows: SmsCounts[])`, `smsChartData(rows)`, `upsellingChartData(days)`
  - `tests/fixtures/pe-daily.ts`: `makeReport(overrides?)`, `makePageData(overrides?)`

- [ ] **Step 1: Write the types**

Create `lib/pe-daily/types.ts`:

```ts
export const CHART_KEYS = ["tx_prov", "h_dynamic", "upselling", "sms"] as const;

export type ChartKey = (typeof CHART_KEYS)[number];

export const CHART_LABELS: Record<ChartKey, string> = {
  tx_prov: "Promos – TX_PROV",
  h_dynamic: "Promos – H_DYNAMIC",
  upselling: "Upselling trend",
  sms: "SMS Offline vs Online",
};

export const DEFAULT_VISIBLE_CHARTS: readonly ChartKey[] = ["tx_prov", "h_dynamic"];

export function isChartKey(value: string): value is ChartKey {
  return (CHART_KEYS as readonly string[]).includes(value);
}

export const SECTION_KEYS = [
  "tx_prov",
  "actions",
  "offer_sheet",
  "data_lake",
  "it_cases",
  "grafana",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

export type ManualFieldValue = string | number | null;

export type ManualRow = Record<string, ManualFieldValue>;

export function emptyManualSections(): Record<SectionKey, ManualRow[]> {
  return Object.fromEntries(SECTION_KEYS.map((key) => [key, []])) as unknown as Record<
    SectionKey,
    ManualRow[]
  >;
}

export interface PromoCounts {
  promo: string;
  lastWeek: number;
  dayBefore: number;
  yesterday: number;
}

export type SmsChannel = "offline" | "online";

export interface SmsCounts extends PromoCounts {
  channel: SmsChannel;
}

// `day` and every report date are ISO calendar dates (YYYY-MM-DD).
export interface UpsellingDay {
  day: string;
  count: number;
}

export interface ParsedReport {
  reportDate: string;
  promos: PromoCounts[];
  sms: SmsCounts[];
  upselling: UpsellingDay[];
}

export interface PeDailyReport extends ParsedReport {
  uploadedAt: string;
  uploadedByEmail: string | null;
  fileName: string;
  manual: Record<SectionKey, ManualRow[]>;
}

export interface PeDailyPageData {
  dates: string[];
  report: PeDailyReport | null;
  requestedDate: string | null;
  visibleCharts: ChartKey[];
}
```

- [ ] **Step 2: Write the shared test fixture**

Create `tests/fixtures/pe-daily.ts`:

```ts
import {
  emptyManualSections,
  type PeDailyPageData,
  type PeDailyReport,
} from "@/lib/pe-daily/types";

export function makeReport(overrides: Partial<PeDailyReport> = {}): PeDailyReport {
  return {
    reportDate: "2026-10-22",
    uploadedAt: "2026-10-22T07:45:00Z",
    uploadedByEmail: "admin@example.com",
    fileName: "daily report.csv",
    promos: [
      { promo: "loyalty", lastWeek: 7, dayBefore: 5, yesterday: 14 },
      { promo: "orange-coins", lastWeek: 273901, dayBefore: 270548, yesterday: 272015 },
      { promo: "charges-platform", lastWeek: 1959859, dayBefore: 2041804, yesterday: 2024695 },
      { promo: "revive", lastWeek: 7603289, dayBefore: 8471845, yesterday: 8823587 },
    ],
    sms: [
      { channel: "offline", promo: "revive", lastWeek: 13952684, dayBefore: 14335238, yesterday: 14795483 },
      { channel: "online", promo: "opportunity", lastWeek: 3444720, dayBefore: 3574499, yesterday: 3061708 },
      { channel: "online", promo: "revive", lastWeek: 154752, dayBefore: 163307, yesterday: 130766 },
    ],
    upselling: [
      { day: "2026-10-20", count: 13661474 },
      { day: "2026-10-21", count: 13625673 },
    ],
    manual: {
      ...emptyManualSections(),
      tx_prov: [{ promo: "go-2", last_week: 408, day_before: 0, yesterday: 0 }],
      actions: [{ action: "Restart provisioning job", status: "Done" }],
    },
    ...overrides,
  };
}

export function makePageData(overrides: Partial<PeDailyPageData> = {}): PeDailyPageData {
  return {
    dates: ["2026-10-22", "2026-10-21"],
    report: makeReport(),
    requestedDate: null,
    visibleCharts: ["tx_prov", "h_dynamic"],
    ...overrides,
  };
}
```

- [ ] **Step 3: Write the failing tests**

Create `tests/pe-daily-format.test.ts`:

```ts
// @vitest-environment node

import {
  groupSms,
  promoChartData,
  smsChartData,
  txProvChartData,
  upsellingChartData,
} from "@/lib/pe-daily/chart-data";
import {
  formatCompact,
  formatCount,
  formatDayLabel,
  formatReportDate,
  parseCount,
  splitLargePromos,
} from "@/lib/pe-daily/format";
import { emptyManualSections, isChartKey, isSectionKey } from "@/lib/pe-daily/types";
import { makeReport } from "./fixtures/pe-daily";

describe("counts", () => {
  it.each([
    ["0", 0],
    ["1234", 1234],
    ["1,234", 1234],
    ["13,310,531", 13310531],
    [" 42 ", 42],
  ])("parses %s", (raw, expected) => {
    expect(parseCount(raw)).toBe(expected);
  });

  it.each(["", "-1", "1.5", "12,34", "1,2345", "abc", "99999999999999999999"])(
    "rejects %s",
    (raw) => {
      expect(parseCount(raw)).toBeNull();
    },
  );

  it("formats counts with separators and a dash when missing", () => {
    expect(formatCount(8823587)).toBe("8,823,587");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("-");
    expect(formatCount(undefined)).toBe("-");
  });

  it("formats compact axis labels", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(450000)).toBe("450K");
    expect(formatCompact(1234567)).toBe("1.2M");
    expect(formatCompact(8823587)).toBe("8.8M");
  });
});

describe("dates", () => {
  it("formats report dates and day labels", () => {
    expect(formatReportDate("2026-10-22")).toBe("22 Oct 2026");
    expect(formatDayLabel("2026-10-15")).toBe("15 Oct");
  });
});

describe("splitLargePromos", () => {
  const rows = makeReport().promos;

  it("hides promos with yesterday counts of 1M or more", () => {
    const { visible, hiddenCount } = splitLargePromos(rows, true);
    expect(visible.map((row) => row.promo)).toEqual(["loyalty", "orange-coins"]);
    expect(hiddenCount).toBe(2);
  });

  it("keeps every promo when the switch is off", () => {
    expect(splitLargePromos(rows, false)).toEqual({ visible: rows, hiddenCount: 0 });
  });

  it("treats a missing yesterday count as small", () => {
    expect(splitLargePromos([{ yesterday: null }], true).hiddenCount).toBe(0);
  });
});

describe("chart data", () => {
  const report = makeReport();

  it("builds grouped promo bars", () => {
    expect(promoChartData(report.promos.slice(0, 1))).toEqual([
      { category: "loyalty", lastWeek: 7, dayBefore: 5, yesterday: 14 },
    ]);
  });

  it("builds TX_PROV bars from admin rows, with blanks as null", () => {
    expect(txProvChartData([
      { promo: "go-2", last_week: 408, day_before: 0, yesterday: null },
    ])).toEqual([{ category: "go-2", lastWeek: 408, dayBefore: 0, yesterday: null }]);
  });

  it("groups SMS rows by promo in first-appearance order", () => {
    expect(groupSms(report.sms).map((group) => [
      group.promo,
      group.offline?.yesterday ?? null,
      group.online?.yesterday ?? null,
    ])).toEqual([
      ["revive", 14795483, 130766],
      ["opportunity", null, 3061708],
    ]);
    expect(smsChartData(report.sms)).toEqual([
      { category: "revive", offline: 14795483, online: 130766 },
      { category: "opportunity", offline: null, online: 3061708 },
    ]);
  });

  it("labels upselling days", () => {
    expect(upsellingChartData(report.upselling)).toEqual([
      { category: "20 Oct", count: 13661474 },
      { category: "21 Oct", count: 13625673 },
    ]);
  });
});

describe("type guards", () => {
  it("recognizes chart and section keys", () => {
    expect(isChartKey("sms")).toBe(true);
    expect(isChartKey("pie")).toBe(false);
    expect(isSectionKey("grafana")).toBe(true);
    expect(isSectionKey("notes")).toBe(false);
    expect(Object.keys(emptyManualSections())).toEqual([
      "tx_prov",
      "actions",
      "offer_sheet",
      "data_lake",
      "it_cases",
      "grafana",
    ]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/pe-daily-format.test.ts`
Expected: FAIL. `@/lib/pe-daily/chart-data` can't be resolved.

- [ ] **Step 5: Write `format.ts`**

Create `lib/pe-daily/format.ts`:

```ts
const COUNT_PATTERN = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const LARGE_PROMO_THRESHOLD = 1_000_000;

const countFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function parseCount(raw: string): number | null {
  const value = raw.trim();
  if (!COUNT_PATTERN.test(value)) return null;
  const count = Number(value.replace(/,/g, ""));
  return Number.isSafeInteger(count) ? count : null;
}

export function formatCount(value?: number | null): string {
  return value === null || value === undefined ? "-" : countFormatter.format(value);
}

export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function formatReportDate(iso: string): string {
  const { year, month, day } = dateParts(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatDayLabel(iso: string): string {
  const { month, day } = dateParts(iso);
  return `${day} ${MONTHS[month - 1]}`;
}

export function splitLargePromos<T extends { yesterday: number | null }>(
  rows: T[],
  hideLarge: boolean,
): { visible: T[]; hiddenCount: number } {
  if (!hideLarge) return { visible: rows, hiddenCount: 0 };
  const visible = rows.filter((row) => (row.yesterday ?? 0) < LARGE_PROMO_THRESHOLD);
  return { visible, hiddenCount: rows.length - visible.length };
}
```

- [ ] **Step 6: Write `chart-data.ts`**

Create `lib/pe-daily/chart-data.ts`:

```ts
import { formatDayLabel } from "./format";
import type { ManualFieldValue, ManualRow, SmsCounts, UpsellingDay } from "./types";

export type ChartDatum = { category: string } & Record<string, string | number | null>;

export interface CountRow {
  promo: string;
  lastWeek: number | null;
  dayBefore: number | null;
  yesterday: number | null;
}

export interface SmsGroup {
  promo: string;
  offline: SmsCounts | null;
  online: SmsCounts | null;
}

function asCount(value: ManualFieldValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

export function promoChartData(rows: CountRow[]): ChartDatum[] {
  return rows.map((row) => ({
    category: row.promo,
    lastWeek: row.lastWeek,
    dayBefore: row.dayBefore,
    yesterday: row.yesterday,
  }));
}

export function txProvCounts(rows: ManualRow[]): CountRow[] {
  return rows.map((row) => ({
    promo: typeof row.promo === "string" ? row.promo : "",
    lastWeek: asCount(row.last_week),
    dayBefore: asCount(row.day_before),
    yesterday: asCount(row.yesterday),
  }));
}

export function txProvChartData(rows: ManualRow[]): ChartDatum[] {
  return promoChartData(txProvCounts(rows));
}

export function groupSms(rows: SmsCounts[]): SmsGroup[] {
  const groups = new Map<string, SmsGroup>();
  rows.forEach((row) => {
    const group = groups.get(row.promo) ?? { promo: row.promo, offline: null, online: null };
    group[row.channel] = row;
    groups.set(row.promo, group);
  });
  return [...groups.values()];
}

export function smsChartData(rows: SmsCounts[]): ChartDatum[] {
  return groupSms(rows).map((group) => ({
    category: group.promo,
    offline: group.offline?.yesterday ?? null,
    online: group.online?.yesterday ?? null,
  }));
}

export function upsellingChartData(days: UpsellingDay[]): ChartDatum[] {
  return days.map((entry) => ({ category: formatDayLabel(entry.day), count: entry.count }));
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/pe-daily-format.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. If `formatCompact(450000)` returns `"450K"` with a different space character on this Node ICU, keep the formatter and compare with `.replace(/\s/g, "")` in that one assertion.

- [ ] **Step 8: Commit**

```bash
git add lib/pe-daily tests/fixtures/pe-daily.ts tests/pe-daily-format.test.ts
git commit -m "feat(pe-daily): add report types, formatting, and chart data"
```

---

### Task 3: Admin-entered section definitions and validation

**Files:**
- Create: `lib/pe-daily/sections.ts`
- Test: `tests/pe-daily-sections.test.ts`

**Interfaces:**
- Consumes: `parseCount`, `formatCount` (Task 2); `ManualFieldValue`, `ManualRow`, `SectionKey`, `SECTION_KEYS` (Task 2)
- Produces:
  - `FieldType = "text" | "count"`, `SectionField { key; label; type; required? }`, `SectionDefinition { key; title; fields }`
  - `SECTIONS: Record<SectionKey, SectionDefinition>`
  - `MAX_TEXT_LENGTH = 2000`
  - `DraftRow = Record<string, string>`
  - `DraftValidation { rows: ManualRow[]; errors: Array<Record<string, string>>; valid: boolean }`
  - `validateDraftRows(section, drafts): DraftValidation`
  - `toDraftRow(section, row: ManualRow): DraftRow`
  - `emptyDraftRow(section): DraftRow`
  - `displayManualValue(field, value?: ManualFieldValue): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/pe-daily-sections.test.ts`:

```ts
// @vitest-environment node

import {
  displayManualValue,
  emptyDraftRow,
  MAX_TEXT_LENGTH,
  SECTIONS,
  toDraftRow,
  validateDraftRows,
} from "@/lib/pe-daily/sections";
import { SECTION_KEYS } from "@/lib/pe-daily/types";

describe("SECTIONS", () => {
  it("defines every admin-entered section with the deck's columns", () => {
    expect(SECTION_KEYS.map((key) => [SECTIONS[key].title, SECTIONS[key].fields.map((f) => f.label)])).toEqual([
      ["Promos – TX_PROV", ["Promo Name", "Last Week Count", "Day Before Count", "Yesterday Count"]],
      ["Actions", ["Action", "Status"]],
      ["Offer Sheet Tool", ["Promo Name", "Owner", "On GUI", "Utilized Business"]],
      ["Data Lake", ["File Path"]],
      ["IT First Line Cases", ["Case", "Promo Name", "Is it 1st line?", "Feedback"]],
      ["Grafana", ["Issue", "Server", "Feedback"]],
    ]);
    expect(SECTION_KEYS.map((key) => SECTIONS[key].fields.filter((f) => f.required).map((f) => f.key))).toEqual([
      ["promo"],
      ["action"],
      ["promo"],
      ["file_path"],
      ["case"],
      ["issue"],
    ]);
  });
});

describe("validateDraftRows", () => {
  it("trims text, parses counts, and drops fully empty rows", () => {
    const result = validateDraftRows(SECTIONS.tx_prov, [
      { promo: " go-2 ", last_week: "1,408", day_before: "0", yesterday: "" },
      { promo: "", last_week: " ", day_before: "", yesterday: "" },
    ]);
    expect(result).toEqual({
      rows: [{ promo: "go-2", last_week: 1408, day_before: 0, yesterday: null }],
      errors: [{}, {}],
      valid: true,
    });
  });

  it("reports required fields, bad counts, and long text per row", () => {
    const result = validateDraftRows(SECTIONS.tx_prov, [
      { promo: "", last_week: "12a", day_before: "-1", yesterday: "3" },
      { promo: "x".repeat(MAX_TEXT_LENGTH + 1), last_week: "", day_before: "", yesterday: "" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { promo: "Required.", last_week: "Enter a whole number.", day_before: "Enter a whole number." },
      { promo: "Must be 2,000 characters or fewer." },
    ]);
  });

  it("treats a missing draft key as empty", () => {
    expect(validateDraftRows(SECTIONS.actions, [{ action: "Restart" }]).rows).toEqual([
      { action: "Restart", status: "" },
    ]);
  });
});

describe("drafts and display", () => {
  it("round-trips stored rows into editable drafts", () => {
    expect(toDraftRow(SECTIONS.tx_prov, { promo: "go-2", last_week: 408, day_before: null })).toEqual({
      promo: "go-2",
      last_week: "408",
      day_before: "",
      yesterday: "",
    });
    expect(emptyDraftRow(SECTIONS.grafana)).toEqual({ issue: "", server: "", feedback: "" });
  });

  it("displays counts with separators and blanks appropriately", () => {
    const [promo, lastWeek] = SECTIONS.tx_prov.fields;
    expect(displayManualValue(lastWeek, 1408)).toBe("1,408");
    expect(displayManualValue(lastWeek, null)).toBe("-");
    expect(displayManualValue(promo, "go-2")).toBe("go-2");
    expect(displayManualValue(promo, undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/pe-daily-sections.test.ts`
Expected: FAIL. `@/lib/pe-daily/sections` can't be resolved.

- [ ] **Step 3: Write the implementation**

Create `lib/pe-daily/sections.ts`:

```ts
import { formatCount, parseCount } from "./format";
import type { ManualFieldValue, ManualRow, SectionKey } from "./types";

export type FieldType = "text" | "count";

export interface SectionField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

export interface SectionDefinition {
  key: SectionKey;
  title: string;
  fields: SectionField[];
}

export type DraftRow = Record<string, string>;

export interface DraftValidation {
  rows: ManualRow[];
  errors: Array<Record<string, string>>;
  valid: boolean;
}

export const MAX_TEXT_LENGTH = 2000;

const text = (key: string, label: string, required = false): SectionField => ({
  key,
  label,
  type: "text",
  required,
});

const count = (key: string, label: string): SectionField => ({ key, label, type: "count" });

export const SECTIONS: Record<SectionKey, SectionDefinition> = {
  tx_prov: {
    key: "tx_prov",
    title: "Promos – TX_PROV",
    fields: [
      text("promo", "Promo Name", true),
      count("last_week", "Last Week Count"),
      count("day_before", "Day Before Count"),
      count("yesterday", "Yesterday Count"),
    ],
  },
  actions: {
    key: "actions",
    title: "Actions",
    fields: [text("action", "Action", true), text("status", "Status")],
  },
  offer_sheet: {
    key: "offer_sheet",
    title: "Offer Sheet Tool",
    fields: [
      text("promo", "Promo Name", true),
      text("owner", "Owner"),
      text("on_gui", "On GUI"),
      text("utilized_business", "Utilized Business"),
    ],
  },
  data_lake: {
    key: "data_lake",
    title: "Data Lake",
    fields: [text("file_path", "File Path", true)],
  },
  it_cases: {
    key: "it_cases",
    title: "IT First Line Cases",
    fields: [
      text("case", "Case", true),
      text("promo", "Promo Name"),
      text("first_line", "Is it 1st line?"),
      text("feedback", "Feedback"),
    ],
  },
  grafana: {
    key: "grafana",
    title: "Grafana",
    fields: [text("issue", "Issue", true), text("server", "Server"), text("feedback", "Feedback")],
  },
};

function draftValue(draft: DraftRow, field: SectionField): string {
  return (draft[field.key] ?? "").trim();
}

export function validateDraftRows(section: SectionDefinition, drafts: DraftRow[]): DraftValidation {
  const rows: ManualRow[] = [];
  const errors = drafts.map((draft) => {
    const rowErrors: Record<string, string> = {};
    if (section.fields.every((field) => draftValue(draft, field) === "")) return rowErrors;

    const row: ManualRow = {};
    for (const field of section.fields) {
      const value = draftValue(draft, field);
      if (field.type === "count") {
        if (!value) {
          row[field.key] = null;
        } else {
          const parsed = parseCount(value);
          if (parsed === null) rowErrors[field.key] = "Enter a whole number.";
          else row[field.key] = parsed;
        }
        continue;
      }
      if (field.required && !value) {
        rowErrors[field.key] = "Required.";
      } else if (value.length > MAX_TEXT_LENGTH) {
        rowErrors[field.key] = `Must be ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters or fewer.`;
      }
      row[field.key] = value;
    }
    if (!Object.keys(rowErrors).length) rows.push(row);
    return rowErrors;
  });
  return { rows, errors, valid: errors.every((rowErrors) => !Object.keys(rowErrors).length) };
}

export function toDraftRow(section: SectionDefinition, row: ManualRow): DraftRow {
  return Object.fromEntries(
    section.fields.map((field) => {
      const value = row[field.key];
      return [field.key, value === null || value === undefined ? "" : String(value)];
    }),
  );
}

export function emptyDraftRow(section: SectionDefinition): DraftRow {
  return Object.fromEntries(section.fields.map((field) => [field.key, ""]));
}

export function displayManualValue(field: SectionField, value?: ManualFieldValue): string {
  if (field.type === "count") return formatCount(typeof value === "number" ? value : null);
  if (value === null || value === undefined) return "";
  return String(value);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/pe-daily-sections.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/pe-daily/sections.ts tests/pe-daily-sections.test.ts
git commit -m "feat(pe-daily): define admin-entered sections and row validation"
```

---

### Task 4: Report parser

**Files:**
- Create: `lib/pe-daily/parse-report.ts`, `tests/fixtures/pe-daily-report-sample.csv`
- Test: `tests/pe-daily-parse-report.test.ts`

**Interfaces:**
- Consumes: `readSheetTable` (Task 1), `parseCount` (Task 2), the `ParsedReport` / `PromoCounts` / `SmsCounts` / `SmsChannel` / `UpsellingDay` types (Task 2)
- Produces:
  - `ReportError { rowNumber: number | null; message: string }`
  - `ParseReportResult = { ok: true; report: ParsedReport } | { ok: false; errors: ReportError[] }`
  - `parseReportDate(value): string | null`
  - `parseUpsellingDay(value): string | null`
  - `parseReportTable(table: string[][]): ParseReportResult`
  - `parseReportFile(file: File): Promise<ParseReportResult>`, which throws `Upload a .csv or .xlsx file.` for unsupported files

- [ ] **Step 1: Copy the sample export**

```bash
cp "/Users/pov/Downloads/daily report.csv" tests/fixtures/pe-daily-report-sample.csv
```

- [ ] **Step 2: Write the failing tests**

Create `tests/pe-daily-parse-report.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import {
  parseReportDate,
  parseReportFile,
  parseReportTable,
  parseUpsellingDay,
} from "@/lib/pe-daily/parse-report";
import { parseCsv } from "@/lib/sheets/parse-sheet";

const sample = readFileSync(resolve(import.meta.dirname, "fixtures/pe-daily-report-sample.csv"));
const table = (lines: string[]) => parseCsv(lines.join("\n"));

describe("dates", () => {
  it.each([
    ["22-10-2026", "2026-10-22"],
    ["1-2-2026", "2026-02-01"],
    ["10/22/2026 0:00", "2026-10-22"],
  ])("reads report date %s", (input, expected) => {
    expect(parseReportDate(input)).toBe(expected);
  });

  it.each(["31-02-2026", "2026-10-22", "22/10/2026", "", "22-10-26"])("rejects report date %s", (input) => {
    expect(parseReportDate(input)).toBeNull();
  });

  it.each([
    ["15-Oct-26", "2026-10-15"],
    ["5-oct-26", "2026-10-05"],
    ["10/21/2026 0:00", "2026-10-21"],
  ])("reads upselling day %s", (input, expected) => {
    expect(parseUpsellingDay(input)).toBe(expected);
  });

  it.each(["32-Oct-26", "15-Okt-26", "15-10-26", ""])("rejects upselling day %s", (input) => {
    expect(parseUpsellingDay(input)).toBeNull();
  });
});

describe("parseReportTable", () => {
  it("reads the sample export", async () => {
    const result = await parseReportFile(new File([sample], "daily report.csv"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { report } = result;
    expect(report.reportDate).toBe("2026-10-22");
    expect(report.promos).toHaveLength(29);
    expect(report.promos[0]).toEqual({ promo: "shop-internet-gifts", lastWeek: 0, dayBefore: 0, yesterday: 1 });
    expect(report.promos.at(-1)).toEqual({ promo: "revive", lastWeek: 7603289, dayBefore: 8471845, yesterday: 8823587 });
    expect(report.sms).toHaveLength(11);
    expect(report.sms[0]).toEqual({
      channel: "offline",
      promo: "charges-platform",
      lastWeek: 3066693,
      dayBefore: 3080900,
      yesterday: 3033645,
    });
    expect(report.sms.at(-1)).toEqual({
      channel: "online",
      promo: "revive",
      lastWeek: 154752,
      dayBefore: 163307,
      yesterday: 130766,
    });
    expect(report.upselling).toHaveLength(7);
    expect(report.upselling[0]).toEqual({ day: "2026-10-15", count: 13310531 });
    expect(report.upselling.at(-1)).toEqual({ day: "2026-10-21", count: 13625673 });
  });

  it("accepts thousands separators, any-case headers, and quoted cells", () => {
    const result = parseReportTable(table([
      "report_date",
      "22-10-2026",
      'promo,last_week_count,day_before_count,yesterday_count',
      'revive,"1,234",0,5',
      "service,LAST_WEEK_COUNT,DAY_BEFORE_COUNT,YESTERDAY_COUNT",
      "online_Revive,1,2,3",
      "date,UPSELLING_COUNT",
      "15-Oct-26,\"13,310,531\"",
    ]));
    expect(result).toEqual({
      ok: true,
      report: {
        reportDate: "2026-10-22",
        promos: [{ promo: "revive", lastWeek: 1234, dayBefore: 0, yesterday: 5 }],
        sms: [{ channel: "online", promo: "Revive", lastWeek: 1, dayBefore: 2, yesterday: 3 }],
        upselling: [{ day: "2026-10-15", count: 13310531 }],
      },
    });
  });

  it("lists every row problem with its row number", () => {
    const result = parseReportTable(table([
      "REPORT_DATE,,,",
      "31-02-2026,,,",
      "PROMO,LAST_WEEK_COUNT,DAY_BEFORE_COUNT,YESTERDAY_COUNT",
      "a,1,2,x",
      "a,1,2,3",
      ",1,2,3",
      ",,,",
      "SERVICE,LAST_WEEK_COUNT,DAY_BEFORE_COUNT,YESTERDAY_COUNT",
      "SMS_x,1,2,3",
      "OFFLINE_a,1,,3",
      ",,,",
      "DATE,UPSELLING_COUNT,,",
      "32-Oct-26,5,,",
      "15-Oct-26,,,",
      "15-Oct-26,7,,",
    ]));
    expect(result).toEqual({
      ok: false,
      errors: [
        { rowNumber: 2, message: 'Unrecognized report date "31-02-2026". Use DD-MM-YYYY, for example 22-10-2026.' },
        { rowNumber: 4, message: 'Unrecognized count "x" in YESTERDAY_COUNT. Use a whole number.' },
        { rowNumber: 5, message: 'Duplicate promo "a".' },
        { rowNumber: 6, message: "Promo name is required." },
        { rowNumber: 9, message: 'Service "SMS_x" must start with OFFLINE_ or ONLINE_.' },
        { rowNumber: 10, message: "DAY_BEFORE_COUNT is required." },
        { rowNumber: 13, message: 'Unrecognized date "32-Oct-26". Use DD-Mon-YY, for example 15-Oct-26.' },
        { rowNumber: 14, message: "UPSELLING_COUNT is required." },
        { rowNumber: 15, message: 'Duplicate date "15-Oct-26".' },
      ],
    });
  });

  it("reports structural problems and missing blocks", () => {
    const result = parseReportTable(table([
      "PROMO,LAST_WEEK_COUNT,DAY_BEFORE_COUNT",
      "",
      "NOTES,hi",
      "PROMO,LAST_WEEK_COUNT,DAY_BEFORE_COUNT,YESTERDAY_COUNT",
      "x,1,2,3",
    ]));
    expect(result).toEqual({
      ok: false,
      errors: [
        { rowNumber: 1, message: "The PROMO header must be followed by LAST_WEEK_COUNT, DAY_BEFORE_COUNT, YESTERDAY_COUNT." },
        { rowNumber: 1, message: "The PROMO block has no rows." },
        { rowNumber: 3, message: 'Unexpected row "NOTES". Expected REPORT_DATE, PROMO, SERVICE, or DATE.' },
        { rowNumber: 4, message: "The PROMO block appears more than once." },
        { rowNumber: null, message: "The file has no REPORT_DATE." },
        { rowNumber: null, message: "The file has no SERVICE block." },
        { rowNumber: null, message: "The file has no DATE block." },
      ],
    });
  });

  it("does not swallow a header that follows REPORT_DATE without a date", () => {
    const result = parseReportTable(table([
      "REPORT_DATE",
      "PROMO,LAST_WEEK_COUNT,DAY_BEFORE_COUNT,YESTERDAY_COUNT",
      "x,1,2,3",
      "SERVICE,LAST_WEEK_COUNT,DAY_BEFORE_COUNT,YESTERDAY_COUNT",
      "ONLINE_x,1,2,3",
      "DATE,UPSELLING_COUNT",
      "15-Oct-26,1",
    ]));
    expect(result).toEqual({
      ok: false,
      errors: [{ rowNumber: 1, message: "REPORT_DATE has no date below it." }],
    });
  });

  it("reads an .xlsx file with real date cells", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Report");
    [
      ["REPORT_DATE"],
      [new Date(Date.UTC(2026, 9, 22))],
      ["PROMO", "LAST_WEEK_COUNT", "DAY_BEFORE_COUNT", "YESTERDAY_COUNT"],
      ["revive", 1, 2, 3],
      ["SERVICE", "LAST_WEEK_COUNT", "DAY_BEFORE_COUNT", "YESTERDAY_COUNT"],
      ["ONLINE_revive", 4, 5, 6],
      ["DATE", "UPSELLING_COUNT"],
      [new Date(Date.UTC(2026, 9, 21)), 13625673],
    ].forEach((row) => sheet.addRow(row));
    const buffer = new Uint8Array(await workbook.xlsx.writeBuffer()).slice().buffer;
    expect(await parseReportFile(new File([buffer], "report.xlsx"))).toEqual({
      ok: true,
      report: {
        reportDate: "2026-10-22",
        promos: [{ promo: "revive", lastWeek: 1, dayBefore: 2, yesterday: 3 }],
        sms: [{ channel: "online", promo: "revive", lastWeek: 4, dayBefore: 5, yesterday: 6 }],
        upselling: [{ day: "2026-10-21", count: 13625673 }],
      },
    });
  });

  it("rejects unsupported files", async () => {
    await expect(parseReportFile(new File(["x"], "report.pptx"))).rejects.toThrow(
      "Upload a .csv or .xlsx file.",
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/pe-daily-parse-report.test.ts`
Expected: FAIL. `@/lib/pe-daily/parse-report` can't be resolved.

- [ ] **Step 4: Write the parser**

Create `lib/pe-daily/parse-report.ts`:

```ts
import { readSheetTable } from "@/lib/sheets/parse-sheet";
import { parseCount } from "./format";
import type { ParsedReport, PromoCounts, SmsChannel, SmsCounts, UpsellingDay } from "./types";

export interface ReportError {
  rowNumber: number | null;
  message: string;
}

export type ParseReportResult =
  | { ok: true; report: ParsedReport }
  | { ok: false; errors: ReportError[] };

type BlockKind = "promo" | "service" | "date";

interface TableRow {
  rowNumber: number;
  cells: string[];
}

const BLOCK_KINDS: BlockKind[] = ["promo", "service", "date"];
const BLOCK_NAMES: Record<BlockKind, string> = { promo: "PROMO", service: "SERVICE", date: "DATE" };
const COUNT_COLUMNS = ["LAST_WEEK_COUNT", "DAY_BEFORE_COUNT", "YESTERDAY_COUNT"];
const BLOCK_COLUMNS: Record<BlockKind, string[]> = {
  promo: COUNT_COLUMNS,
  service: COUNT_COLUMNS,
  date: ["UPSELLING_COUNT"],
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SHEET_CELL_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2})?$/;

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

// `.xlsx` date cells arrive as M/D/YYYY H:MM text from the shared sheet reader.
function sheetCellDate(value: string): string | null {
  const match = value.match(SHEET_CELL_DATE);
  return match ? isoDate(Number(match[3]), Number(match[1]), Number(match[2])) : null;
}

export function parseReportDate(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  return sheetCellDate(trimmed);
}

export function parseUpsellingDay(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (match) {
    const month = MONTHS.indexOf(match[2].toLowerCase()) + 1;
    return month ? isoDate(2000 + Number(match[3]), month, Number(match[1])) : null;
  }
  return sheetCellDate(trimmed);
}

function isBlank(row: TableRow) {
  return row.cells.every((cell) => cell === "");
}

function headerKind(firstCell: string): BlockKind | "report_date" | null {
  switch (firstCell.toUpperCase()) {
    case "REPORT_DATE":
      return "report_date";
    case "PROMO":
      return "promo";
    case "SERVICE":
      return "service";
    case "DATE":
      return "date";
    default:
      return null;
  }
}

export function parseReportTable(table: string[][]): ParseReportResult {
  const rows: TableRow[] = table.map((cells, index) => ({
    rowNumber: index + 1,
    cells: cells.map((cell) => cell.trim()),
  }));
  const errors: ReportError[] = [];
  const fail = (rowNumber: number | null, message: string) => {
    errors.push({ rowNumber, message });
  };

  let reportDate: string | null = null;
  let sawReportDate = false;
  const seenBlocks = new Set<BlockKind>();
  const promos: PromoCounts[] = [];
  const sms: SmsCounts[] = [];
  const upselling: UpsellingDay[] = [];
  const seenPromos = new Set<string>();
  const seenServices = new Set<string>();
  const seenDays = new Set<string>();

  const readCounts = (row: TableRow, columns: string[]): number[] | null => {
    const counts: number[] = [];
    let valid = true;
    columns.forEach((column, offset) => {
      const raw = row.cells[offset + 1] ?? "";
      if (!raw) {
        fail(row.rowNumber, `${column} is required.`);
        valid = false;
        return;
      }
      const parsed = parseCount(raw);
      if (parsed === null) {
        fail(row.rowNumber, `Unrecognized count "${raw}" in ${column}. Use a whole number.`);
        valid = false;
        return;
      }
      counts.push(parsed);
    });
    return valid ? counts : null;
  };

  const readPromo = (row: TableRow) => {
    const promo = row.cells[0];
    if (!promo) {
      fail(row.rowNumber, "Promo name is required.");
      return;
    }
    if (seenPromos.has(promo)) {
      fail(row.rowNumber, `Duplicate promo "${promo}".`);
      return;
    }
    seenPromos.add(promo);
    const counts = readCounts(row, COUNT_COLUMNS);
    if (counts) promos.push({ promo, lastWeek: counts[0], dayBefore: counts[1], yesterday: counts[2] });
  };

  const readService = (row: TableRow) => {
    const raw = row.cells[0];
    const match = raw.match(/^(offline|online)_(.+)$/i);
    if (!match) {
      fail(row.rowNumber, `Service "${raw}" must start with OFFLINE_ or ONLINE_.`);
      return;
    }
    const channel = match[1].toLowerCase() as SmsChannel;
    const promo = match[2];
    const key = `${channel}:${promo}`;
    if (seenServices.has(key)) {
      fail(row.rowNumber, `Duplicate service "${raw}".`);
      return;
    }
    seenServices.add(key);
    const counts = readCounts(row, COUNT_COLUMNS);
    if (counts) {
      sms.push({ channel, promo, lastWeek: counts[0], dayBefore: counts[1], yesterday: counts[2] });
    }
  };

  const readUpselling = (row: TableRow) => {
    const raw = row.cells[0];
    const day = parseUpsellingDay(raw);
    if (!day) {
      fail(row.rowNumber, `Unrecognized date "${raw}". Use DD-Mon-YY, for example 15-Oct-26.`);
      return;
    }
    if (seenDays.has(day)) {
      fail(row.rowNumber, `Duplicate date "${raw}".`);
      return;
    }
    seenDays.add(day);
    const counts = readCounts(row, BLOCK_COLUMNS.date);
    if (counts) upselling.push({ day, count: counts[0] });
  };

  const readers: Record<BlockKind, (row: TableRow) => void> = {
    promo: readPromo,
    service: readService,
    date: readUpselling,
  };

  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (isBlank(row)) {
      index += 1;
      continue;
    }

    const kind = headerKind(row.cells[0]);
    if (kind === "report_date") {
      if (sawReportDate) fail(row.rowNumber, "REPORT_DATE appears more than once.");
      sawReportDate = true;
      let next = index + 1;
      while (next < rows.length && isBlank(rows[next])) next += 1;
      const valueRow = rows[next];
      if (!valueRow || headerKind(valueRow.cells[0]) !== null) {
        fail(row.rowNumber, "REPORT_DATE has no date below it.");
        index = next;
        continue;
      }
      const parsed = parseReportDate(valueRow.cells[0]);
      if (parsed) {
        reportDate = parsed;
      } else {
        fail(
          valueRow.rowNumber,
          `Unrecognized report date "${valueRow.cells[0]}". Use DD-MM-YYYY, for example 22-10-2026.`,
        );
      }
      index = next + 1;
      continue;
    }

    if (kind === null) {
      fail(
        row.rowNumber,
        `Unexpected row "${row.cells[0]}". Expected REPORT_DATE, PROMO, SERVICE, or DATE.`,
      );
      index += 1;
      continue;
    }

    const name = BLOCK_NAMES[kind];
    if (seenBlocks.has(kind)) fail(row.rowNumber, `The ${name} block appears more than once.`);
    seenBlocks.add(kind);
    const columns = BLOCK_COLUMNS[kind];
    if (columns.some((column, offset) => (row.cells[offset + 1] ?? "").toUpperCase() !== column)) {
      fail(row.rowNumber, `The ${name} header must be followed by ${columns.join(", ")}.`);
    }

    let body = index + 1;
    let bodyCount = 0;
    while (body < rows.length && !isBlank(rows[body]) && headerKind(rows[body].cells[0]) === null) {
      readers[kind](rows[body]);
      bodyCount += 1;
      body += 1;
    }
    if (!bodyCount) fail(row.rowNumber, `The ${name} block has no rows.`);
    index = body;
  }

  if (!sawReportDate) fail(null, "The file has no REPORT_DATE.");
  BLOCK_KINDS.forEach((kind) => {
    if (!seenBlocks.has(kind)) fail(null, `The file has no ${BLOCK_NAMES[kind]} block.`);
  });

  if (errors.length || !reportDate) return { ok: false, errors };
  return { ok: true, report: { reportDate, promos, sms, upselling } };
}

export async function parseReportFile(file: File): Promise<ParseReportResult> {
  return parseReportTable(await readSheetTable(file));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/pe-daily-parse-report.test.ts && npx tsc --noEmit && npx eslint lib/pe-daily tests/pe-daily-parse-report.test.ts`
Expected: PASS, no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add lib/pe-daily/parse-report.ts tests/fixtures/pe-daily-report-sample.csv tests/pe-daily-parse-report.test.ts
git commit -m "feat(pe-daily): parse the daily report export"
```

---

### Task 5: Database migration, types, and database test

**Files:**
- Create: `supabase/migrations/0034_pe_daily_report.sql`
- Modify: `types/database.ts`, `package.json` (scripts)
- Test: `tests/pe-daily-database.test.ts`

**Interfaces:**
- Consumes: `public.is_admin()`, `public.admin_users`, and `auth.users` (migrations 0001/0002)
- Produces:
  - Tables:
    - `pe_daily_reports(report_date, uploaded_at, uploaded_by, uploaded_by_email, file_name)`
    - `pe_daily_promos(report_date, position, promo, last_week, day_before, yesterday)`
    - `pe_daily_sms(... + channel)`
    - `pe_daily_upselling(report_date, position, day, count)`
    - `pe_daily_manual_rows(report_date, section, position, fields)`
    - `pe_daily_settings(id, visible_charts)`
  - RPCs:
    - `save_pe_daily_report(p_report_date date, p_file_name text, p_promos jsonb, p_sms jsonb, p_upselling jsonb)`. Promo elements `{promo,last_week,day_before,yesterday}`; SMS elements add `channel`; upselling elements `{day,count}`.
    - `save_pe_daily_section(p_report_date date, p_section text, p_rows jsonb)`
    - `delete_pe_daily_report(p_report_date date)`
    - `save_pe_daily_chart_settings(p_visible_charts text[])`
  - The matching entries in `Database["public"]["Tables" | "Functions"]`

- [ ] **Step 1: Write the failing database test**

Create `tests/pe-daily-database.test.ts`:

```ts
// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

const promos = (names: string[]) =>
  names.map((promo, index) => ({ promo, last_week: index, day_before: index + 1, yesterday: index + 2 }));
const sms = [{ promo: "revive", channel: "online", last_week: 1, day_before: 2, yesterday: 3 }];
const upselling = [{ day: "2026-10-21", count: 13625673 }];

async function setIdentity(db: PGlite, role: "anon" | "authenticated", id?: string) {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${id ?? ""}', true); set local role ${role};`,
  );
}

async function saveReport(
  db: PGlite,
  date: string,
  options: { promos?: unknown; sms?: unknown; upselling?: unknown } = {},
) {
  return db.query(
    "select public.save_pe_daily_report($1::date, $2, $3::jsonb, $4::jsonb, $5::jsonb)",
    [
      date,
      `${date}.csv`,
      JSON.stringify(options.promos ?? promos(["loyalty", "revive"])),
      JSON.stringify(options.sms ?? sms),
      JSON.stringify(options.upselling ?? upselling),
    ],
  );
}

async function saveSection(db: PGlite, date: string, section: string, rows: unknown[]) {
  return db.query("select public.save_pe_daily_section($1::date, $2, $3::jsonb)", [
    date,
    section,
    JSON.stringify(rows),
  ]);
}

async function expectError(db: PGlite, run: () => Promise<unknown>, message: RegExp) {
  await db.exec("savepoint expected_error");
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  await db.exec("rollback to savepoint expected_error");
  await db.exec("release savepoint expected_error");
  expect(String(error)).toMatch(message);
}

async function column<T>(db: PGlite, sql: string, params: unknown[] = []) {
  const result = await db.query<{ value: T }>(sql, params);
  return result.rows.map((row) => row.value);
}

describe("pe daily report database", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable set search_path = ''
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create publication supabase_realtime;
    `);
    await db.exec(read("supabase/migrations/0001_core_schema.sql"));
    await db.exec(read("supabase/migrations/0002_security_audit_realtime.sql"));
    await db.exec(`
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    `);
    await db.exec(read("supabase/migrations/0034_pe_daily_report.sql"));
    await db.exec(`
      insert into auth.users (id) values ('${ADMIN_ID}'), ('${USER_ID}');
      insert into public.admin_users (auth_user_id, email, display_name)
      values ('${ADMIN_ID}', 'admin@example.com', 'Admin');
    `);
  });

  beforeEach(async () => {
    await db.exec("begin");
  });

  afterEach(async () => {
    await db.exec("rollback");
  });

  afterAll(async () => {
    await db.close();
  });

  it("lets anonymous visitors read the default chart settings but not write", async () => {
    await setIdentity(db, "anon");
    expect(await column<string[]>(db, "select visible_charts as value from public.pe_daily_settings"))
      .toEqual([["tx_prov", "h_dynamic"]]);
    await expectError(
      db,
      () => db.exec("insert into public.pe_daily_reports (report_date, file_name) values ('2026-10-22', 'x')"),
      /permission denied/i,
    );
    await expectError(db, () => saveReport(db, "2026-10-22"), /permission denied/i);
    await expectError(
      db,
      () => db.query("select public.save_pe_daily_chart_settings(array['sms']::text[])"),
      /permission denied/i,
    );
  });

  it("rejects every write function for signed-in non-admins", async () => {
    await setIdentity(db, "authenticated", USER_ID);
    await expectError(db, () => saveReport(db, "2026-10-22"), /admin access required/i);
    await expectError(db, () => saveSection(db, "2026-10-22", "actions", []), /admin access required/i);
    await expectError(
      db,
      () => db.query("select public.delete_pe_daily_report('2026-10-22'::date)"),
      /admin access required/i,
    );
    await expectError(
      db,
      () => db.query("select public.save_pe_daily_chart_settings(array['sms']::text[])"),
      /admin access required/i,
    );
  });

  it("saves a report, copies admin rows forward, and re-uploads without touching admin rows", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await saveReport(db, "2026-10-21");
    await saveSection(db, "2026-10-21", "actions", [{ action: "Restart", status: "Done" }]);
    await saveSection(db, "2026-10-21", "tx_prov", [{ promo: "go-2", last_week: 408, day_before: 0, yesterday: 0 }]);

    await saveReport(db, "2026-10-22");
    expect(await column<unknown>(
      db,
      "select fields as value from public.pe_daily_manual_rows where report_date = '2026-10-22' order by section, position",
    )).toEqual([
      { action: "Restart", status: "Done" },
      { promo: "go-2", last_week: 408, day_before: 0, yesterday: 0 },
    ]);

    await saveSection(db, "2026-10-22", "actions", [{ action: "Check Grafana", status: "" }]);
    await saveReport(db, "2026-10-22", { promos: promos(["gamification"]) });

    expect(await column<string>(
      db,
      "select promo as value from public.pe_daily_promos where report_date = '2026-10-22' order by position",
    )).toEqual(["gamification"]);
    expect(await column<unknown>(
      db,
      "select fields->>'action' as value from public.pe_daily_manual_rows where report_date = '2026-10-22' and section = 'actions'",
    )).toEqual(["Check Grafana"]);
    expect(await column<string>(
      db,
      "select fields->>'action' as value from public.pe_daily_manual_rows where report_date = '2026-10-21' and section = 'actions'",
    )).toEqual(["Restart"]);
    expect(await column<string>(
      db,
      "select uploaded_by_email || ' ' || file_name as value from public.pe_daily_reports where report_date = '2026-10-22'",
    )).toEqual(["admin@example.com 2026-10-22.csv"]);
  });

  it("stores rows in file order and keeps positions", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await saveReport(db, "2026-10-22", { promos: promos(["b", "a", "c"]) });
    expect(await column<string>(
      db,
      "select promo || ':' || position as value from public.pe_daily_promos order by position",
    )).toEqual(["b:0", "a:1", "c:2"]);
  });

  it("rejects bad payloads and keeps the previous data", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await saveReport(db, "2026-10-22");

    await expectError(db, () => saveReport(db, "2026-10-22", { promos: [] }), /must not be empty/i);
    await expectError(db, () => saveReport(db, "2026-10-22", { sms: {} }), /JSON arrays/i);
    await expectError(
      db,
      () => saveReport(db, "2026-10-22", { promos: promos(["dup", "dup"]) }),
      /duplicate key/i,
    );
    await expectError(
      db,
      () => saveReport(db, "2026-10-22", { sms: [{ ...sms[0], channel: "fax" }] }),
      /check constraint/i,
    );
    await expectError(
      db,
      () => saveReport(db, "2026-10-22", { upselling: [{ day: "2026-10-21", count: -1 }] }),
      /check constraint/i,
    );

    expect(await column<string>(
      db,
      "select promo as value from public.pe_daily_promos where report_date = '2026-10-22' order by position",
    )).toEqual(["loyalty", "revive"]);
  });

  it("requires an existing report and a known section to save a section", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await expectError(db, () => saveSection(db, "2026-10-22", "actions", []), /report does not exist/i);
    await saveReport(db, "2026-10-22");
    await expectError(db, () => saveSection(db, "2026-10-22", "notes", []), /unknown section/i);
    await saveSection(db, "2026-10-22", "grafana", [{ issue: "CPU" }]);
    await saveSection(db, "2026-10-22", "grafana", []);
    expect(await column<number>(
      db,
      "select count(*)::int as value from public.pe_daily_manual_rows where section = 'grafana'",
    )).toEqual([0]);
  });

  it("deletes only the chosen date", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await saveReport(db, "2026-10-21");
    await saveReport(db, "2026-10-22");
    await saveSection(db, "2026-10-22", "actions", [{ action: "Restart" }]);

    await db.query("select public.delete_pe_daily_report('2026-10-22'::date)");
    expect(await column<string>(db, "select report_date::text as value from public.pe_daily_reports"))
      .toEqual(["2026-10-21"]);
    expect(await column<number>(
      db,
      "select count(*)::int as value from public.pe_daily_promos where report_date = '2026-10-22'",
    )).toEqual([0]);
    expect(await column<number>(
      db,
      "select count(*)::int as value from public.pe_daily_manual_rows where report_date = '2026-10-22'",
    )).toEqual([0]);
    await expectError(
      db,
      () => db.query("select public.delete_pe_daily_report('2026-10-22'::date)"),
      /report does not exist/i,
    );
  });

  it("validates and saves chart settings", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await db.query("select public.save_pe_daily_chart_settings(array['sms', 'upselling']::text[])");
    expect(await column<string[]>(db, "select visible_charts as value from public.pe_daily_settings"))
      .toEqual([["sms", "upselling"]]);
    await expectError(
      db,
      () => db.query("select public.save_pe_daily_chart_settings(array['pie']::text[])"),
      /check constraint/i,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pe-daily-database.test.ts`
Expected: FAIL with `ENOENT ... 0034_pe_daily_report.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0034_pe_daily_report.sql`:

```sql
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/pe-daily-database.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add the database types**

In `types/database.ts`, insert this block inside `Tables: {`, immediately before the line `      statuses: {`:

```ts
      pe_daily_manual_rows: {
        Row: { fields: Json; position: number; report_date: string; section: string };
        Insert: { fields: Json; position: number; report_date: string; section: string };
        Update: { fields?: Json; position?: number; report_date?: string; section?: string };
        Relationships: [];
      };
      pe_daily_promos: {
        Row: {
          day_before: number;
          last_week: number;
          position: number;
          promo: string;
          report_date: string;
          yesterday: number;
        };
        Insert: {
          day_before: number;
          last_week: number;
          position: number;
          promo: string;
          report_date: string;
          yesterday: number;
        };
        Update: {
          day_before?: number;
          last_week?: number;
          position?: number;
          promo?: string;
          report_date?: string;
          yesterday?: number;
        };
        Relationships: [];
      };
      pe_daily_reports: {
        Row: {
          file_name: string;
          report_date: string;
          uploaded_at: string;
          uploaded_by: string | null;
          uploaded_by_email: string | null;
        };
        Insert: {
          file_name: string;
          report_date: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_email?: string | null;
        };
        Update: {
          file_name?: string;
          report_date?: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_email?: string | null;
        };
        Relationships: [];
      };
      pe_daily_settings: {
        Row: { id: boolean; visible_charts: string[] };
        Insert: { id?: boolean; visible_charts?: string[] };
        Update: { id?: boolean; visible_charts?: string[] };
        Relationships: [];
      };
      pe_daily_sms: {
        Row: {
          channel: string;
          day_before: number;
          last_week: number;
          position: number;
          promo: string;
          report_date: string;
          yesterday: number;
        };
        Insert: {
          channel: string;
          day_before: number;
          last_week: number;
          position: number;
          promo: string;
          report_date: string;
          yesterday: number;
        };
        Update: {
          channel?: string;
          day_before?: number;
          last_week?: number;
          position?: number;
          promo?: string;
          report_date?: string;
          yesterday?: number;
        };
        Relationships: [];
      };
      pe_daily_upselling: {
        Row: { count: number; day: string; position: number; report_date: string };
        Insert: { count: number; day: string; position: number; report_date: string };
        Update: { count?: number; day?: string; position?: number; report_date?: string };
        Relationships: [];
      };
```

In the same file, inside `Functions: {`, insert these lines immediately after the line beginning `      replace_ops_requests:`:

```ts
      delete_pe_daily_report: { Args: { p_report_date: string }; Returns: undefined };
      save_pe_daily_chart_settings: { Args: { p_visible_charts: string[] }; Returns: undefined };
      save_pe_daily_report: {
        Args: {
          p_file_name: string;
          p_promos: Json;
          p_report_date: string;
          p_sms: Json;
          p_upselling: Json;
        };
        Returns: undefined;
      };
      save_pe_daily_section: {
        Args: { p_report_date: string; p_rows: Json; p_section: string };
        Returns: undefined;
      };
```

- [ ] **Step 6: Register the database test in the npm scripts**

In `package.json`:
- Append ` --exclude tests/pe-daily-database.test.ts` to the end of the `test:unit` command string.
- Append ` tests/pe-daily-database.test.ts` to the end of the `test:database` command string.

- [ ] **Step 7: Verify types and the database suite**

Run: `npx tsc --noEmit && npm run test:database`
Expected:
- No type errors.
- All database tests pass, except the 2 known baseline failures in `tests/security-audit-realtime.test.ts` (expects 12 workspaces / 54 statuses, finds 13 / 60). Those failures predate this work and are out of scope.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0034_pe_daily_report.sql types/database.ts package.json tests/pe-daily-database.test.ts
git commit -m "feat(pe-daily): add report tables, admin functions, and RLS"
```

---

### Task 6: Loading and the write calls

**Files:**
- Create: `lib/pe-daily/load.ts`, `lib/pe-daily/mutations.ts`
- Test: `tests/pe-daily-load-mutations.test.ts`

**Interfaces:**
- Consumes: `Database`, `Tables`, `Json` (Task 5); `DEFAULT_VISIBLE_CHARTS`, `emptyManualSections`, `isChartKey`, `isSectionKey`, and the types (Task 2)
- Produces:
  - `emptyPageData(requestedDate: string | null): PeDailyPageData`
  - `loadPeDailyPage(client: SupabaseClient<Database> | null, requestedDate: string | null): Promise<PeDailyPageData>`, which throws `Could not load the PE Daily Report: …`
  - `toReportPayload(report: ParsedReport)`
  - `savePeDailyReport(supabase, fileName, report: ParsedReport): Promise<void>`
  - `savePeDailySection(supabase, reportDate, section: SectionKey, rows: ManualRow[]): Promise<void>`
  - `deletePeDailyReport(supabase, reportDate): Promise<void>`
  - `savePeDailyChartSettings(supabase, visibleCharts: ChartKey[]): Promise<void>`
  - All write calls throw `Only admins can change the PE Daily Report.` for `admin access required`, otherwise `<Action> failed: <message>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/pe-daily-load-mutations.test.ts`:

```ts
// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyPageData, loadPeDailyPage } from "@/lib/pe-daily/load";
import {
  deletePeDailyReport,
  savePeDailyChartSettings,
  savePeDailyReport,
  savePeDailySection,
} from "@/lib/pe-daily/mutations";
import type { Database } from "@/types/database";
import { makeReport } from "./fixtures/pe-daily";

type TableResult = { list?: unknown[]; single?: unknown; error?: { message: string } };

function fakeClient(tables: Record<string, TableResult>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      const result = tables[table] ?? {};
      const error = result.error ?? null;
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "order", "eq"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.maybeSingle = () => Promise.resolve({ data: result.single ?? null, error });
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: result.list ?? [], error }).then(resolve, reject);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

const fullTables = (): Record<string, TableResult> => ({
  pe_daily_reports: {
    list: [{ report_date: "2026-10-22" }, { report_date: "2026-10-21" }],
    single: {
      report_date: "2026-10-22",
      uploaded_at: "2026-10-22T07:45:00+00:00",
      uploaded_by: "admin",
      uploaded_by_email: "admin@example.com",
      file_name: "daily report.csv",
    },
  },
  pe_daily_settings: { single: { id: true, visible_charts: ["sms", "bogus", "tx_prov"] } },
  pe_daily_promos: {
    list: [{ report_date: "2026-10-22", position: 0, promo: "revive", last_week: 1, day_before: 2, yesterday: 3 }],
  },
  pe_daily_sms: {
    list: [{ report_date: "2026-10-22", position: 0, promo: "revive", channel: "online", last_week: 4, day_before: 5, yesterday: 6 }],
  },
  pe_daily_upselling: { list: [{ report_date: "2026-10-22", position: 0, day: "2026-10-21", count: 7 }] },
  pe_daily_manual_rows: {
    list: [
      { report_date: "2026-10-22", section: "actions", position: 0, fields: { action: "Restart", status: "Done" } },
      { report_date: "2026-10-22", section: "notes", position: 0, fields: { note: "skip me" } },
      { report_date: "2026-10-22", section: "grafana", position: 0, fields: ["not", "an", "object"] },
    ],
  },
});

describe("loadPeDailyPage", () => {
  it("returns empty data without a Supabase client", async () => {
    expect(await loadPeDailyPage(null, "2026-10-22")).toEqual(emptyPageData("2026-10-22"));
    expect(emptyPageData(null)).toEqual({
      dates: [],
      report: null,
      requestedDate: null,
      visibleCharts: ["tx_prov", "h_dynamic"],
    });
  });

  it("loads the latest report by default and maps every section", async () => {
    const { client, calls } = fakeClient(fullTables());
    const data = await loadPeDailyPage(client, null);
    expect(data.dates).toEqual(["2026-10-22", "2026-10-21"]);
    expect(data.visibleCharts).toEqual(["sms", "tx_prov"]);
    expect(data.report).toMatchObject({
      reportDate: "2026-10-22",
      uploadedAt: "2026-10-22T07:45:00+00:00",
      uploadedByEmail: "admin@example.com",
      fileName: "daily report.csv",
      promos: [{ promo: "revive", lastWeek: 1, dayBefore: 2, yesterday: 3 }],
      sms: [{ promo: "revive", channel: "online", lastWeek: 4, dayBefore: 5, yesterday: 6 }],
      upselling: [{ day: "2026-10-21", count: 7 }],
    });
    expect(data.report?.manual.actions).toEqual([{ action: "Restart", status: "Done" }]);
    expect(data.report?.manual.grafana).toEqual([]);
    expect(calls.filter((call) => call.method === "eq").map((call) => call.args))
      .toEqual(Array(5).fill(["report_date", "2026-10-22"]));
  });

  it("loads a requested earlier date and skips unknown dates", async () => {
    const known = fakeClient(fullTables());
    await loadPeDailyPage(known.client, "2026-10-21");
    expect(known.calls.find((call) => call.method === "eq")?.args).toEqual(["report_date", "2026-10-21"]);

    const unknown = fakeClient(fullTables());
    const data = await loadPeDailyPage(unknown.client, "2026-01-01");
    expect(data.report).toBeNull();
    expect(data.requestedDate).toBe("2026-01-01");
    expect(unknown.calls.some((call) => call.table === "pe_daily_promos")).toBe(false);
  });

  it("falls back to the default charts when settings are missing", async () => {
    const tables = fullTables();
    tables.pe_daily_settings = { single: null };
    const data = await loadPeDailyPage(fakeClient(tables).client, null);
    expect(data.visibleCharts).toEqual(["tx_prov", "h_dynamic"]);
  });

  it("throws a readable error when a query fails", async () => {
    const tables = fullTables();
    tables.pe_daily_sms = { error: { message: "boom" } };
    await expect(loadPeDailyPage(fakeClient(tables).client, null))
      .rejects.toThrow("Could not load the PE Daily Report: boom");
  });
});

describe("write calls", () => {
  const rpcClient = (result: { error: { message: string } | null }) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, ...result });
    return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
  };

  it("sends the parsed report as snake_case arrays", async () => {
    const { rpc, client } = rpcClient({ error: null });
    const report = makeReport();
    await savePeDailyReport(client, "daily report.csv", report);
    expect(rpc).toHaveBeenCalledWith("save_pe_daily_report", {
      p_report_date: "2026-10-22",
      p_file_name: "daily report.csv",
      p_promos: report.promos.map((row) => ({
        promo: row.promo,
        last_week: row.lastWeek,
        day_before: row.dayBefore,
        yesterday: row.yesterday,
      })),
      p_sms: report.sms.map((row) => ({
        promo: row.promo,
        channel: row.channel,
        last_week: row.lastWeek,
        day_before: row.dayBefore,
        yesterday: row.yesterday,
      })),
      p_upselling: [
        { day: "2026-10-20", count: 13661474 },
        { day: "2026-10-21", count: 13625673 },
      ],
    });
  });

  it("calls the section, delete, and chart settings functions", async () => {
    const { rpc, client } = rpcClient({ error: null });
    await savePeDailySection(client, "2026-10-22", "actions", [{ action: "Restart", status: "" }]);
    await deletePeDailyReport(client, "2026-10-22");
    await savePeDailyChartSettings(client, ["tx_prov", "sms"]);
    expect(rpc.mock.calls).toEqual([
      ["save_pe_daily_section", {
        p_report_date: "2026-10-22",
        p_section: "actions",
        p_rows: [{ action: "Restart", status: "" }],
      }],
      ["delete_pe_daily_report", { p_report_date: "2026-10-22" }],
      ["save_pe_daily_chart_settings", { p_visible_charts: ["tx_prov", "sms"] }],
    ]);
  });

  it("explains permission and other failures", async () => {
    const denied = rpcClient({ error: { message: "admin access required" } });
    await expect(deletePeDailyReport(denied.client, "2026-10-22"))
      .rejects.toThrow("Only admins can change the PE Daily Report.");
    const broken = rpcClient({ error: { message: "timeout" } });
    await expect(savePeDailyReport(broken.client, "a.csv", makeReport()))
      .rejects.toThrow("Saving the report failed: timeout");
    await expect(savePeDailySection(broken.client, "2026-10-22", "grafana", []))
      .rejects.toThrow("Saving the section failed: timeout");
    await expect(savePeDailyChartSettings(broken.client, []))
      .rejects.toThrow("Saving chart settings failed: timeout");
    await expect(deletePeDailyReport(broken.client, "2026-10-22"))
      .rejects.toThrow("Deleting the report failed: timeout");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/pe-daily-load-mutations.test.ts`
Expected: FAIL. `@/lib/pe-daily/load` can't be resolved.

- [ ] **Step 3: Write the loader**

Create `lib/pe-daily/load.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  DEFAULT_VISIBLE_CHARTS,
  emptyManualSections,
  isChartKey,
  isSectionKey,
  type ChartKey,
  type ManualRow,
  type PeDailyPageData,
  type PeDailyReport,
  type SmsChannel,
} from "./types";

type PeClient = SupabaseClient<Database>;

function loadFailure(message: string): never {
  throw new Error(`Could not load the PE Daily Report: ${message}`);
}

function isManualRow(value: unknown): value is ManualRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptyPageData(requestedDate: string | null): PeDailyPageData {
  return { dates: [], report: null, requestedDate, visibleCharts: [...DEFAULT_VISIBLE_CHARTS] };
}

async function loadDates(client: PeClient): Promise<string[]> {
  const { data, error } = await client
    .from("pe_daily_reports")
    .select("report_date")
    .order("report_date", { ascending: false });
  if (error) loadFailure(error.message);
  return (data ?? []).map((row) => row.report_date);
}

async function loadVisibleCharts(client: PeClient): Promise<ChartKey[]> {
  const { data, error } = await client.from("pe_daily_settings").select("visible_charts").maybeSingle();
  if (error) loadFailure(error.message);
  return data ? data.visible_charts.filter(isChartKey) : [...DEFAULT_VISIBLE_CHARTS];
}

async function loadReport(client: PeClient, reportDate: string): Promise<PeDailyReport | null> {
  const [report, promos, sms, upselling, manual] = await Promise.all([
    client.from("pe_daily_reports").select("*").eq("report_date", reportDate).maybeSingle(),
    client.from("pe_daily_promos").select("*").eq("report_date", reportDate).order("position"),
    client.from("pe_daily_sms").select("*").eq("report_date", reportDate).order("position"),
    client.from("pe_daily_upselling").select("*").eq("report_date", reportDate).order("position"),
    client
      .from("pe_daily_manual_rows")
      .select("*")
      .eq("report_date", reportDate)
      .order("section")
      .order("position"),
  ]);
  for (const result of [report, promos, sms, upselling, manual]) {
    if (result.error) loadFailure(result.error.message);
  }
  if (!report.data) return null;

  const manualSections = emptyManualSections();
  for (const row of manual.data ?? []) {
    if (isSectionKey(row.section) && isManualRow(row.fields)) {
      manualSections[row.section].push(row.fields);
    }
  }

  return {
    reportDate: report.data.report_date,
    uploadedAt: report.data.uploaded_at,
    uploadedByEmail: report.data.uploaded_by_email,
    fileName: report.data.file_name,
    promos: (promos.data ?? []).map((row) => ({
      promo: row.promo,
      lastWeek: row.last_week,
      dayBefore: row.day_before,
      yesterday: row.yesterday,
    })),
    sms: (sms.data ?? []).map((row) => ({
      promo: row.promo,
      channel: row.channel as SmsChannel,
      lastWeek: row.last_week,
      dayBefore: row.day_before,
      yesterday: row.yesterday,
    })),
    upselling: (upselling.data ?? []).map((row) => ({ day: row.day, count: row.count })),
    manual: manualSections,
  };
}

export async function loadPeDailyPage(
  client: PeClient | null,
  requestedDate: string | null,
): Promise<PeDailyPageData> {
  if (!client) return emptyPageData(requestedDate);
  const [dates, visibleCharts] = await Promise.all([loadDates(client), loadVisibleCharts(client)]);
  const target = requestedDate ?? dates[0] ?? null;
  const report = target && dates.includes(target) ? await loadReport(client, target) : null;
  return { dates, report, requestedDate, visibleCharts };
}
```

- [ ] **Step 4: Write the write calls**

Create `lib/pe-daily/mutations.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  ChartKey,
  ManualRow,
  ParsedReport,
  PromoCounts,
  SectionKey,
  SmsChannel,
} from "./types";

type PeClient = SupabaseClient<Database>;

type PromoPayload = { promo: string; last_week: number; day_before: number; yesterday: number };
type SmsPayload = PromoPayload & { channel: SmsChannel };
type UpsellingPayload = { day: string; count: number };

function failure(action: string, message: string): never {
  throw new Error(
    /admin access required/i.test(message)
      ? "Only admins can change the PE Daily Report."
      : `${action} failed: ${message}`,
  );
}

function toPromoPayload(row: PromoCounts): PromoPayload {
  return {
    promo: row.promo,
    last_week: row.lastWeek,
    day_before: row.dayBefore,
    yesterday: row.yesterday,
  };
}

export function toReportPayload(report: ParsedReport): {
  p_report_date: string;
  p_promos: PromoPayload[];
  p_sms: SmsPayload[];
  p_upselling: UpsellingPayload[];
} {
  return {
    p_report_date: report.reportDate,
    p_promos: report.promos.map(toPromoPayload),
    p_sms: report.sms.map((row) => ({ ...toPromoPayload(row), channel: row.channel })),
    p_upselling: report.upselling.map((entry) => ({ day: entry.day, count: entry.count })),
  };
}

export async function savePeDailyReport(
  supabase: PeClient,
  fileName: string,
  report: ParsedReport,
): Promise<void> {
  const { error } = await supabase.rpc("save_pe_daily_report", {
    ...toReportPayload(report),
    p_file_name: fileName,
  });
  if (error) failure("Saving the report", error.message);
}

export async function savePeDailySection(
  supabase: PeClient,
  reportDate: string,
  section: SectionKey,
  rows: ManualRow[],
): Promise<void> {
  const { error } = await supabase.rpc("save_pe_daily_section", {
    p_report_date: reportDate,
    p_section: section,
    p_rows: rows,
  });
  if (error) failure("Saving the section", error.message);
}

export async function deletePeDailyReport(supabase: PeClient, reportDate: string): Promise<void> {
  const { error } = await supabase.rpc("delete_pe_daily_report", { p_report_date: reportDate });
  if (error) failure("Deleting the report", error.message);
}

export async function savePeDailyChartSettings(
  supabase: PeClient,
  visibleCharts: ChartKey[],
): Promise<void> {
  const { error } = await supabase.rpc("save_pe_daily_chart_settings", {
    p_visible_charts: visibleCharts,
  });
  if (error) failure("Saving chart settings", error.message);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/pe-daily-load-mutations.test.ts && npx tsc --noEmit && npx eslint lib/pe-daily tests/pe-daily-load-mutations.test.ts`
Expected: PASS, no type or lint errors. Key order inside the `toHaveBeenCalledWith` object doesn't matter.

- [ ] **Step 6: Commit**

```bash
git add lib/pe-daily/load.ts lib/pe-daily/mutations.ts tests/pe-daily-load-mutations.test.ts
git commit -m "feat(pe-daily): load reports and call the admin write functions"
```

---

### Task 7: Interactive charts

**Files:**
- Modify: `package.json`, `package-lock.json` (add `recharts`, `react-is`)
- Modify: `tests/setup.ts` (ResizeObserver stub for jsdom)
- Create: `components/pe-daily/count-tooltip.tsx`, `components/pe-daily/promo-bar-chart.tsx`, `components/pe-daily/upselling-trend-chart.tsx`
- Test: `tests/pe-daily-charts.test.tsx`

**Interfaces:**
- Consumes: `ChartDatum` (Task 2), `formatCount`, `formatCompact` (Task 2)
- Produces:
  - `CountTooltip({ active?, payload?, label? })`
  - `ChartSeries { key; label; color }`, `PERIOD_SERIES`, `CHANNEL_SERIES`
  - `SeriesLegend({ series, hidden, onToggle })`
  - `PromoBarChart({ label, data, series, height? })`, which renders `<figure aria-label={label}>` with legend toggle buttons (`aria-pressed`) and a horizontally scrolling canvas of `data.length * 48`px when there are more than 15 categories
  - `UpsellingTrendChart({ data, height? })`, which renders `<figure aria-label="Upselling trend">`

The component tests check the tooltip content and the legend directly. jsdom has no layout, so Recharts' own mouse hit-testing can't be driven reliably in tests; the tooltip is wired through `<Tooltip content={<CountTooltip />} />`.

- [ ] **Step 1: Install the chart library**

```bash
npm install recharts@^3.10.1 react-is@^19
```

Expected: `package.json` dependencies include `recharts` and `react-is`.

- [ ] **Step 2: Add a ResizeObserver stub for jsdom tests**

Replace the contents of `tests/setup.ts` with:

```ts
import "@testing-library/jest-dom/vitest";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
```

- [ ] **Step 3: Write the failing tests**

Create `tests/pe-daily-charts.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountTooltip } from "@/components/pe-daily/count-tooltip";
import {
  CHANNEL_SERIES,
  PERIOD_SERIES,
  PromoBarChart,
} from "@/components/pe-daily/promo-bar-chart";
import { UpsellingTrendChart } from "@/components/pe-daily/upselling-trend-chart";
import { promoChartData, upsellingChartData } from "@/lib/pe-daily/chart-data";
import { makeReport } from "./fixtures/pe-daily";

const report = makeReport();

describe("CountTooltip", () => {
  it("shows the category and every series value with separators", () => {
    render(
      <CountTooltip
        active
        label="revive"
        payload={[
          { dataKey: "lastWeek", name: "Last week", value: 7603289, color: "#111" },
          { dataKey: "dayBefore", name: "Day before", value: 8471845, color: "#222" },
          { dataKey: "yesterday", name: "Yesterday", value: null, color: "#333" },
        ]}
      />,
    );
    expect(screen.getByText("revive")).toBeInTheDocument();
    expect(screen.getByText("7,603,289")).toBeInTheDocument();
    expect(screen.getByText("8,471,845")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Yesterday: -");
  });

  it("renders nothing when inactive", () => {
    const { container } = render(<CountTooltip active={false} label="x" payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PromoBarChart", () => {
  it("renders a labelled chart with a toggleable legend", async () => {
    const user = userEvent.setup();
    render(
      <PromoBarChart label="Promos – H_DYNAMIC chart" data={promoChartData(report.promos)} series={PERIOD_SERIES} />,
    );
    const figure = screen.getByRole("figure", { name: "Promos – H_DYNAMIC chart" });
    const yesterday = screen.getByRole("button", { name: "Yesterday" });
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Last week",
      "Day before",
      "Yesterday",
    ]);
    expect(yesterday).toHaveAttribute("aria-pressed", "true");

    await user.click(yesterday);
    expect(yesterday).toHaveAttribute("aria-pressed", "false");
    await user.click(yesterday);
    expect(yesterday).toHaveAttribute("aria-pressed", "true");
    expect(figure.querySelector(".pe-daily-chart-canvas")).toHaveStyle({ height: "340px" });
  });

  it("scrolls sideways when there are more than 15 categories", () => {
    const many = Array.from({ length: 29 }, (_, index) => ({
      category: `promo-${index}`,
      offline: index,
      online: index,
    }));
    const { container, rerender } = render(
      <PromoBarChart label="SMS chart" data={many} series={CHANNEL_SERIES} />,
    );
    expect(container.querySelector(".pe-daily-chart-canvas")).toHaveStyle({ minWidth: "1392px" });
    rerender(<PromoBarChart label="SMS chart" data={many.slice(0, 15)} series={CHANNEL_SERIES} />);
    expect((container.querySelector(".pe-daily-chart-canvas") as HTMLElement).style.minWidth).toBe("");
  });
});

describe("UpsellingTrendChart", () => {
  it("renders a labelled line chart", () => {
    render(<UpsellingTrendChart data={upsellingChartData(report.upselling)} />);
    expect(screen.getByRole("figure", { name: "Upselling trend" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/pe-daily-charts.test.tsx`
Expected: FAIL. `@/components/pe-daily/count-tooltip` can't be resolved.

- [ ] **Step 5: Write the tooltip**

Create `components/pe-daily/count-tooltip.tsx`:

```tsx
import { formatCount } from "@/lib/pe-daily/format";

interface TooltipEntry {
  dataKey?: unknown;
  name?: string | number;
  value?: unknown;
  color?: string;
}

export function CountTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pe-daily-tooltip">
      <p className="pe-daily-tooltip-title">{label}</p>
      <ul>
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)}>
            <span
              className="pe-daily-tooltip-swatch"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            {entry.name}:{" "}
            <strong>{typeof entry.value === "number" ? formatCount(entry.value) : "-"}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Write the bar chart**

Create `components/pe-daily/promo-bar-chart.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDatum } from "@/lib/pe-daily/chart-data";
import { formatCompact } from "@/lib/pe-daily/format";
import { CountTooltip } from "./count-tooltip";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export const PERIOD_SERIES: ChartSeries[] = [
  { key: "lastWeek", label: "Last week", color: "#9aa5b1" },
  { key: "dayBefore", label: "Day before", color: "#f2a65a" },
  { key: "yesterday", label: "Yesterday", color: "#e56f18" },
];

export const CHANNEL_SERIES: ChartSeries[] = [
  { key: "offline", label: "Offline", color: "#6b7a8f" },
  { key: "online", label: "Online", color: "#e56f18" },
];

const SCROLL_AFTER = 15;
const CATEGORY_WIDTH = 48;
const INITIAL_WIDTH = 720;

export function SeriesLegend({
  series,
  hidden,
  onToggle,
}: {
  series: ChartSeries[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="pe-daily-legend" role="group" aria-label="Chart series">
      {series.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className="pe-daily-legend-item"
          aria-pressed={!hidden.has(entry.key)}
          onClick={() => onToggle(entry.key)}
        >
          <span
            className="pe-daily-legend-swatch"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          {entry.label}
        </button>
      ))}
    </div>
  );
}

export function PromoBarChart({
  label,
  data,
  series,
  height = 340,
}: {
  label: string;
  data: ChartDatum[];
  series: ChartSeries[];
  height?: number;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const minWidth = data.length > SCROLL_AFTER ? data.length * CATEGORY_WIDTH : undefined;

  return (
    <figure className="pe-daily-chart" aria-label={label}>
      <SeriesLegend series={series} hidden={hidden} onToggle={toggle} />
      <div className="pe-daily-chart-scroll">
        <div className="pe-daily-chart-canvas" style={{ minWidth, height }}>
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: minWidth ?? INITIAL_WIDTH, height }}
          >
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="category"
                interval={0}
                angle={-35}
                textAnchor="end"
                height={90}
                tick={{ fontSize: 11 }}
              />
              <YAxis tickFormatter={(value: number) => formatCompact(value)} width={56} tick={{ fontSize: 11 }} />
              <Tooltip content={<CountTooltip />} cursor={{ fill: "rgba(229, 111, 24, 0.08)" }} />
              {series.map((entry) => (
                <Bar
                  key={entry.key}
                  dataKey={entry.key}
                  name={entry.label}
                  fill={entry.color}
                  hide={hidden.has(entry.key)}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
}
```

- [ ] **Step 7: Write the trend chart**

Create `components/pe-daily/upselling-trend-chart.tsx`:

```tsx
"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDatum } from "@/lib/pe-daily/chart-data";
import { formatCompact } from "@/lib/pe-daily/format";
import { CountTooltip } from "./count-tooltip";

export function UpsellingTrendChart({ data, height = 300 }: { data: ChartDatum[]; height?: number }) {
  return (
    <figure className="pe-daily-chart" aria-label="Upselling trend">
      <div className="pe-daily-chart-canvas" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 720, height }}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="category" tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={(value: number) => formatCompact(value)}
              width={64}
              tick={{ fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CountTooltip />} />
            <Line
              type="monotone"
              dataKey="count"
              name="Upselling"
              stroke="#e56f18"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/pe-daily-charts.test.tsx && npx tsc --noEmit && npx eslint components/pe-daily tests/pe-daily-charts.test.tsx`
Expected: PASS, no type or lint errors, and no Recharts warnings about zero width or height in the output. If TypeScript rejects `initialDimension` because of the installed Recharts typings, check `node_modules/recharts/types/component/ResponsiveContainer.d.ts` for the prop name and use it. If no initial-size prop exists, give `ResponsiveContainer` `minHeight={height}` and pass `width={INITIAL_WIDTH}` to the chart only when `process.env.NODE_ENV === "test"`. Describe whichever fix you made in the report.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tests/setup.ts components/pe-daily tests/pe-daily-charts.test.tsx
git commit -m "feat(pe-daily): add interactive bar and trend charts"
```

---

### Task 8: Read-only dashboard page

**Files:**
- Create: `app/pe-daily-report/page.tsx`
- Create: `components/pe-daily/pe-daily-page.tsx`, `components/pe-daily/report-sections.tsx`, `components/pe-daily/section-panel.tsx`, `components/pe-daily/data-table.tsx`, `components/pe-daily/manual-section.tsx`
- Modify: `app/globals.css` (append `pe-daily-*` styles)
- Test: `tests/pe-daily-page.test.tsx`

**Interfaces:**
- Consumes: `loadPeDailyPage`, `emptyPageData` (Task 6); `SECTIONS`, `displayManualValue` (Task 3); chart data and format helpers (Task 2); chart components (Task 7); `getAdminStatus`; `formatUploadedAt` from `@/lib/ops/analytics`; `BrandMark`
- Produces:
  - `PAGE_PATH = "/pe-daily-report"`, `reportHref(date?)`
  - `PeDailyPage({ data, isAdmin, loadError? })`. The header has a `<div className="header-tools">` where Task 10 adds the admin tools.
  - `ReportSections({ report, visibleCharts, isAdmin, onSaved })`
  - `ManualSection(props: ManualSectionProps)`, where `ManualSectionProps = { section; rows; reportDate; isAdmin; onSaved; children? }`. This task is view-only; Task 9 adds editing.
  - `SectionPanel({ id, title, actions?, children })`
  - `DataTable<T>({ label, columns, rows, rowKey })`, `Column<T>`

- [ ] **Step 1: Write the failing tests**

Create `tests/pe-daily-page.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeDailyPage } from "@/components/pe-daily/pe-daily-page";
import { makePageData, makeReport } from "./fixtures/pe-daily";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

function headings() {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
}

describe("PeDailyPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the header and every deck section in order", () => {
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    expect(screen.getByRole("heading", { level: 1, name: "PE Daily Report" })).toBeInTheDocument();
    expect(screen.getByText("Promo Engine")).toBeInTheDocument();
    expect(screen.getByText(/Uploaded .* by admin@example\.com/)).toBeInTheDocument();
    expect(headings()).toEqual([
      "Promos – TX_PROV",
      "Promos – H_DYNAMIC",
      "Actions",
      "Upselling Layer",
      "SMS",
      "Offer Sheet Tool",
      "Data Lake",
      "IT First Line Cases",
      "Grafana",
    ]);
  });

  it("renders the tables with the deck's columns and formatted numbers", () => {
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);

    const hDynamic = screen.getByRole("table", { name: "Promos – H_DYNAMIC" });
    expect(within(hDynamic).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "#",
      "Promo Name",
      "Last Week Count",
      "Day Before Count",
      "Yesterday Count",
    ]);
    expect(within(hDynamic).getByRole("row", { name: /revive/ })).toHaveTextContent("8,823,587");

    expect(screen.getByRole("table", { name: "Promos – TX_PROV" })).toHaveTextContent("go-2");
    expect(screen.getByRole("table", { name: "Actions" })).toHaveTextContent("Restart provisioning job");
    expect(screen.getByRole("table", { name: "Upselling Layer" })).toHaveTextContent("21 Oct 2026");

    const smsTable = screen.getByRole("table", { name: "SMS" });
    const smsRows = within(smsTable).getAllByRole("row").slice(1);
    expect(smsRows.map((row) => row.textContent)).toEqual([
      "1reviveOffline13,952,68414,335,23814,795,483",
      "Online154,752163,307130,766",
      "2opportunityOffline---",
      "Online3,444,7203,574,4993,061,708",
    ]);

    expect(screen.getAllByText("No entries")).toHaveLength(4);
  });

  it("shows only the deck's charts by default and every chart when enabled", () => {
    const { rerender } = render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    expect(screen.getAllByRole("figure").map((figure) => figure.getAttribute("aria-label"))).toEqual([
      "Promos – TX_PROV chart",
      "Promos – H_DYNAMIC chart",
    ]);

    rerender(
      <PeDailyPage
        data={makePageData({ visibleCharts: ["tx_prov", "h_dynamic", "upselling", "sms"] })}
        isAdmin={false}
      />,
    );
    expect(screen.getAllByRole("figure").map((figure) => figure.getAttribute("aria-label"))).toEqual([
      "Promos – TX_PROV chart",
      "Promos – H_DYNAMIC chart",
      "Upselling trend",
      "SMS chart",
    ]);
  });

  it("hides promos over 1M by default and shows them when the switch is off", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    const toggle = screen.getByRole("checkbox", { name: "Hide promos over 1M" });
    expect(toggle).toBeChecked();
    expect(screen.getByText("Showing 2 of 4 promos · 2 over 1M hidden")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText("Showing all 4 promos")).toBeInTheDocument();
  });

  it("navigates when another report date is chosen", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    const select = screen.getByLabelText("Report date");
    expect(select).toHaveValue("2026-10-22");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "22 Oct 2026",
      "21 Oct 2026",
    ]);
    await user.selectOptions(select, "2026-10-21");
    expect(push).toHaveBeenCalledWith("/pe-daily-report?date=2026-10-21");
  });

  it("shows empty, unknown-date, and load-error states", () => {
    const { rerender } = render(
      <PeDailyPage data={makePageData({ dates: [], report: null })} isAdmin={false} />,
    );
    expect(screen.getAllByText("No report uploaded yet").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Report date")).not.toBeInTheDocument();

    rerender(
      <PeDailyPage
        data={makePageData({ report: null, requestedDate: "2026-01-01" })}
        isAdmin={false}
      />,
    );
    expect(screen.getByText("No report for 2026-01-01")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the latest report" })).toHaveAttribute(
      "href",
      "/pe-daily-report",
    );

    rerender(
      <PeDailyPage
        data={makePageData({ dates: [], report: null })}
        isAdmin={false}
        loadError="Could not load the PE Daily Report: boom"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load the report. Could not load the PE Daily Report: boom",
    );
    expect(screen.queryByText("No report uploaded yet")).not.toBeInTheDocument();
  });

  it("hides the TX_PROV chart when there are no TX_PROV rows", () => {
    const report = makeReport();
    render(
      <PeDailyPage
        data={makePageData({ report: { ...report, manual: { ...report.manual, tx_prov: [] } } })}
        isAdmin={false}
      />,
    );
    expect(screen.queryByRole("figure", { name: "Promos – TX_PROV chart" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/pe-daily-page.test.tsx`
Expected: FAIL. `@/components/pe-daily/pe-daily-page` can't be resolved.

- [ ] **Step 3: Write the panel and the table**

Create `components/pe-daily/section-panel.tsx`:

```tsx
import type { ReactNode } from "react";

export function SectionPanel({
  id,
  title,
  actions,
  children,
}: {
  id: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pe-daily-panel" aria-labelledby={`${id}-title`}>
      <div className="pe-daily-panel-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        {actions ? <div className="pe-daily-panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
```

Create `components/pe-daily/data-table.tsx`:

```tsx
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  cell: (row: T, index: number) => ReactNode;
}

export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
}: {
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
}) {
  if (!rows.length) return <p className="pe-daily-empty">No entries</p>;
  return (
    <div className="pe-daily-table-wrap">
      <table className="pe-daily-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? "pe-daily-number" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? "pe-daily-number" : undefined}>
                  {column.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write the view-only manual section**

Create `components/pe-daily/manual-section.tsx`:

```tsx
import type { ReactNode } from "react";
import { displayManualValue, type SectionDefinition } from "@/lib/pe-daily/sections";
import type { ManualRow } from "@/lib/pe-daily/types";
import { DataTable, type Column } from "./data-table";
import { SectionPanel } from "./section-panel";

export interface ManualSectionProps {
  section: SectionDefinition;
  rows: ManualRow[];
  reportDate: string;
  isAdmin: boolean;
  onSaved: () => void;
  children?: ReactNode;
}

export function manualColumns(section: SectionDefinition): Column<ManualRow>[] {
  return [
    { key: "#", header: "#", numeric: true, cell: (_row, index) => index + 1 },
    ...section.fields.map((field) => ({
      key: field.key,
      header: field.label,
      numeric: field.type === "count",
      cell: (row: ManualRow) => displayManualValue(field, row[field.key]),
    })),
  ];
}

export function ManualSection({ section, rows, children }: ManualSectionProps) {
  return (
    <SectionPanel id={`pe-daily-${section.key}`} title={section.title}>
      <DataTable
        label={section.title}
        columns={manualColumns(section)}
        rows={rows}
        rowKey={(_row, index) => String(index)}
      />
      {children}
    </SectionPanel>
  );
}
```

- [ ] **Step 5: Write the sections**

Create `components/pe-daily/report-sections.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import {
  groupSms,
  promoChartData,
  smsChartData,
  txProvChartData,
  upsellingChartData,
} from "@/lib/pe-daily/chart-data";
import { formatCount, formatReportDate, splitLargePromos } from "@/lib/pe-daily/format";
import { SECTIONS } from "@/lib/pe-daily/sections";
import type {
  ChartKey,
  PeDailyReport,
  PromoCounts,
  SectionKey,
  SmsCounts,
  UpsellingDay,
} from "@/lib/pe-daily/types";
import { DataTable, type Column } from "./data-table";
import { ManualSection } from "./manual-section";
import { CHANNEL_SERIES, PERIOD_SERIES, PromoBarChart } from "./promo-bar-chart";
import { SectionPanel } from "./section-panel";
import { UpsellingTrendChart } from "./upselling-trend-chart";

const PROMO_COLUMNS: Column<PromoCounts>[] = [
  { key: "#", header: "#", numeric: true, cell: (_row, index) => index + 1 },
  { key: "promo", header: "Promo Name", cell: (row) => row.promo },
  { key: "lastWeek", header: "Last Week Count", numeric: true, cell: (row) => formatCount(row.lastWeek) },
  { key: "dayBefore", header: "Day Before Count", numeric: true, cell: (row) => formatCount(row.dayBefore) },
  { key: "yesterday", header: "Yesterday Count", numeric: true, cell: (row) => formatCount(row.yesterday) },
];

const UPSELLING_COLUMNS: Column<UpsellingDay>[] = [
  { key: "day", header: "Date", cell: (row) => formatReportDate(row.day) },
  { key: "count", header: "Count", numeric: true, cell: (row) => formatCount(row.count) },
];

const CHANNEL_LABELS = { offline: "Offline", online: "Online" } as const;

function SmsTable({ rows }: { rows: SmsCounts[] }) {
  const groups = groupSms(rows);
  if (!groups.length) return <p className="pe-daily-empty">No entries</p>;
  return (
    <div className="pe-daily-table-wrap">
      <table className="pe-daily-table" aria-label="SMS">
        <thead>
          <tr>
            <th scope="col" className="pe-daily-number">#</th>
            <th scope="col">Promo Name</th>
            <th scope="col">Type</th>
            <th scope="col" className="pe-daily-number">Last Week Count</th>
            <th scope="col" className="pe-daily-number">Day Before Count</th>
            <th scope="col" className="pe-daily-number">Yesterday Count</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((group, index) =>
            (["offline", "online"] as const).map((channel, channelIndex) => {
              const counts = group[channel];
              return (
                <tr key={`${group.promo}-${channel}`}>
                  {channelIndex === 0 ? (
                    <>
                      <td rowSpan={2} className="pe-daily-number">{index + 1}</td>
                      <td rowSpan={2}>{group.promo}</td>
                    </>
                  ) : null}
                  <td>{CHANNEL_LABELS[channel]}</td>
                  <td className="pe-daily-number">{formatCount(counts?.lastWeek)}</td>
                  <td className="pe-daily-number">{formatCount(counts?.dayBefore)}</td>
                  <td className="pe-daily-number">{formatCount(counts?.yesterday)}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ReportSections({
  report,
  visibleCharts,
  isAdmin,
  onSaved,
}: {
  report: PeDailyReport;
  visibleCharts: ChartKey[];
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [hideLarge, setHideLarge] = useState(true);
  const show = (key: ChartKey) => visibleCharts.includes(key);
  const { visible, hiddenCount } = splitLargePromos(report.promos, hideLarge);
  const manual = (key: SectionKey, chart?: ReactNode) => (
    <ManualSection
      section={SECTIONS[key]}
      rows={report.manual[key]}
      reportDate={report.reportDate}
      isAdmin={isAdmin}
      onSaved={onSaved}
    >
      {chart}
    </ManualSection>
  );

  return (
    <div className="pe-daily-sections">
      {manual(
        "tx_prov",
        show("tx_prov") && report.manual.tx_prov.length ? (
          <PromoBarChart
            label="Promos – TX_PROV chart"
            data={txProvChartData(report.manual.tx_prov)}
            series={PERIOD_SERIES}
          />
        ) : null,
      )}

      <SectionPanel id="pe-daily-h-dynamic" title="Promos – H_DYNAMIC">
        <DataTable
          label="Promos – H_DYNAMIC"
          columns={PROMO_COLUMNS}
          rows={report.promos}
          rowKey={(row) => row.promo}
        />
        {show("h_dynamic") ? (
          <>
            <div className="pe-daily-chart-toolbar">
              <label className="pe-daily-switch">
                <input
                  type="checkbox"
                  checked={hideLarge}
                  onChange={(event) => setHideLarge(event.target.checked)}
                />
                Hide promos over 1M
              </label>
              <p className="pe-daily-chart-note">
                {hiddenCount
                  ? `Showing ${visible.length} of ${report.promos.length} promos · ${hiddenCount} over 1M hidden`
                  : `Showing all ${report.promos.length} promos`}
              </p>
            </div>
            <PromoBarChart
              label="Promos – H_DYNAMIC chart"
              data={promoChartData(visible)}
              series={PERIOD_SERIES}
            />
          </>
        ) : null}
      </SectionPanel>

      {manual("actions")}

      <SectionPanel id="pe-daily-upselling" title="Upselling Layer">
        <DataTable
          label="Upselling Layer"
          columns={UPSELLING_COLUMNS}
          rows={report.upselling}
          rowKey={(row) => row.day}
        />
        {show("upselling") ? <UpsellingTrendChart data={upsellingChartData(report.upselling)} /> : null}
      </SectionPanel>

      <SectionPanel id="pe-daily-sms" title="SMS">
        <SmsTable rows={report.sms} />
        {show("sms") ? (
          <PromoBarChart label="SMS chart" data={smsChartData(report.sms)} series={CHANNEL_SERIES} />
        ) : null}
      </SectionPanel>

      {manual("offer_sheet")}
      {manual("data_lake")}
      {manual("it_cases")}
      {manual("grafana")}
    </div>
  );
}
```

- [ ] **Step 6: Write the page shell**

Create `components/pe-daily/pe-daily-page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/ui/brand-mark";
import { formatUploadedAt } from "@/lib/ops/analytics";
import { formatReportDate } from "@/lib/pe-daily/format";
import type { PeDailyPageData } from "@/lib/pe-daily/types";
import { ReportSections } from "./report-sections";

export const PAGE_PATH = "/pe-daily-report";

export function reportHref(date?: string | null): string {
  return date ? `${PAGE_PATH}?date=${encodeURIComponent(date)}` : PAGE_PATH;
}

function subtitle(data: PeDailyPageData, loadError: string | null): string | null {
  if (loadError) return "Couldn't load the report";
  if (data.report) {
    const by = data.report.uploadedByEmail ? ` by ${data.report.uploadedByEmail}` : "";
    return `Uploaded ${formatUploadedAt(data.report.uploadedAt)}${by}`;
  }
  return data.dates.length ? null : "No report uploaded yet";
}

export function PeDailyPage({
  data,
  isAdmin,
  loadError = null,
}: {
  data: PeDailyPageData;
  isAdmin: boolean;
  loadError?: string | null;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { dates, report, requestedDate, visibleCharts } = data;
  const headerLine = subtitle(data, loadError);

  let body;
  if (loadError) {
    body = (
      <div className="mutation-notice" role="alert">
        <span>Couldn&apos;t load the report. {loadError}</span>
      </div>
    );
  } else if (!dates.length) {
    body = (
      <section className="view-state pe-daily-empty-state">
        <p className="view-state-title">No report uploaded yet</p>
        <p>
          {isAdmin
            ? "Use Upload at the top of the page to add today's export."
            : "An admin hasn't uploaded a daily report yet."}
        </p>
      </section>
    );
  } else if (!report) {
    body = (
      <section className="view-state pe-daily-empty-state">
        <p className="view-state-title">No report for {requestedDate}</p>
        <p>
          <Link href={PAGE_PATH}>View the latest report</Link>
        </p>
      </section>
    );
  } else {
    body = (
      <ReportSections report={report} visibleCharts={visibleCharts} isAdmin={isAdmin} onSaved={refresh} />
    );
  }

  return (
    <main className="dashboard pe-daily-page">
      <header className="dashboard-header">
        <div className="brand-lockup">
          <p className="eyebrow">Promo Engine</p>
          <div className="brand-title-row">
            <BrandMark />
            <h1>PE Daily Report</h1>
          </div>
          {headerLine ? <p className="workspace-description">{headerLine}</p> : null}
        </div>
        <div className="header-tools">
          {dates.length && !loadError ? (
            <label className="form-field pe-daily-date-field">
              <span>Report date</span>
              <select
                value={report?.reportDate ?? ""}
                onChange={(event) => router.push(reportHref(event.target.value))}
              >
                {report ? null : <option value="">Select a date</option>}
                {dates.map((date) => (
                  <option key={date} value={date}>{formatReportDate(date)}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>
      {body}
    </main>
  );
}
```

- [ ] **Step 7: Write the server page**

Create `app/pe-daily-report/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PeDailyPage } from "@/components/pe-daily/pe-daily-page";
import { getAdminStatus } from "@/lib/data/initial-dashboard";
import { emptyPageData, loadPeDailyPage } from "@/lib/pe-daily/load";
import type { PeDailyPageData } from "@/lib/pe-daily/types";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "PE Daily Report",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PeDailyReportPageProps {
  searchParams: Promise<{ date?: string | string[] }>;
}

export default async function PeDailyReportPage({ searchParams }: PeDailyReportPageProps) {
  const { date } = await searchParams;
  const requestedDate = typeof date === "string" && date.trim() ? date.trim().slice(0, 32) : null;
  const client = hasSupabasePublicEnv() ? await createClient() : null;
  let data: PeDailyPageData = emptyPageData(requestedDate);
  let loadError: string | null = null;
  try {
    data = await loadPeDailyPage(client, requestedDate);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load the PE Daily Report.";
  }
  const isAdmin = client ? await getAdminStatus(client) : false;
  return <PeDailyPage data={data} isAdmin={isAdmin} loadError={loadError} />;
}
```

- [ ] **Step 8: Append the styles**

Append to the end of `app/globals.css`:

```css
.pe-daily-sections {
  display: grid;
  gap: 20px;
}

.pe-daily-panel {
  padding: 22px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}

.pe-daily-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.pe-daily-panel-heading h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.02em;
}

.pe-daily-panel-actions {
  display: flex;
  gap: 8px;
}

.pe-daily-table-wrap {
  overflow-x: auto;
}

.pe-daily-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.pe-daily-table th,
.pe-daily-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.pe-daily-table thead th {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.pe-daily-table .pe-daily-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.pe-daily-empty,
.pe-daily-chart-note {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.pe-daily-chart {
  margin: 18px 0 0;
}

.pe-daily-chart-scroll {
  overflow-x: auto;
}

.pe-daily-chart-canvas {
  width: 100%;
}

.pe-daily-chart-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}

.pe-daily-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.pe-daily-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.pe-daily-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.pe-daily-legend-item[aria-pressed="false"] {
  opacity: 0.45;
  text-decoration: line-through;
}

.pe-daily-legend-swatch,
.pe-daily-tooltip-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.pe-daily-tooltip {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-size: 12px;
}

.pe-daily-tooltip-title {
  margin: 0 0 6px;
  font-weight: 700;
}

.pe-daily-tooltip ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pe-daily-tooltip li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pe-daily-date-field {
  min-width: 180px;
}

.pe-daily-admin-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pe-daily-input {
  width: 100%;
  min-width: 110px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
}

.pe-daily-input[aria-invalid="true"] {
  border-color: var(--red);
}

.pe-daily-field-error {
  display: block;
  margin-top: 4px;
  color: var(--red);
  font-size: 11px;
}

.pe-daily-editor .form-actions {
  margin-top: 12px;
}

.pe-daily-chart-options {
  display: grid;
  gap: 10px;
  margin: 16px 0;
  padding: 0;
  border: 0;
}

.pe-daily-chart-options label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pe-daily-upload-errors {
  max-height: 260px;
  overflow-y: auto;
  padding-left: 18px;
  font-size: 13px;
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/pe-daily-page.test.tsx && npx tsc --noEmit && npx eslint app/pe-daily-report components/pe-daily tests/pe-daily-page.test.tsx`
Expected: PASS, no type or lint errors, no React key or act() warnings.

- [ ] **Step 10: Commit**

```bash
git add app/pe-daily-report components/pe-daily app/globals.css tests/pe-daily-page.test.tsx
git commit -m "feat(pe-daily): add read-only PE Daily Report page"
```

---

### Task 9: Editing admin-entered sections

**Files:**
- Modify (full replacement): `components/pe-daily/manual-section.tsx`
- Test: `tests/pe-daily-manual-section.test.tsx`

**Interfaces:**
- Consumes: `SECTIONS`, `validateDraftRows`, `toDraftRow`, `emptyDraftRow`, `DraftRow` (Task 3); `savePeDailySection` (Task 6); `createClient` from `@/lib/supabase/client`; `DataTable`, `SectionPanel` (Task 8)
- Produces: `ManualSection(props: ManualSectionProps)`, with the same props as Task 8. Admins get Edit, Add row, Delete per row, Save, Cancel, and Retry on failure. `manualColumns(section)` stays exported.

- [ ] **Step 1: Write the failing tests**

Create `tests/pe-daily-manual-section.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualSection } from "@/components/pe-daily/manual-section";
import { SECTIONS } from "@/lib/pe-daily/sections";

const savePeDailySection = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ kind: "browser-client" }));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@/lib/pe-daily/mutations", () => ({ savePeDailySection }));

const onSaved = vi.fn();

function renderActions(isAdmin = true, rows = [{ action: "Restart provisioning job", status: "Done" }]) {
  return render(
    <ManualSection
      section={SECTIONS.actions}
      rows={rows}
      reportDate="2026-10-22"
      isAdmin={isAdmin}
      onSaved={onSaved}
    />,
  );
}

describe("ManualSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePeDailySection.mockResolvedValue(undefined);
  });

  it("shows the table without an Edit button for visitors", () => {
    renderActions(false);
    expect(screen.getByRole("table", { name: "Actions" })).toHaveTextContent("Restart provisioning job");
    expect(screen.queryByRole("button", { name: "Edit Actions" })).not.toBeInTheDocument();
  });

  it("edits, adds a row, and saves the trimmed rows", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));

    const status = screen.getByLabelText("Status, row 1");
    expect(screen.getByLabelText("Action, row 1")).toHaveValue("Restart provisioning job");
    await user.clear(status);
    await user.type(status, "In progress");
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await user.type(screen.getByLabelText("Action, row 2"), "  Check Grafana  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(savePeDailySection).toHaveBeenCalledWith(fakeClient, "2026-10-22", "actions", [
      { action: "Restart provisioning job", status: "In progress" },
      { action: "Check Grafana", status: "" },
    ]);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows field errors and blocks saving", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await user.type(screen.getByLabelText("Status, row 2"), "Pending");

    expect(screen.getByText("Required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Action, row 2")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Delete row 2" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("validates TX_PROV counts", async () => {
    const user = userEvent.setup();
    render(
      <ManualSection
        section={SECTIONS.tx_prov}
        rows={[]}
        reportDate="2026-10-22"
        isAdmin
        onSaved={onSaved}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Promos – TX_PROV" }));
    await user.type(screen.getByLabelText("Promo Name, row 1"), "go-2");
    await user.type(screen.getByLabelText("Last Week Count, row 1"), "12a");
    expect(screen.getByText("Enter a whole number.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Last Week Count, row 1"));
    await user.type(screen.getByLabelText("Last Week Count, row 1"), "1,408");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(savePeDailySection).toHaveBeenCalledWith(
      fakeClient,
      "2026-10-22",
      "tx_prov",
      [{ promo: "go-2", last_week: 1408, day_before: null, yesterday: null }],
    ));
  });

  it("discards edits on Cancel", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    await user.clear(screen.getByLabelText("Action, row 1"));
    await user.type(screen.getByLabelText("Action, row 1"), "Changed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(savePeDailySection).not.toHaveBeenCalled();
    expect(screen.getByRole("table", { name: "Actions" })).toHaveTextContent("Restart provisioning job");
  });

  it("keeps the edits and offers Retry when saving fails", async () => {
    const user = userEvent.setup();
    savePeDailySection.mockRejectedValueOnce(new Error("Saving the section failed: timeout"));
    renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    await user.clear(screen.getByLabelText("Status, row 1"));
    await user.type(screen.getByLabelText("Status, row 1"), "Blocked");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Saving the section failed: timeout");
    expect(screen.getByLabelText("Status, row 1")).toHaveValue("Blocked");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(savePeDailySection).toHaveBeenCalledTimes(2));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("starts an empty section with one blank row and can save it empty", async () => {
    const user = userEvent.setup();
    renderActions(true, []);
    expect(screen.getByText("No entries")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    const editor = screen.getByRole("table", { name: "Edit Actions" });
    expect(within(editor).getAllByRole("row")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(savePeDailySection).toHaveBeenCalledWith(fakeClient, "2026-10-22", "actions", []));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/pe-daily-manual-section.test.tsx`
Expected: FAIL with `Unable to find an accessible element with the role "button" and name "Edit Actions"`.

- [ ] **Step 3: Replace `components/pe-daily/manual-section.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { savePeDailySection } from "@/lib/pe-daily/mutations";
import {
  displayManualValue,
  emptyDraftRow,
  toDraftRow,
  validateDraftRows,
  type DraftRow,
  type DraftValidation,
  type SectionDefinition,
} from "@/lib/pe-daily/sections";
import type { ManualRow } from "@/lib/pe-daily/types";
import { createClient } from "@/lib/supabase/client";
import { DataTable, type Column } from "./data-table";
import { SectionPanel } from "./section-panel";

export interface ManualSectionProps {
  section: SectionDefinition;
  rows: ManualRow[];
  reportDate: string;
  isAdmin: boolean;
  onSaved: () => void;
  children?: ReactNode;
}

export function manualColumns(section: SectionDefinition): Column<ManualRow>[] {
  return [
    { key: "#", header: "#", numeric: true, cell: (_row, index) => index + 1 },
    ...section.fields.map((field) => ({
      key: field.key,
      header: field.label,
      numeric: field.type === "count",
      cell: (row: ManualRow) => displayManualValue(field, row[field.key]),
    })),
  ];
}

function SectionEditor({
  section,
  drafts,
  validation,
  saving,
  saveError,
  onChange,
  onAdd,
  onRemove,
  onCancel,
  onSave,
}: {
  section: SectionDefinition;
  drafts: DraftRow[];
  validation: DraftValidation;
  saving: boolean;
  saveError: string | null;
  onChange: (index: number, key: string, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="pe-daily-editor">
      {saveError ? (
        <div className="mutation-notice" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}
      <div className="pe-daily-table-wrap">
        <table className="pe-daily-table" aria-label={`Edit ${section.title}`}>
          <thead>
            <tr>
              <th scope="col" className="pe-daily-number">#</th>
              {section.fields.map((field) => (
                <th key={field.key} scope="col">
                  {field.label}
                  {field.required ? " *" : ""}
                </th>
              ))}
              <th scope="col" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft, index) => (
              <tr key={index}>
                <td className="pe-daily-number">{index + 1}</td>
                {section.fields.map((field) => {
                  const error = validation.errors[index]?.[field.key];
                  const id = `pe-daily-${section.key}-${index}-${field.key}`;
                  return (
                    <td key={field.key}>
                      <input
                        id={id}
                        className="pe-daily-input"
                        value={draft[field.key] ?? ""}
                        inputMode={field.type === "count" ? "numeric" : undefined}
                        aria-label={`${field.label}, row ${index + 1}`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${id}-error` : undefined}
                        disabled={saving}
                        onChange={(event) => onChange(index, field.key, event.target.value)}
                      />
                      {error ? (
                        <span id={`${id}-error`} className="pe-daily-field-error">{error}</span>
                      ) : null}
                    </td>
                  );
                })}
                <td>
                  <button
                    type="button"
                    className="secondary-button"
                    aria-label={`Delete row ${index + 1}`}
                    disabled={saving}
                    onClick={() => onRemove(index)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onAdd} disabled={saving}>
          Add row
        </button>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onSave}
          disabled={saving || !validation.valid}
        >
          {saving ? "Saving…" : saveError ? "Retry" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function ManualSection({ section, rows, reportDate, isAdmin, onSaved, children }: ManualSectionProps) {
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validation = drafts ? validateDraftRows(section, drafts) : null;

  function startEditing() {
    setDrafts(rows.length ? rows.map((row) => toDraftRow(section, row)) : [emptyDraftRow(section)]);
    setSaveError(null);
  }

  function cancel() {
    if (saving) return;
    setDrafts(null);
    setSaveError(null);
  }

  function updateDraft(index: number, key: string, value: string) {
    setDrafts((current) =>
      current ? current.map((draft, i) => (i === index ? { ...draft, [key]: value } : draft)) : current,
    );
  }

  async function save() {
    if (!validation?.valid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await savePeDailySection(createClient(), reportDate, section.key, validation.rows);
      setDrafts(null);
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Saving the section failed.");
    } finally {
      setSaving(false);
    }
  }

  const actions = isAdmin && !drafts ? (
    <button
      type="button"
      className="secondary-button"
      aria-label={`Edit ${section.title}`}
      onClick={startEditing}
    >
      Edit
    </button>
  ) : null;

  return (
    <SectionPanel id={`pe-daily-${section.key}`} title={section.title} actions={actions}>
      {drafts && validation ? (
        <SectionEditor
          section={section}
          drafts={drafts}
          validation={validation}
          saving={saving}
          saveError={saveError}
          onChange={updateDraft}
          onAdd={() => setDrafts((current) => (current ? [...current, emptyDraftRow(section)] : current))}
          onRemove={(index) => setDrafts((current) => (current ? current.filter((_, i) => i !== index) : current))}
          onCancel={cancel}
          onSave={() => void save()}
        />
      ) : (
        <DataTable
          label={section.title}
          columns={manualColumns(section)}
          rows={rows}
          rowKey={(_row, index) => String(index)}
        />
      )}
      {children}
    </SectionPanel>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/pe-daily-manual-section.test.tsx tests/pe-daily-page.test.tsx && npx tsc --noEmit && npx eslint components/pe-daily tests/pe-daily-manual-section.test.tsx`
Expected: PASS, no type or lint errors, no act() warnings.

- [ ] **Step 5: Commit**

```bash
git add components/pe-daily/manual-section.tsx tests/pe-daily-manual-section.test.tsx
git commit -m "feat(pe-daily): let admins edit the admin-entered sections"
```

---

### Task 10: Upload, chart settings, and delete (plus a shared upload hook)

**Files:**
- Create: `components/ui/use-file-upload.ts`, `components/ui/file-picker-button.tsx`
- Modify (full replacement): `components/ops/ops-upload.tsx`, which switches to the shared hook and picker with unchanged behavior
- Create: `components/pe-daily/report-upload.tsx`, `components/pe-daily/chart-settings.tsx`, `components/pe-daily/delete-report.tsx`
- Modify: `components/pe-daily/pe-daily-page.tsx` (admin tools)
- Test: `tests/pe-daily-admin.test.tsx`; existing `tests/ops-upload.test.tsx` must keep passing unchanged

**Interfaces:**
- Consumes: `parseReportFile`, `ParseReportResult` (Task 4); `savePeDailyReport`, `savePeDailyChartSettings`, `deletePeDailyReport` (Task 6); `CHART_KEYS`, `CHART_LABELS` (Task 2); `formatReportDate` (Task 2); `ModalDialog`, `ConfirmDialog`; `reportHref`, `PAGE_PATH` (Task 8)
- Produces:
  - `useFileUpload<TResult>({ read, canSave, save, onSaved })`, returning `{ state, close, chooseFile, confirm }`, where `state` is `UploadPhase<TResult>`
  - `FilePickerButton({ inputLabel, onFile })`, which renders the "Upload" button and a hidden input
  - `ReportUpload({ existingDates, onUploaded })`
  - `ChartSettings({ visibleCharts, onSaved })`
  - `DeleteReport({ reportDate, onDeleted })`

- [ ] **Step 1: Write the failing tests**

Create `tests/pe-daily-admin.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeDailyPage } from "@/components/pe-daily/pe-daily-page";
import { makePageData } from "./fixtures/pe-daily";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ kind: "browser-client" }));
const mutations = vi.hoisted(() => ({
  savePeDailyReport: vi.fn(),
  savePeDailySection: vi.fn(),
  deletePeDailyReport: vi.fn(),
  savePeDailyChartSettings: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@/lib/pe-daily/mutations", () => mutations);

const sampleCsv = readFileSync(resolve(import.meta.dirname, "fixtures/pe-daily-report-sample.csv"));

function sampleFile() {
  return new File([sampleCsv], "daily report.csv", { type: "text/csv" });
}

describe("PE Daily Report admin tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mutations).forEach((mock) => mock.mockResolvedValue(undefined));
  });

  it("hides every admin control from visitors", () => {
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    for (const name of ["Upload", "Chart settings", "Delete this date"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryAllByRole("button", { name: /^Edit / })).toHaveLength(0);
  });

  it("shows admin controls, including Edit on all six admin-entered sections", () => {
    render(<PeDailyPage data={makePageData()} isAdmin />);
    for (const name of ["Upload", "Chart settings", "Delete this date"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /^Edit / }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Edit Promos – TX_PROV",
      "Edit Actions",
      "Edit Offer Sheet Tool",
      "Edit Data Lake",
      "Edit IT First Line Cases",
      "Edit Grafana",
    ]);
  });

  it("previews and saves an upload for an existing date", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData()} isAdmin />);
    await user.upload(screen.getByLabelText("Choose the daily report file"), sampleFile());

    const dialog = await screen.findByRole("dialog", { name: "daily report.csv" });
    expect(dialog).toHaveTextContent("Report for 22 Oct 2026: 29 promos, 11 SMS rows, 7 upselling days");
    expect(dialog).toHaveTextContent(
      "This replaces the uploaded data for 22 Oct 2026. Admin-entered sections are kept.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save report" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/pe-daily-report?date=2026-10-22"));
    expect(refresh).toHaveBeenCalled();
    expect(mutations.savePeDailyReport).toHaveBeenCalledWith(
      fakeClient,
      "daily report.csv",
      expect.objectContaining({ reportDate: "2026-10-22" }),
    );
    expect(mutations.savePeDailyReport.mock.calls[0][2].promos).toHaveLength(29);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("omits the replace note for a new date and lists file problems", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData({ dates: ["2026-10-21"] })} isAdmin />);
    await user.upload(screen.getByLabelText("Choose the daily report file"), sampleFile());
    const dialog = await screen.findByRole("dialog", { name: "daily report.csv" });
    expect(dialog).not.toHaveTextContent("This replaces the uploaded data");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.upload(
      screen.getByLabelText("Choose the daily report file"),
      new File(["REPORT_DATE\n31-02-2026\n"], "bad.csv", { type: "text/csv" }),
    );
    const bad = await screen.findByRole("dialog", { name: "bad.csv" });
    expect(bad).toHaveTextContent("This file can't be uploaded.");
    expect(bad).toHaveTextContent('Row 2: Unrecognized report date "31-02-2026".');
    expect(bad).toHaveTextContent("The file has no PROMO block.");
    expect(within(bad).queryByRole("button", { name: "Save report" })).not.toBeInTheDocument();
  });

  it("keeps the upload dialog open with Retry when saving fails", async () => {
    const user = userEvent.setup();
    mutations.savePeDailyReport.mockRejectedValueOnce(new Error("Saving the report failed: timeout"));
    render(<PeDailyPage data={makePageData()} isAdmin />);
    await user.upload(screen.getByLabelText("Choose the daily report file"), sampleFile());
    const dialog = await screen.findByRole("dialog", { name: "daily report.csv" });
    await user.click(within(dialog).getByRole("button", { name: "Save report" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Saving the report failed: timeout");
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(mutations.savePeDailyReport).toHaveBeenCalledTimes(2));
  });

  it("saves chart settings for everyone", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData()} isAdmin />);
    await user.click(screen.getByRole("button", { name: "Chart settings" }));
    const dialog = screen.getByRole("dialog", { name: "Chart settings" });
    expect(within(dialog).getByRole("checkbox", { name: "Promos – TX_PROV" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Upselling trend" })).not.toBeChecked();

    await user.click(within(dialog).getByRole("checkbox", { name: "Upselling trend" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Promos – TX_PROV" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mutations.savePeDailyChartSettings).toHaveBeenCalledWith(fakeClient, ["h_dynamic", "upselling"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes the shown date after confirmation and offers Retry on failure", async () => {
    const user = userEvent.setup();
    mutations.deletePeDailyReport.mockRejectedValueOnce(new Error("Deleting the report failed: timeout"));
    render(<PeDailyPage data={makePageData()} isAdmin />);

    await user.click(screen.getByRole("button", { name: "Delete this date" }));
    const confirm = screen.getByRole("dialog", { name: "Delete the 22 Oct 2026 report?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Deleting the report failed: timeout");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/pe-daily-report"));
    expect(mutations.deletePeDailyReport).toHaveBeenLastCalledWith(fakeClient, "2026-10-22");
    expect(refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/pe-daily-admin.test.tsx`
Expected: FAIL. The admin-controls test fails with `Unable to find an accessible element with the role "button" and name "Upload"`.

- [ ] **Step 3: Write the shared upload hook and picker**

Create `components/ui/use-file-upload.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";

export type UploadPhase<TResult> =
  | { phase: "idle" }
  | { phase: "reading"; fileName: string }
  | { phase: "failed"; fileName: string; message: string }
  | {
      phase: "review";
      fileName: string;
      result: TResult;
      saving: boolean;
      saveError: string | null;
    };

export function useFileUpload<TResult>({
  read,
  canSave,
  save,
  onSaved,
}: {
  read: (file: File) => Promise<TResult>;
  canSave: (result: TResult) => boolean;
  save: (fileName: string, result: TResult) => Promise<void>;
  onSaved: (result: TResult) => void;
}) {
  const [state, setState] = useState<UploadPhase<TResult>>({ phase: "idle" });
  const attemptRef = useRef(0);
  const close = useCallback(
    () =>
      setState((current) =>
        current.phase === "review" && current.saving ? current : { phase: "idle" },
      ),
    [],
  );

  async function chooseFile(file: File) {
    const attempt = ++attemptRef.current;
    setState({ phase: "reading", fileName: file.name });
    let next: UploadPhase<TResult>;
    try {
      const result = await read(file);
      next = { phase: "review", fileName: file.name, result, saving: false, saveError: null };
    } catch (error) {
      next = {
        phase: "failed",
        fileName: file.name,
        message: error instanceof Error ? error.message : "The file could not be read.",
      };
    }
    if (attempt !== attemptRef.current) return;
    setState((current) => (current.phase === "reading" ? next : current));
  }

  async function confirm() {
    if (state.phase !== "review" || state.saving || !canSave(state.result)) return;
    const attempt = attemptRef.current;
    const { fileName, result } = state;
    setState({ ...state, saving: true, saveError: null });
    try {
      await save(fileName, result);
      if (attempt !== attemptRef.current) return;
      setState({ phase: "idle" });
      onSaved(result);
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      setState({
        phase: "review",
        fileName,
        result,
        saving: false,
        saveError: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return { state, close, chooseFile, confirm };
}
```

Create `components/ui/file-picker-button.tsx`:

```tsx
"use client";

import { useRef } from "react";

export function FilePickerButton({
  inputLabel,
  onFile,
}: {
  inputLabel: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>
        Upload
      </button>
      <input
        ref={inputRef}
        type="file"
        className="ops-file-input"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label={inputLabel}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
```

- [ ] **Step 4: Move Ops Requests to the shared hook**

Replace `components/ops/ops-upload.tsx` with:

```tsx
"use client";

import { FilePickerButton } from "@/components/ui/file-picker-button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { useFileUpload } from "@/components/ui/use-file-upload";
import { countByStatus } from "@/lib/ops/analytics";
import { replaceOpsRequests } from "@/lib/ops/mutations";
import { normalizeRequests, type NormalizeResult } from "@/lib/ops/normalize";
import { OPS_STATUSES, OPS_STATUS_LABELS } from "@/lib/ops/types";
import { parseSheetFile } from "@/lib/sheets/parse-sheet";
import { createClient } from "@/lib/supabase/client";

function UploadReview({
  result,
  saving,
  saveError,
  onCancel,
  onConfirm,
}: {
  result: NormalizeResult;
  saving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!result.ok) {
    return (
      <>
        <div className="mutation-notice" role="alert">
          <span>
            This file can&apos;t be uploaded. {result.fileError ?? "Fix these problems and try again."} Nothing
            was changed.
          </span>
        </div>
        {result.missingHeaders.length ? (
          <p>Missing columns: {result.missingHeaders.join(", ")}</p>
        ) : null}
        {result.errors.length ? (
          <ul className="ops-upload-errors">
            {result.errors.map((error) => (
              <li key={error.rowNumber}>
                Row {error.rowNumber}
                {error.interactionId ? ` (${error.interactionId})` : ""}: {error.message}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Close</button>
        </div>
      </>
    );
  }

  const counts = countByStatus(result.requests);
  const breakdown = OPS_STATUSES
    .map((status) => `${counts[status]} ${OPS_STATUS_LABELS[status].toLowerCase()}`)
    .join(", ");
  return (
    <>
      <p className="ops-upload-summary">
        {result.requests.length} requests found — {breakdown}
      </p>
      <p>Replacing will delete all current Ops Requests data and show only this file.</p>
      {saveError ? (
        <div className="mutation-notice" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onConfirm}
          disabled={saving}
          data-modal-initial-focus
        >
          {saving ? "Replacing…" : saveError ? "Retry" : "Replace data"}
        </button>
      </div>
    </>
  );
}

export function OpsUpload({ onUploaded }: { onUploaded: () => void }) {
  const { state, close, chooseFile, confirm } = useFileUpload<NormalizeResult>({
    read: async (file) => normalizeRequests(await parseSheetFile(file)),
    canSave: (result) => result.ok,
    save: async (fileName, result) => {
      if (result.ok) await replaceOpsRequests(createClient(), fileName, result.requests);
    },
    onSaved: () => onUploaded(),
  });

  return (
    <>
      <FilePickerButton inputLabel="Choose a CSV or Excel file to upload" onFile={(file) => void chooseFile(file)} />
      {state.phase !== "idle" ? (
        <ModalDialog
          labelledBy="ops-upload-title"
          closeLabel="Close upload"
          onClose={close}
          className="admin-modal ops-upload-modal"
        >
          <p className="eyebrow">Upload</p>
          <h2 id="ops-upload-title">{state.fileName}</h2>
          {state.phase === "reading" ? <p role="status">Reading file…</p> : null}
          {state.phase === "failed" ? (
            <div className="mutation-notice" role="alert">
              <span>{state.message}</span>
            </div>
          ) : null}
          {state.phase === "review" ? (
            <UploadReview
              result={state.result}
              saving={state.saving}
              saveError={state.saveError}
              onCancel={close}
              onConfirm={() => void confirm()}
            />
          ) : null}
        </ModalDialog>
      ) : null}
    </>
  );
}
```

Run: `npx vitest run tests/ops-upload.test.tsx tests/ops-requests-page.test.tsx`
Expected: PASS with no test changes. If anything fails, the hook changed behavior. Fix the hook, not the Ops tests.

- [ ] **Step 5: Write the report upload dialog**

Create `components/pe-daily/report-upload.tsx`:

```tsx
"use client";

import { FilePickerButton } from "@/components/ui/file-picker-button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { useFileUpload } from "@/components/ui/use-file-upload";
import { formatReportDate } from "@/lib/pe-daily/format";
import { savePeDailyReport } from "@/lib/pe-daily/mutations";
import { parseReportFile, type ParseReportResult } from "@/lib/pe-daily/parse-report";
import { createClient } from "@/lib/supabase/client";

function UploadReview({
  result,
  existingDates,
  saving,
  saveError,
  onCancel,
  onConfirm,
}: {
  result: ParseReportResult;
  existingDates: string[];
  saving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!result.ok) {
    return (
      <>
        <div className="mutation-notice" role="alert">
          <span>This file can&apos;t be uploaded. Fix these problems and try again. Nothing was changed.</span>
        </div>
        <ul className="pe-daily-upload-errors">
          {result.errors.map((error, index) => (
            <li key={index}>
              {error.rowNumber ? `Row ${error.rowNumber}: ` : ""}
              {error.message}
            </li>
          ))}
        </ul>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Close</button>
        </div>
      </>
    );
  }

  const { report } = result;
  const date = formatReportDate(report.reportDate);
  return (
    <>
      <p className="ops-upload-summary">
        Report for {date}: {report.promos.length} promos, {report.sms.length} SMS rows,{" "}
        {report.upselling.length} upselling days
      </p>
      {existingDates.includes(report.reportDate) ? (
        <p>This replaces the uploaded data for {date}. Admin-entered sections are kept.</p>
      ) : null}
      {saveError ? (
        <div className="mutation-notice" role="alert">
          <span>{saveError}</span>
        </div>
      ) : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={onConfirm} disabled={saving}>
          {saving ? "Saving…" : saveError ? "Retry" : "Save report"}
        </button>
      </div>
    </>
  );
}

export function ReportUpload({
  existingDates,
  onUploaded,
}: {
  existingDates: string[];
  onUploaded: (reportDate: string) => void;
}) {
  const { state, close, chooseFile, confirm } = useFileUpload<ParseReportResult>({
    read: parseReportFile,
    canSave: (result) => result.ok,
    save: async (fileName, result) => {
      if (result.ok) await savePeDailyReport(createClient(), fileName, result.report);
    },
    onSaved: (result) => {
      if (result.ok) onUploaded(result.report.reportDate);
    },
  });

  return (
    <>
      <FilePickerButton inputLabel="Choose the daily report file" onFile={(file) => void chooseFile(file)} />
      {state.phase !== "idle" ? (
        <ModalDialog
          labelledBy="pe-daily-upload-title"
          closeLabel="Close upload"
          onClose={close}
          className="admin-modal"
        >
          <p className="eyebrow">Upload</p>
          <h2 id="pe-daily-upload-title">{state.fileName}</h2>
          {state.phase === "reading" ? <p role="status">Reading file…</p> : null}
          {state.phase === "failed" ? (
            <div className="mutation-notice" role="alert">
              <span>{state.message}</span>
            </div>
          ) : null}
          {state.phase === "review" ? (
            <UploadReview
              result={state.result}
              existingDates={existingDates}
              saving={state.saving}
              saveError={state.saveError}
              onCancel={close}
              onConfirm={() => void confirm()}
            />
          ) : null}
        </ModalDialog>
      ) : null}
    </>
  );
}
```

- [ ] **Step 6: Write the chart settings dialog**

Create `components/pe-daily/chart-settings.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { savePeDailyChartSettings } from "@/lib/pe-daily/mutations";
import { CHART_KEYS, CHART_LABELS, type ChartKey } from "@/lib/pe-daily/types";
import { createClient } from "@/lib/supabase/client";

export function ChartSettings({
  visibleCharts,
  onSaved,
}: {
  visibleCharts: ChartKey[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ChartKey[]>(visibleCharts);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const close = useCallback(() => {
    if (!savingRef.current) setOpen(false);
  }, []);

  function openDialog() {
    setSelected(visibleCharts);
    setSaveError(null);
    setOpen(true);
  }

  function toggle(key: ChartKey) {
    setSelected((current) =>
      CHART_KEYS.filter((candidate) => (candidate === key ? !current.includes(candidate) : current.includes(candidate))),
    );
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await savePeDailyChartSettings(createClient(), selected);
      savingRef.current = false;
      setOpen(false);
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Saving chart settings failed.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary-button" onClick={openDialog}>
        Chart settings
      </button>
      {open ? (
        <ModalDialog
          labelledBy="pe-daily-chart-settings-title"
          closeLabel="Close chart settings"
          onClose={close}
          className="admin-modal"
        >
          <p className="eyebrow">Charts</p>
          <h2 id="pe-daily-chart-settings-title">Chart settings</h2>
          <p>Choose which charts everyone sees on this page.</p>
          <fieldset className="pe-daily-chart-options">
            <legend>Visible charts</legend>
            {CHART_KEYS.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  disabled={saving}
                  onChange={() => toggle(key)}
                />
                {CHART_LABELS[key]}
              </label>
            ))}
          </fieldset>
          {saveError ? (
            <div className="mutation-notice" role="alert">
              <span>{saveError}</span>
            </div>
          ) : null}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : saveError ? "Retry" : "Save"}
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}
```

- [ ] **Step 7: Write the delete control**

Create `components/pe-daily/delete-report.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatReportDate } from "@/lib/pe-daily/format";
import { deletePeDailyReport } from "@/lib/pe-daily/mutations";
import { createClient } from "@/lib/supabase/client";

export function DeleteReport({ reportDate, onDeleted }: { reportDate: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const cancel = useCallback(() => {
    if (!busyRef.current) setConfirming(false);
  }, []);

  async function confirmDelete() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await deletePeDailyReport(createClient(), reportDate);
      setConfirming(false);
      onDeleted();
    } catch (caught) {
      setConfirming(false);
      setError(caught instanceof Error ? caught.message : "Deleting the report failed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="secondary-button delete-confirm-button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Delete this date
      </button>
      {error ? (
        <div className="mutation-notice" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void confirmDelete()}>Retry</button>
        </div>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={`Delete the ${formatReportDate(reportDate)} report?`}
          message="This deletes the uploaded data and the admin-entered sections for this date. This can't be undone."
          confirmLabel="Delete report"
          onConfirm={() => void confirmDelete()}
          onCancel={cancel}
          busy={busy}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 8: Wire the admin tools into the page**

In `components/pe-daily/pe-daily-page.tsx`:

1. Add these imports after `import { ReportSections } from "./report-sections";`:

```tsx
import { ChartSettings } from "./chart-settings";
import { DeleteReport } from "./delete-report";
import { ReportUpload } from "./report-upload";
```

2. Inside `<div className="header-tools">`, add this block immediately before the existing `{dates.length && !loadError ? (`:

```tsx
          {isAdmin ? (
            <div className="pe-daily-admin-tools">
              <ReportUpload
                existingDates={dates}
                onUploaded={(date) => {
                  router.push(reportHref(date));
                  router.refresh();
                }}
              />
              <ChartSettings visibleCharts={visibleCharts} onSaved={refresh} />
              {report ? (
                <DeleteReport
                  reportDate={report.reportDate}
                  onDeleted={() => {
                    router.push(PAGE_PATH);
                    router.refresh();
                  }}
                />
              ) : null}
            </div>
          ) : null}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/pe-daily-admin.test.tsx tests/pe-daily-page.test.tsx tests/pe-daily-manual-section.test.tsx tests/ops-upload.test.tsx tests/ops-requests-page.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS, no type or lint errors, no act() warnings.

- [ ] **Step 10: Commit**

```bash
git add components/ui/use-file-upload.ts components/ui/file-picker-button.tsx components/ops/ops-upload.tsx components/pe-daily tests/pe-daily-admin.test.tsx
git commit -m "feat(pe-daily): add upload, chart settings, and delete for admins"
```

---

### Task 11: Full verification and handoff

**Files:**
- None new. Fixes go to whichever file a check points at.

- [ ] **Step 1: Run every automated check**

```bash
npm run lint && npm run typecheck && npm run test:unit && npm run test:database && npm run build
```

Expected:
- Everything passes, except the 2 known baseline failures in `tests/security-audit-realtime.test.ts`.
- The build lists `ƒ /pe-daily-report` and `ƒ /ops` as dynamic routes.
- Recharts doesn't appear in the `/ops` route's client bundle. Spot-check the build output's per-route sizes: `/pe-daily-report` should be noticeably larger than `/ops`.

- [ ] **Step 2: Check the page in a browser**

Run `npm run dev -- --port 3010`.

Without Supabase environment variables:
- `http://127.0.0.1:3010/pe-daily-report` shows "PE Daily Report" and "No report uploaded yet", with no admin buttons, and includes a `noindex` robots meta tag.
- `/ops` still renders.
- The `/hot-topics` workspace dropdown has no PE Daily Report entry.

With Supabase configured and migration 0034 applied:
1. Sign in as an admin at `/login?next=/pe-daily-report`.
2. Upload `tests/fixtures/pe-daily-report-sample.csv` and confirm the preview "Report for 22 Oct 2026: 29 promos, 11 SMS rows, 7 upselling days".
3. Save, then hover a bar to confirm the tooltip.
4. Toggle a legend item, flip the 1M switch, enable every chart in Chart settings, edit Actions, and switch dates.

Stop the dev server when done.

- [ ] **Step 3: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix(pe-daily): address verification findings"
```

Skip this commit if nothing changed.

- [ ] **Step 4: Hand off for deployment (needs the user's approval)**

Report to the user:
- The code reaches production after it's merged to `main`. Ask before pushing.
- `supabase/migrations/0034_pe_daily_report.sql` must be run once in the Supabase SQL editor.
