# Ops Requests Upload Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `/ops` page, "Ops Requests", where admins upload a service-desk export (CSV or .xlsx) that replaces the stored data, and anyone with the link sees an analytics dashboard built from it.

**Architecture:** The browser parses and validates the file (`lib/ops/parse-sheet.ts`, `lib/ops/normalize.ts`). The rows are saved by one admin-only Postgres function, `replace_ops_requests`, which swaps all rows in a single transaction. The server page loads the rows. A client component computes every metric with pure functions (`lib/ops/analytics.ts`) and renders KPI cards, breakdown tables, a weekly chart, and a searchable request list.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres + RLS + RPC), `exceljs` (new, MIT), Vitest + Testing Library + jsdom, PGlite for database tests.

**Spec:** `docs/superpowers/specs/2026-10-22-ops-requests-upload-design.md`

## Global Constraints

- URL: `/ops` only. Do not add it to the workspace dropdown or link it from other pages.
- Page title: "Ops Requests". The page metadata sets `robots: { index: false, follow: false }`.
- Viewing is public and read-only. Only admins, checked by `public.is_admin()` and `getAdminStatus`, see Upload or can call `replace_ops_requests`.
- Accepted files: `.csv` and `.xlsx`. Anything else is rejected with the message `Upload a .csv or .xlsx file.`
- Every upload replaces all existing rows. There is no merging and no upload history in the UI.
- Statuses: `Open`, `Pending`, `Closed`, matched without regard to case and stored lowercase as `open`, `pending`, `closed`.
- The 11 required headers, matched ignoring case and extra whitespace: `Interaction ID, Status, Assignment Time, Title, Request Title, Description, Requestor Name, Close Date, Closure Code, Closure Comments, Assigned To`.
- Dates are month/day/year with an optional `H:MM` or `H:MM:SS` time, and leading zeros are optional. They are stored as wall-clock `YYYY-MM-DDTHH:MM:SS` with no timezone conversion.
- Any validation error blocks the whole upload, and nothing is saved.
- No charting library. Bars are plain CSS.
- The only new dependency is `exceljs`.
- Code style: match the surrounding code. Comments only for constraints the code can't show.

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/ops/types.ts` | `OpsStatus`, `OpsRequest`, `OpsUpload`, `OpsDataset`, status labels |
| `lib/ops/parse-sheet.ts` | File → `RawSheet` (CSV parser, `.xlsx` via `exceljs`, header normalization, blank-row skipping) |
| `lib/ops/normalize.ts` | `RawSheet` → typed `OpsRequest[]` or a list of errors; month/day/year date parsing |
| `lib/ops/analytics.ts` | Pure metrics: KPIs, closure codes, per-person tables, weekly buckets, filtering, formatting |
| `lib/ops/load.ts` | Server-side reads with pagination |
| `lib/ops/mutations.ts` | Client RPC wrapper `replaceOpsRequests` |
| `supabase/migrations/0033_ops_requests.sql` | Tables, RLS, and the `replace_ops_requests` function |
| `types/database.ts` | Add the two tables and the function |
| `app/ops/page.tsx` | Server page: loads data and admin status, sets `noindex` |
| `components/ops/ops-requests-page.tsx` | Client shell: header, empty state, shared status filter, wiring |
| `components/ops/ops-kpis.tsx` | KPI cards (status cards toggle the list filter) |
| `components/ops/ops-breakdowns.tsx` | Closure-code bars, assignee table, requestor table |
| `components/ops/ops-timeline.tsx` | Weekly assigned vs closed bars |
| `components/ops/ops-ticket-list.tsx` | Search, filters, table, detail dialog |
| `components/ops/ops-upload.tsx` | Upload button, file input, review dialog, replace step |
| `app/globals.css` | `ops-*` styles |
| `tests/fixtures/ops-requests-sample.csv` | Copy of the user's export (19 rows plus blank rows) |
| `tests/fixtures/ops-requests.ts` | Shared `makeOpsRequest`, `sampleRequests`, `SAMPLE_NOW` |
| `tests/ops-parse-sheet.test.ts`, `tests/ops-normalize.test.ts`, `tests/ops-analytics.test.ts`, `tests/ops-load-mutations.test.ts`, `tests/ops-requests-page.test.tsx`, `tests/ops-upload.test.tsx`, `tests/ops-requests-database.test.ts` | Tests |

---

### Task 1: Types and sheet parsing

**Files:**
- Create: `lib/ops/types.ts`
- Create: `lib/ops/parse-sheet.ts`
- Create: `tests/fixtures/ops-requests-sample.csv`
- Test: `tests/ops-parse-sheet.test.ts`
- Modify: `package.json`, `package-lock.json` (adds `exceljs`)

**Interfaces:**
- Produces:
  - `OPS_STATUSES`, `OpsStatus`, `isOpsStatus(value: string): value is OpsStatus`, `OPS_STATUS_LABELS`
  - `OpsRequest`, `OpsUpload`, `OpsDataset`
  - `RawSheet = { headers: string[]; rows: RawRow[] }`, `RawRow = { rowNumber: number; values: Record<string, string> }`. Keys are normalized headers.
  - `normalizeHeader(header: string): string`
  - `parseCsv(text: string): string[][]`
  - `tableToSheet(table: string[][]): RawSheet`
  - `readXlsxTable(buffer: ArrayBuffer): Promise<string[][]>`
  - `parseSheetFile(file: File): Promise<RawSheet>`
  - `formatSheetDate(date: Date): string`

- [ ] **Step 1: Install `exceljs` and copy the sample fixture**

```bash
npm install exceljs@4.4.0
mkdir -p tests/fixtures
cp "/Users/pov/Downloads/export (10).csv" tests/fixtures/ops-requests-sample.csv
```

Expected: `package.json` dependencies include `"exceljs": "^4.4.0"`. The fixture starts with a UTF-8 byte-order mark followed by `Interaction ID,Status,...`.

- [ ] **Step 2: Write the failing tests**

Create `tests/ops-parse-sheet.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import {
  normalizeHeader,
  parseCsv,
  parseSheetFile,
  readXlsxTable,
  tableToSheet,
} from "@/lib/ops/parse-sheet";

const fixturePath = resolve(import.meta.dirname, "fixtures/ops-requests-sample.csv");

async function xlsxBuffer(rows: unknown[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");
  rows.forEach((row) => sheet.addRow(row));
  const written = await workbook.xlsx.writeBuffer();
  return new Uint8Array(written).slice().buffer;
}

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, CRLF, and newlines inside quotes", () => {
    const text = 'a,b,c\r\n"x, y","say ""hi""","line 1\nline 2"\r\n1,2,3';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line 1\nline 2"],
      ["1", "2", "3"],
    ]);
  });

  it("strips a leading byte-order mark", () => {
    expect(parseCsv("\uFEFFID,Status\nSD1,Open")[0]).toEqual(["ID", "Status"]);
  });
});

describe("tableToSheet", () => {
  it("normalizes headers, keeps row numbers, and skips blank rows", () => {
    const sheet = tableToSheet([
      ["  Interaction   ID ", "STATUS"],
      ["SD1", " Open "],
      ["", ""],
      ["SD2", "Closed"],
    ]);
    expect(sheet.headers).toEqual(["interaction id", "status"]);
    expect(sheet.rows).toEqual([
      { rowNumber: 2, values: { "interaction id": "SD1", status: "Open" } },
      { rowNumber: 4, values: { "interaction id": "SD2", status: "Closed" } },
    ]);
  });

  it("fills missing trailing cells with empty strings", () => {
    const sheet = tableToSheet([["a", "b"], ["1"]]);
    expect(sheet.rows[0]?.values).toEqual({ a: "1", b: "" });
  });
});

describe("normalizeHeader", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeHeader("  Close\tDate ")).toBe("close date");
  });
});

describe("parseSheetFile", () => {
  it("reads the sample CSV export into 19 rows", async () => {
    const file = new File([readFileSync(fixturePath)], "export.csv", { type: "text/csv" });
    const sheet = await parseSheetFile(file);
    expect(sheet.headers[0]).toBe("interaction id");
    expect(sheet.rows).toHaveLength(19);
    expect(sheet.rows[0]?.values["interaction id"]).toBe("SD1265202");
    expect(sheet.rows[0]?.values["assignment time"]).toBe("5/17/2026 13:50");
  });

  it("reads the first worksheet of an .xlsx file, including real date cells", async () => {
    const buffer = await xlsxBuffer([
      ["Interaction ID", "Assignment Time", "Status"],
      ["SD1", new Date(Date.UTC(2026, 4, 17, 13, 50)), "Open"],
      [],
    ]);
    const file = new File([buffer], "export.xlsx");
    const sheet = await parseSheetFile(file);
    expect(sheet.rows).toEqual([
      {
        rowNumber: 2,
        values: { "interaction id": "SD1", "assignment time": "5/17/2026 13:50", status: "Open" },
      },
    ]);
  });

  it("rejects other file types", async () => {
    await expect(parseSheetFile(new File(["x"], "notes.txt"))).rejects.toThrow(
      "Upload a .csv or .xlsx file.",
    );
  });
});

describe("readXlsxTable", () => {
  it("returns rich text and formula results as plain text", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Export");
    sheet.addRow(["Title"]);
    sheet.getCell("A2").value = { richText: [{ text: "Hello " }, { text: "world" }] };
    sheet.getCell("A3").value = { formula: "1+1", result: 2 };
    const written = await workbook.xlsx.writeBuffer();
    const table = await readXlsxTable(new Uint8Array(written).slice().buffer);
    expect(table).toEqual([["Title"], ["Hello world"], ["2"]]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/ops-parse-sheet.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/ops/parse-sheet"`.

- [ ] **Step 4: Write the types**

Create `lib/ops/types.ts`:

```ts
export const OPS_STATUSES = ["open", "pending", "closed"] as const;

export type OpsStatus = (typeof OPS_STATUSES)[number];

export const OPS_STATUS_LABELS: Record<OpsStatus, string> = {
  open: "Open",
  pending: "Pending",
  closed: "Closed",
};

export function isOpsStatus(value: string): value is OpsStatus {
  return (OPS_STATUSES as readonly string[]).includes(value);
}

// Request timestamps are wall-clock values formatted as YYYY-MM-DDTHH:MM:SS with no timezone.
export interface OpsRequest {
  interactionId: string;
  status: OpsStatus;
  assignmentTime: string;
  title: string;
  requestTitle: string;
  description: string;
  requestorName: string;
  requestorKey: string;
  closeDate: string | null;
  closureCode: string;
  closureComments: string;
  assignedTo: string;
  assignedToKey: string;
}

export interface OpsUpload {
  uploadedAt: string;
  uploadedByEmail: string | null;
  fileName: string;
  rowCount: number;
}

export interface OpsDataset {
  requests: OpsRequest[];
  upload: OpsUpload | null;
}
```

- [ ] **Step 5: Write the parser**

Create `lib/ops/parse-sheet.ts`:

```ts
import type { CellValue } from "exceljs";

export interface RawRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface RawSheet {
  headers: string[];
  rows: RawRow[];
}

export function normalizeHeader(header: string): string {
  return header.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function tableToSheet(table: string[][]): RawSheet {
  const [headerRow = [], ...body] = table;
  const headers = headerRow.map(normalizeHeader);
  const rows = body
    .map((cells, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        headers.map((header, column) => [header, (cells[column] ?? "").trim()]),
      ),
    }))
    .filter((row) => Object.values(row.values).some((value) => value !== ""));
  return { headers, rows };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatSheetDate(date: Date): string {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()} ${date.getUTCHours()}:${pad(date.getUTCMinutes())}`;
}

function cellToText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatSheetDate(value);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) {
      return value.result === undefined ? "" : cellToText(value.result as CellValue);
    }
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value);
}

export async function readXlsxTable(buffer: ArrayBuffer): Promise<string[][]> {
  const excel = await import("exceljs");
  const Workbook = excel.Workbook
    ?? (excel as unknown as { default: typeof excel }).default.Workbook;
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const table: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cells[column - 1] = cellToText(cell.value);
    });
    table.push(Array.from(cells, (cell) => cell ?? ""));
  });
  return table;
}

export async function parseSheetFile(file: File): Promise<RawSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return tableToSheet(parseCsv(await file.text()));
  if (name.endsWith(".xlsx")) return tableToSheet(await readXlsxTable(await file.arrayBuffer()));
  throw new Error("Upload a .csv or .xlsx file.");
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/ops-parse-sheet.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/ops/types.ts lib/ops/parse-sheet.ts tests/fixtures/ops-requests-sample.csv tests/ops-parse-sheet.test.ts
git commit -m "feat(ops): parse CSV and Excel service-desk exports"
```

---

### Task 2: Row validation and normalization

**Files:**
- Create: `lib/ops/normalize.ts`
- Test: `tests/ops-normalize.test.ts`

**Interfaces:**
- Consumes: `RawSheet`, `normalizeHeader`, `tableToSheet` (Task 1); `OpsRequest`, `isOpsStatus` (Task 1)
- Produces:
  - `REQUIRED_COLUMNS: readonly string[]`, the 11 display labels in spec order
  - `parseSheetDate(value: string): string | null`, returning `YYYY-MM-DDTHH:MM:SS` or `null`
  - `RowError = { rowNumber: number; interactionId: string; message: string }`
  - `NormalizeResult = { ok: true; requests: OpsRequest[] } | { ok: false; missingHeaders: string[]; errors: RowError[] }`
  - `normalizeRequests(sheet: RawSheet): NormalizeResult`

- [ ] **Step 1: Write the failing tests**

Create `tests/ops-normalize.test.ts`:

```ts
// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeRequests, parseSheetDate, REQUIRED_COLUMNS } from "@/lib/ops/normalize";
import { parseCsv, tableToSheet } from "@/lib/ops/parse-sheet";

type Column = (typeof REQUIRED_COLUMNS)[number];

const validRow: Record<Column, string> = {
  "Interaction ID": "SD1",
  Status: "Closed",
  "Assignment Time": "5/17/2026 13:50",
  Title: "New Task",
  "Request Title": "Deploy report",
  Description: "Deploy the new report",
  "Requestor Name": "NFawzy",
  "Close Date": "5/18/2026 9:05",
  "Closure Code": "Successful",
  "Closure Comments": "Done",
  "Assigned To": "helghandour",
};

function sheetOf(rows: Array<Partial<Record<Column, string>>>, columns: readonly string[] = REQUIRED_COLUMNS) {
  return tableToSheet([
    [...columns],
    ...rows.map((row) => columns.map((column) => row[column as Column] ?? "")),
  ]);
}

describe("parseSheetDate", () => {
  it.each([
    ["5/17/2026 13:50", "2026-05-17T13:50:00"],
    ["06/09/2026 14:53", "2026-06-09T14:53:00"],
    ["6/16/2026 2:22", "2026-06-16T02:22:00"],
    ["5/17/2026", "2026-05-17T00:00:00"],
    ["5/17/2026 13:50:07", "2026-05-17T13:50:07"],
  ])("parses %s", (input, expected) => {
    expect(parseSheetDate(input)).toBe(expected);
  });

  it.each(["2/30/2026", "13/01/2026", "2026-05-17", "5/17/2026 24:00", "5/17/2026 10:60", "soon", ""])(
    "rejects %s",
    (input) => {
      expect(parseSheetDate(input)).toBeNull();
    },
  );
});

describe("normalizeRequests", () => {
  it("turns the sample export into 19 valid requests", () => {
    const text = readFileSync(resolve(import.meta.dirname, "fixtures/ops-requests-sample.csv"), "utf8");
    const result = normalizeRequests(tableToSheet(parseCsv(text)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requests).toHaveLength(19);
    expect(result.requests[0]).toEqual({
      interactionId: "SD1265202",
      status: "closed",
      assignmentTime: "2026-05-17T13:50:00",
      title: "New Task",
      requestTitle: "test",
      description: "test",
      requestorName: "rshalim",
      requestorKey: "rshalim",
      closeDate: "2026-06-15T16:35:00",
      closureCode: "Successful",
      closureComments: "testing",
      assignedTo: "helghandour",
      assignedToKey: "helghandour",
    });
  });

  it("matches statuses without regard to case and lowercases person keys", () => {
    const result = normalizeRequests(sheetOf([
      { ...validRow, Status: "PENDING", "Close Date": "", "Requestor Name": "HElGhandour", "Assigned To": "AmdElsabban" },
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requests[0]).toMatchObject({
      status: "pending",
      closeDate: null,
      requestorName: "HElGhandour",
      requestorKey: "helghandour",
      assignedTo: "AmdElsabban",
      assignedToKey: "amdelsabban",
    });
  });

  it("reports missing headers in spec order and stops", () => {
    const columns = REQUIRED_COLUMNS.filter((column) => column !== "Closure Code" && column !== "Assigned To");
    const result = normalizeRequests(sheetOf([validRow], columns));
    expect(result).toEqual({ ok: false, missingHeaders: ["Closure Code", "Assigned To"], errors: [] });
  });

  it("accepts headers in any order, any case, and with extra columns", () => {
    const columns = ["extra", ...[...REQUIRED_COLUMNS].reverse().map((column) => column.toUpperCase())];
    const table = [
      columns,
      columns.map((column) => {
        const match = REQUIRED_COLUMNS.find((required) => required.toUpperCase() === column);
        return match ? validRow[match as Column] : "ignored";
      }),
    ];
    const result = normalizeRequests(tableToSheet(table));
    expect(result.ok).toBe(true);
  });

  it("lists every failing row with its row number, ID, and reason", () => {
    const result = normalizeRequests(sheetOf([
      validRow,
      { ...validRow, "Interaction ID": "" },
      { ...validRow, "Interaction ID": "SD1" },
      { ...validRow, "Interaction ID": "SD3", Status: "Resolved" },
      { ...validRow, "Interaction ID": "SD4", "Assignment Time": "" },
      { ...validRow, "Interaction ID": "SD5", "Assignment Time": "31/31/2026" },
      { ...validRow, "Interaction ID": "SD6", "Close Date": "tomorrow" },
      { ...validRow, "Interaction ID": "SD7", "Close Date": "5/16/2026 13:50" },
    ]));
    expect(result).toEqual({
      ok: false,
      missingHeaders: [],
      errors: [
        { rowNumber: 3, interactionId: "", message: "Interaction ID is required." },
        { rowNumber: 4, interactionId: "SD1", message: "Duplicate Interaction ID (also on row 2)." },
        { rowNumber: 5, interactionId: "SD3", message: 'Unrecognized status "Resolved". Use Open, Pending, or Closed.' },
        { rowNumber: 6, interactionId: "SD4", message: "Assignment Time is required." },
        { rowNumber: 7, interactionId: "SD5", message: 'Unrecognized assignment time "31/31/2026". Use month/day/year.' },
        { rowNumber: 8, interactionId: "SD6", message: 'Unrecognized close date "tomorrow". Use month/day/year.' },
        { rowNumber: 9, interactionId: "SD7", message: "Close Date is earlier than Assignment Time." },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ops-normalize.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/ops/normalize"`.

- [ ] **Step 3: Write the implementation**

Create `lib/ops/normalize.ts`:

```ts
import { normalizeHeader, type RawSheet } from "./parse-sheet";
import { isOpsStatus, type OpsRequest } from "./types";

export const REQUIRED_COLUMNS = [
  "Interaction ID",
  "Status",
  "Assignment Time",
  "Title",
  "Request Title",
  "Description",
  "Requestor Name",
  "Close Date",
  "Closure Code",
  "Closure Comments",
  "Assigned To",
] as const;

export interface RowError {
  rowNumber: number;
  interactionId: string;
  message: string;
}

export type NormalizeResult =
  | { ok: true; requests: OpsRequest[] }
  | { ok: false; missingHeaders: string[]; errors: RowError[] };

const DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export function parseSheetDate(value: string): string | null {
  const match = value.trim().match(DATE_PATTERN);
  if (!match) return null;
  const [, month, day, year, hour = "0", minute = "0", second = "0"] = match;
  const parts = [month, day, year, hour, minute, second].map(Number);
  const [m, d, y, h, min, s] = parts;
  if (h > 23 || min > 59 || s > 59) return null;
  const date = new Date(Date.UTC(y, m - 1, d, h, min, s));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString().slice(0, 19);
}

export function normalizeRequests(sheet: RawSheet): NormalizeResult {
  const missingHeaders = REQUIRED_COLUMNS.filter(
    (column) => !sheet.headers.includes(normalizeHeader(column)),
  );
  if (missingHeaders.length) return { ok: false, missingHeaders, errors: [] };

  const errors: RowError[] = [];
  const requests: OpsRequest[] = [];
  const seenIds = new Map<string, number>();

  for (const row of sheet.rows) {
    const value = (column: (typeof REQUIRED_COLUMNS)[number]) =>
      row.values[normalizeHeader(column)] ?? "";
    const interactionId = value("Interaction ID");
    const fail = (message: string) => {
      errors.push({ rowNumber: row.rowNumber, interactionId, message });
    };

    if (!interactionId) {
      fail("Interaction ID is required.");
      continue;
    }
    const firstRow = seenIds.get(interactionId);
    if (firstRow !== undefined) {
      fail(`Duplicate Interaction ID (also on row ${firstRow}).`);
      continue;
    }
    seenIds.set(interactionId, row.rowNumber);

    const status = value("Status").toLowerCase();
    if (!isOpsStatus(status)) {
      fail(`Unrecognized status "${value("Status")}". Use Open, Pending, or Closed.`);
      continue;
    }

    const assignmentRaw = value("Assignment Time");
    if (!assignmentRaw) {
      fail("Assignment Time is required.");
      continue;
    }
    const assignmentTime = parseSheetDate(assignmentRaw);
    if (!assignmentTime) {
      fail(`Unrecognized assignment time "${assignmentRaw}". Use month/day/year.`);
      continue;
    }

    const closeRaw = value("Close Date");
    let closeDate: string | null = null;
    if (closeRaw) {
      closeDate = parseSheetDate(closeRaw);
      if (!closeDate) {
        fail(`Unrecognized close date "${closeRaw}". Use month/day/year.`);
        continue;
      }
      if (closeDate < assignmentTime) {
        fail("Close Date is earlier than Assignment Time.");
        continue;
      }
    }

    const requestorName = value("Requestor Name");
    const assignedTo = value("Assigned To");
    requests.push({
      interactionId,
      status,
      assignmentTime,
      title: value("Title"),
      requestTitle: value("Request Title"),
      description: value("Description"),
      requestorName,
      requestorKey: requestorName.toLowerCase(),
      closeDate,
      closureCode: value("Closure Code"),
      closureComments: value("Closure Comments"),
      assignedTo,
      assignedToKey: assignedTo.toLowerCase(),
    });
  }

  return errors.length ? { ok: false, missingHeaders: [], errors } : { ok: true, requests };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ops-normalize.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ops/normalize.ts tests/ops-normalize.test.ts
git commit -m "feat(ops): validate and normalize uploaded request rows"
```

---

### Task 3: Analytics

**Files:**
- Create: `lib/ops/analytics.ts`
- Create: `tests/fixtures/ops-requests.ts`
- Test: `tests/ops-analytics.test.ts`

**Interfaces:**
- Consumes: `OpsRequest`, `OpsStatus`, `OPS_STATUSES` (Task 1)
- Produces:
  - `HOUR_MS`, `DAY_MS`
  - `timestampMs(value: string): number`, which reads a wall-clock timestamp as UTC milliseconds
  - `wallClockNow(now?: Date): number`
  - `resolutionMs(request: OpsRequest): number | null`
  - `countByStatus(requests: OpsRequest[]): Record<OpsStatus, number>`
  - `OpsKpis` and `summarizeKpis(requests: OpsRequest[], nowMs: number | null): OpsKpis`
  - `ClosureCodeRow` and `breakdownByClosureCode(requests): ClosureCodeRow[]`
  - `PersonRow` and `groupByPerson(requests, field: "assignee" | "requestor"): PersonRow[]`
  - `WeekBucket` and `weeklyBuckets(requests): WeekBucket[]`
  - `OpsStatusFilter = OpsStatus | "all"`, `RequestFilters`, and `filterRequests(requests, filters): OpsRequest[]`
  - `formatDuration(ms: number | null): string`, `formatPercent(rate: number | null): string`, `formatTimestamp(value: string | null): string`, `formatWeekLabel(weekStart: string): string`, `formatUploadedAt(value: string): string`
  - Test helpers `makeOpsRequest`, `sampleRequests`, `SAMPLE_NOW` in `tests/fixtures/ops-requests.ts`

- [ ] **Step 1: Write the shared test fixture**

Create `tests/fixtures/ops-requests.ts`:

```ts
import type { OpsRequest } from "@/lib/ops/types";

export function makeOpsRequest(overrides: Partial<OpsRequest> = {}): OpsRequest {
  return {
    interactionId: "SD1000",
    status: "closed",
    assignmentTime: "2026-05-04T09:00:00",
    title: "New Task",
    requestTitle: "Request",
    description: "",
    requestorName: "NFawzy",
    requestorKey: "nfawzy",
    closeDate: "2026-05-04T11:00:00",
    closureCode: "Successful",
    closureComments: "",
    assignedTo: "HElGhandour",
    assignedToKey: "helghandour",
    ...overrides,
  };
}

export const SAMPLE_NOW = "2026-05-21T08:00:00";

export const sampleRequests: OpsRequest[] = [
  makeOpsRequest({
    interactionId: "SD1001",
    requestTitle: "Report deploy",
    closureComments: "Deployed on production",
  }),
  makeOpsRequest({
    interactionId: "SD1002",
    requestTitle: "Merge request 2401",
    assignmentTime: "2026-05-05T09:00:00",
    closeDate: "2026-05-07T09:00:00",
    requestorName: "nfawzy",
    assignedTo: "helghandour",
  }),
  makeOpsRequest({
    interactionId: "SD1003",
    requestTitle: "World cup card",
    assignmentTime: "2026-05-12T10:00:00",
    closeDate: "2026-05-12T10:30:00",
    closureCode: "Failed",
    requestorName: "AhKamel",
    requestorKey: "ahkamel",
    assignedTo: "amdelsabban",
    assignedToKey: "amdelsabban",
  }),
  makeOpsRequest({
    interactionId: "SD1004",
    status: "open",
    requestTitle: "Quota offer",
    description: "Double quota for the attached customer list",
    assignmentTime: "2026-05-13T08:00:00",
    closeDate: null,
    closureCode: "",
    requestorName: "rshalim",
    requestorKey: "rshalim",
    assignedTo: "amdelsabban",
    assignedToKey: "amdelsabban",
  }),
  makeOpsRequest({
    interactionId: "SD1005",
    status: "pending",
    requestTitle: "Plan schedule",
    assignmentTime: "2026-05-20T08:00:00",
    closeDate: null,
    closureCode: "",
    assignedTo: "",
    assignedToKey: "",
  }),
];
```

- [ ] **Step 2: Write the failing tests**

Create `tests/ops-analytics.test.ts`:

```ts
// @vitest-environment node

import {
  breakdownByClosureCode,
  DAY_MS,
  filterRequests,
  formatDuration,
  formatPercent,
  formatTimestamp,
  formatUploadedAt,
  formatWeekLabel,
  groupByPerson,
  HOUR_MS,
  resolutionMs,
  summarizeKpis,
  timestampMs,
  wallClockNow,
  weeklyBuckets,
} from "@/lib/ops/analytics";
import { makeOpsRequest, SAMPLE_NOW, sampleRequests } from "./fixtures/ops-requests";

const ids = (requests: { interactionId: string }[]) => requests.map((request) => request.interactionId);

describe("time helpers", () => {
  it("reads wall-clock timestamps without timezone shifts", () => {
    expect(timestampMs("2026-05-17T13:50:00")).toBe(Date.UTC(2026, 4, 17, 13, 50));
    expect(timestampMs("2026-05-17T13:50:00.000")).toBe(Date.UTC(2026, 4, 17, 13, 50));
  });

  it("turns the local clock into the same wall-clock frame", () => {
    const now = new Date(2026, 4, 21, 8, 0, 0);
    expect(wallClockNow(now)).toBe(timestampMs("2026-05-21T08:00:00"));
  });

  it("measures resolution only for closed requests with a close date", () => {
    expect(resolutionMs(sampleRequests[0])).toBe(2 * HOUR_MS);
    expect(resolutionMs(sampleRequests[3])).toBeNull();
    expect(resolutionMs(makeOpsRequest({ status: "closed", closeDate: null }))).toBeNull();
  });
});

describe("summarizeKpis", () => {
  it("counts statuses, closure rate, resolution, and open aging", () => {
    const kpis = summarizeKpis(sampleRequests, timestampMs(SAMPLE_NOW));
    expect(kpis).toEqual({
      total: 5,
      counts: { open: 1, pending: 1, closed: 3 },
      closureRate: 0.6,
      avgResolutionMs: (50.5 * HOUR_MS) / 3,
      medianResolutionMs: 2 * HOUR_MS,
      avgOpenAgeMs: 4.5 * DAY_MS,
      oldestOpenAgeMs: 8 * DAY_MS,
    });
  });

  it("leaves aging empty until the clock is known, and handles no rows", () => {
    expect(summarizeKpis(sampleRequests, null).avgOpenAgeMs).toBeNull();
    expect(summarizeKpis([], 0)).toMatchObject({
      total: 0,
      closureRate: null,
      avgResolutionMs: null,
      medianResolutionMs: null,
      avgOpenAgeMs: null,
      oldestOpenAgeMs: null,
    });
  });
});

describe("breakdownByClosureCode", () => {
  it("groups codes, puts missing codes under (none), and sorts by count", () => {
    expect(breakdownByClosureCode(sampleRequests)).toEqual([
      { label: "Successful", count: 2, share: 0.4 },
      { label: "(none)", count: 2, share: 0.4 },
      { label: "Failed", count: 1, share: 0.2 },
    ]);
  });
});

describe("groupByPerson", () => {
  it("groups assignees case-insensitively with resolution times", () => {
    expect(groupByPerson(sampleRequests, "assignee")).toEqual([
      {
        key: "amdelsabban",
        name: "amdelsabban",
        total: 2,
        counts: { open: 1, pending: 0, closed: 1 },
        avgResolutionMs: 0.5 * HOUR_MS,
        medianResolutionMs: 0.5 * HOUR_MS,
      },
      {
        key: "helghandour",
        name: "HElGhandour",
        total: 2,
        counts: { open: 0, pending: 0, closed: 2 },
        avgResolutionMs: 25 * HOUR_MS,
        medianResolutionMs: 25 * HOUR_MS,
      },
      {
        key: "",
        name: "(none)",
        total: 1,
        counts: { open: 0, pending: 1, closed: 0 },
        avgResolutionMs: null,
        medianResolutionMs: null,
      },
    ]);
  });

  it("uses the most common spelling for requestors", () => {
    expect(groupByPerson(sampleRequests, "requestor").map((row) => [row.name, row.total])).toEqual([
      ["NFawzy", 3],
      ["AhKamel", 1],
      ["rshalim", 1],
    ]);
  });
});

describe("weeklyBuckets", () => {
  it("buckets assigned and closed counts into Monday weeks without gaps", () => {
    expect(weeklyBuckets(sampleRequests)).toEqual([
      { weekStart: "2026-05-04", assigned: 2, closed: 2 },
      { weekStart: "2026-05-11", assigned: 2, closed: 1 },
      { weekStart: "2026-05-18", assigned: 1, closed: 0 },
    ]);
  });

  it("returns no buckets for no rows", () => {
    expect(weeklyBuckets([])).toEqual([]);
  });
});

describe("filterRequests", () => {
  it("filters by status and assignee and sorts newest first", () => {
    expect(ids(filterRequests(sampleRequests, { status: "closed", assigneeKey: "all", query: "" })))
      .toEqual(["SD1003", "SD1002", "SD1001"]);
    expect(ids(filterRequests(sampleRequests, { status: "all", assigneeKey: "helghandour", query: "" })))
      .toEqual(["SD1002", "SD1001"]);
  });

  it("searches ID, titles, description, people, and comments without regard to case", () => {
    const search = (query: string) =>
      ids(filterRequests(sampleRequests, { status: "all", assigneeKey: "all", query }));
    expect(search("kamel")).toEqual(["SD1003"]);
    expect(search("CUSTOMER LIST")).toEqual(["SD1004"]);
    expect(search("production")).toEqual(["SD1001"]);
    expect(search("sd1002")).toEqual(["SD1002"]);
  });
});

describe("formatting", () => {
  it("formats durations in minutes, hours, or days", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(30 * 60_000)).toBe("30m");
    expect(formatDuration(2 * HOUR_MS)).toBe("2.0h");
    expect(formatDuration(48 * HOUR_MS)).toBe("2.0d");
  });

  it("formats percentages, timestamps, and week labels", () => {
    expect(formatPercent(0.6)).toBe("60%");
    expect(formatPercent(null)).toBe("—");
    expect(formatTimestamp("2026-05-17T13:50:00")).toBe("May 17, 2026 13:50");
    expect(formatTimestamp(null)).toBe("—");
    expect(formatWeekLabel("2026-05-04")).toBe("May 4");
  });

  it("formats upload times in Cairo time", () => {
    expect(formatUploadedAt("2026-10-22T07:45:00Z")).toBe("Oct 22, 2026, 10:45 AM");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/ops-analytics.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/ops/analytics"`.

- [ ] **Step 4: Write the implementation**

Create `lib/ops/analytics.ts`:

```ts
import { OPS_STATUSES, type OpsRequest, type OpsStatus } from "./types";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NONE_LABEL = "(none)";

export type OpsStatusFilter = OpsStatus | "all";

export interface RequestFilters {
  status: OpsStatusFilter;
  assigneeKey: string;
  query: string;
}

export interface OpsKpis {
  total: number;
  counts: Record<OpsStatus, number>;
  closureRate: number | null;
  avgResolutionMs: number | null;
  medianResolutionMs: number | null;
  avgOpenAgeMs: number | null;
  oldestOpenAgeMs: number | null;
}

export interface ClosureCodeRow {
  label: string;
  count: number;
  share: number;
}

export interface PersonRow {
  key: string;
  name: string;
  total: number;
  counts: Record<OpsStatus, number>;
  avgResolutionMs: number | null;
  medianResolutionMs: number | null;
}

export interface WeekBucket {
  weekStart: string;
  assigned: number;
  closed: number;
}

export function timestampMs(value: string): number {
  const [datePart, timePart = "00:00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

export function wallClockNow(now = new Date()): number {
  return Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
}

export function resolutionMs(request: OpsRequest): number | null {
  if (request.status !== "closed" || !request.closeDate) return null;
  return timestampMs(request.closeDate) - timestampMs(request.assignmentTime);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function resolutions(requests: OpsRequest[]): number[] {
  return requests.map(resolutionMs).filter((value): value is number => value !== null);
}

export function countByStatus(requests: OpsRequest[]): Record<OpsStatus, number> {
  const counts = Object.fromEntries(OPS_STATUSES.map((status) => [status, 0])) as Record<OpsStatus, number>;
  requests.forEach((request) => {
    counts[request.status] += 1;
  });
  return counts;
}

export function summarizeKpis(requests: OpsRequest[], nowMs: number | null): OpsKpis {
  const counts = countByStatus(requests);
  const resolved = resolutions(requests);
  const openAges = nowMs === null
    ? []
    : requests
        .filter((request) => request.status !== "closed")
        .map((request) => Math.max(0, nowMs - timestampMs(request.assignmentTime)));
  return {
    total: requests.length,
    counts,
    closureRate: requests.length ? counts.closed / requests.length : null,
    avgResolutionMs: average(resolved),
    medianResolutionMs: median(resolved),
    avgOpenAgeMs: average(openAges),
    oldestOpenAgeMs: openAges.length ? Math.max(...openAges) : null,
  };
}

function byCountThenLabel(a: { count: number; label: string }, b: { count: number; label: string }) {
  if (b.count !== a.count) return b.count - a.count;
  if (a.label === NONE_LABEL) return 1;
  if (b.label === NONE_LABEL) return -1;
  return a.label.localeCompare(b.label);
}

export function breakdownByClosureCode(requests: OpsRequest[]): ClosureCodeRow[] {
  const counts = new Map<string, number>();
  requests.forEach((request) => {
    const label = request.closureCode || NONE_LABEL;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: count / requests.length }))
    .sort(byCountThenLabel);
}

export function groupByPerson(
  requests: OpsRequest[],
  field: "assignee" | "requestor",
): PersonRow[] {
  const groups = new Map<string, {
    requests: OpsRequest[];
    spellings: Map<string, { count: number; firstIndex: number }>;
  }>();

  requests.forEach((request, index) => {
    const key = field === "assignee" ? request.assignedToKey : request.requestorKey;
    const name = field === "assignee" ? request.assignedTo : request.requestorName;
    const group = groups.get(key) ?? { requests: [], spellings: new Map() };
    group.requests.push(request);
    const spelling = group.spellings.get(name) ?? { count: 0, firstIndex: index };
    spelling.count += 1;
    group.spellings.set(name, spelling);
    groups.set(key, group);
  });

  return [...groups.entries()]
    .map(([key, group]) => {
      const [name] = [...group.spellings.entries()].sort(
        ([, a], [, b]) => b.count - a.count || a.firstIndex - b.firstIndex,
      )[0];
      const resolved = resolutions(group.requests);
      return {
        key,
        name: key ? name : NONE_LABEL,
        total: group.requests.length,
        counts: countByStatus(group.requests),
        avgResolutionMs: average(resolved),
        medianResolutionMs: median(resolved),
      };
    })
    .sort((a, b) => byCountThenLabel(
      { count: a.total, label: a.name },
      { count: b.total, label: b.name },
    ));
}

function weekStartMs(ms: number): number {
  const date = new Date(ms);
  const offset = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offset);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function weeklyBuckets(requests: OpsRequest[]): WeekBucket[] {
  const assigned = new Map<number, number>();
  const closed = new Map<number, number>();
  requests.forEach((request) => {
    const assignedWeek = weekStartMs(timestampMs(request.assignmentTime));
    assigned.set(assignedWeek, (assigned.get(assignedWeek) ?? 0) + 1);
    if (request.closeDate) {
      const closedWeek = weekStartMs(timestampMs(request.closeDate));
      closed.set(closedWeek, (closed.get(closedWeek) ?? 0) + 1);
    }
  });

  const weeks = [...assigned.keys(), ...closed.keys()];
  if (!weeks.length) return [];
  const buckets: WeekBucket[] = [];
  for (let week = Math.min(...weeks); week <= Math.max(...weeks); week += 7 * DAY_MS) {
    buckets.push({
      weekStart: isoDate(week),
      assigned: assigned.get(week) ?? 0,
      closed: closed.get(week) ?? 0,
    });
  }
  return buckets;
}

export function filterRequests(requests: OpsRequest[], filters: RequestFilters): OpsRequest[] {
  const query = filters.query.trim().toLowerCase();
  return requests
    .filter((request) => filters.status === "all" || request.status === filters.status)
    .filter((request) => filters.assigneeKey === "all" || request.assignedToKey === filters.assigneeKey)
    .filter((request) => !query || [
      request.interactionId,
      request.title,
      request.requestTitle,
      request.description,
      request.requestorName,
      request.assignedTo,
      request.closureComments,
    ].some((value) => value.toLowerCase().includes(query)))
    .sort((a, b) => b.assignmentTime.localeCompare(a.assignmentTime));
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < HOUR_MS) return `${Math.round(ms / 60_000)}m`;
  if (ms < DAY_MS) return `${(ms / HOUR_MS).toFixed(1)}h`;
  return `${(ms / DAY_MS).toFixed(1)}d`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(timestampMs(value));
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} ${hours}:${minutes}`;
}

export function formatWeekLabel(weekStart: string): string {
  const date = new Date(timestampMs(weekStart));
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

const uploadedAtFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Cairo",
});

export function formatUploadedAt(value: string): string {
  return uploadedAtFormatter.format(new Date(value));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ops-analytics.test.ts`
Expected: PASS (15 tests). If `formatUploadedAt` fails only because the Node ICU build puts a narrow no-break space before `AM`, change the expectation to `toMatch(/^Oct 22, 2026, 10:45\sAM$/)`. Leave the formatter as it is.

- [ ] **Step 6: Commit**

```bash
git add lib/ops/analytics.ts tests/fixtures/ops-requests.ts tests/ops-analytics.test.ts
git commit -m "feat(ops): compute request KPIs, breakdowns, and weekly trends"
```

---

### Task 4: Database migration, types, and database test

**Files:**
- Create: `supabase/migrations/0033_ops_requests.sql`
- Modify: `types/database.ts` (Tables and Functions)
- Modify: `package.json` (`test:unit` exclude, `test:database` include)
- Test: `tests/ops-requests-database.test.ts`

**Interfaces:**
- Consumes: `public.is_admin()`, `public.admin_users(auth_user_id, email)`, and `auth.users` from migrations 0001 and 0002
- Produces:
  - Tables `public.ops_requests` and `public.ops_request_uploads`, with columns exactly as in the SQL below
  - RPC `replace_ops_requests(p_file_name text, p_rows jsonb) returns uuid`. Each `p_rows` element has keys `interaction_id, status, assignment_time, title, request_title, description, requestor_name, requestor_key, close_date, closure_code, closure_comments, assigned_to, assigned_to_key`.
  - `Database["public"]["Tables"]["ops_requests" | "ops_request_uploads"]` and `Database["public"]["Functions"]["replace_ops_requests"]`

- [ ] **Step 1: Write the failing database test**

Create `tests/ops-requests-database.test.ts`:

```ts
// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

function row(interactionId: string, overrides: Record<string, string | null> = {}) {
  return {
    interaction_id: interactionId,
    status: "closed",
    assignment_time: "2026-05-17T13:50:00",
    title: "New Task",
    request_title: `Request ${interactionId}`,
    description: "",
    requestor_name: "NFawzy",
    requestor_key: "nfawzy",
    close_date: "2026-05-18T09:05:00",
    closure_code: "Successful",
    closure_comments: "Done",
    assigned_to: "helghandour",
    assigned_to_key: "helghandour",
    ...overrides,
  };
}

async function setIdentity(db: PGlite, role: "anon" | "authenticated", id?: string) {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${id ?? ""}', true); set local role ${role};`,
  );
}

async function replace(db: PGlite, fileName: string, rows: unknown[]) {
  return db.query<{ id: string }>(
    "select public.replace_ops_requests($1, $2::jsonb) as id",
    [fileName, JSON.stringify(rows)],
  );
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

async function interactionIds(db: PGlite) {
  const result = await db.query<{ interaction_id: string }>(
    "select interaction_id from public.ops_requests order by interaction_id",
  );
  return result.rows.map((entry) => entry.interaction_id);
}

describe("ops requests database", () => {
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
    await db.exec(read("supabase/migrations/0033_ops_requests.sql"));
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

  it("lets anonymous visitors read but not write", async () => {
    await setIdentity(db, "anon");
    const count = await db.query<{ count: number }>(
      "select count(*)::int as count from public.ops_requests",
    );
    expect(count.rows[0]?.count).toBe(0);
    await expectError(
      db,
      () => db.exec(`insert into public.ops_requests (interaction_id, status, assignment_time, upload_id)
        values ('SD1', 'open', now(), gen_random_uuid())`),
      /permission denied/i,
    );
    await expectError(db, () => replace(db, "a.csv", [row("SD1")]), /permission denied/i);
  });

  it("rejects replace calls from signed-in non-admins", async () => {
    await setIdentity(db, "authenticated", USER_ID);
    await expectError(db, () => replace(db, "a.csv", [row("SD1")]), /admin access required/i);
  });

  it("replaces every row and records the upload for admins", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "first.csv", [row("SD1"), row("SD2", { status: "open", close_date: null })]);
    expect(await interactionIds(db)).toEqual(["SD1", "SD2"]);

    const second = await replace(db, "second.xlsx", [row("SD3", { status: "PENDING", close_date: null })]);
    expect(await interactionIds(db)).toEqual(["SD3"]);

    const stored = await db.query<{ status: string; upload_id: string }>(
      "select status, upload_id from public.ops_requests",
    );
    expect(stored.rows[0]).toEqual({ status: "pending", upload_id: second.rows[0]?.id });

    const upload = await db.query<{ file_name: string; row_count: number; uploaded_by_email: string }>(
      "select file_name, row_count, uploaded_by_email from public.ops_request_uploads where id = $1",
      [second.rows[0]?.id],
    );
    expect(upload.rows[0]).toEqual({
      file_name: "second.xlsx",
      row_count: 1,
      uploaded_by_email: "admin@example.com",
    });
  });

  it("keeps the previous rows when a replace fails", async () => {
    await setIdentity(db, "authenticated", ADMIN_ID);
    await replace(db, "first.csv", [row("SD1"), row("SD2")]);

    await expectError(db, () => replace(db, "dupes.csv", [row("SD9"), row("SD9")]), /duplicate key/i);
    await expectError(db, () => replace(db, "bad.csv", [row("SD8", { status: "resolved" })]), /check constraint/i);
    await expectError(
      db,
      () => replace(db, "early.csv", [row("SD7", { close_date: "2026-05-01T00:00:00" })]),
      /check constraint/i,
    );
    await expectError(db, () => db.query("select public.replace_ops_requests('x.csv', '{}'::jsonb)"), /array/i);

    expect(await interactionIds(db)).toEqual(["SD1", "SD2"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ops-requests-database.test.ts`
Expected: FAIL with `ENOENT ... supabase/migrations/0033_ops_requests.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0033_ops_requests.sql`:

```sql
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ops-requests-database.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the database types**

In `types/database.ts`, insert this block inside `Tables: {`, immediately before the line `      statuses: {`:

```ts
      ops_request_uploads: {
        Row: {
          file_name: string;
          id: string;
          row_count: number;
          uploaded_at: string;
          uploaded_by: string | null;
          uploaded_by_email: string | null;
        };
        Insert: {
          file_name: string;
          id?: string;
          row_count: number;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_email?: string | null;
        };
        Update: {
          file_name?: string;
          id?: string;
          row_count?: number;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_email?: string | null;
        };
        Relationships: [];
      };
      ops_requests: {
        Row: {
          assigned_to: string;
          assigned_to_key: string;
          assignment_time: string;
          close_date: string | null;
          closure_code: string;
          closure_comments: string;
          description: string;
          id: string;
          interaction_id: string;
          request_title: string;
          requestor_key: string;
          requestor_name: string;
          status: string;
          title: string;
          upload_id: string;
        };
        Insert: {
          assigned_to?: string;
          assigned_to_key?: string;
          assignment_time: string;
          close_date?: string | null;
          closure_code?: string;
          closure_comments?: string;
          description?: string;
          id?: string;
          interaction_id: string;
          request_title?: string;
          requestor_key?: string;
          requestor_name?: string;
          status: string;
          title?: string;
          upload_id: string;
        };
        Update: {
          assigned_to?: string;
          assigned_to_key?: string;
          assignment_time?: string;
          close_date?: string | null;
          closure_code?: string;
          closure_comments?: string;
          description?: string;
          id?: string;
          interaction_id?: string;
          request_title?: string;
          requestor_key?: string;
          requestor_name?: string;
          status?: string;
          title?: string;
          upload_id?: string;
        };
        Relationships: [];
      };
```

In the same file, inside `Functions: {`, insert this line immediately after `      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };`:

```ts
      replace_ops_requests: { Args: { p_file_name: string; p_rows: Json }; Returns: string };
```

If `      statuses: {` appears more than once, use the first occurrence, which is the `Tables` entry.

- [ ] **Step 6: Register the database test in the npm scripts**

In `package.json`:
- Append ` --exclude tests/ops-requests-database.test.ts` to the end of the `test:unit` command string.
- Append ` tests/ops-requests-database.test.ts` to the end of the `test:database` command string.

- [ ] **Step 7: Verify types and scripts**

Run: `npx tsc --noEmit && npm run test:database`
Expected: no type errors; all database test files pass, including `tests/ops-requests-database.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0033_ops_requests.sql types/database.ts package.json tests/ops-requests-database.test.ts
git commit -m "feat(ops): add ops_requests tables and admin replace function"
```

---

### Task 5: Data loading and the replace call

**Files:**
- Create: `lib/ops/load.ts`
- Create: `lib/ops/mutations.ts`
- Test: `tests/ops-load-mutations.test.ts`

**Interfaces:**
- Consumes: `Database`, `Tables`, `Json` from `@/types/database` (Task 4); `OpsDataset`, `OpsRequest`, `OpsStatus` (Task 1)
- Produces:
  - `OPS_PAGE_SIZE = 1000`
  - `mapOpsRequestRow(row: Tables<"ops_requests">): OpsRequest`
  - `loadOpsDataset(client: SupabaseClient<Database> | null): Promise<OpsDataset>`, which throws an `Error` with the message `Could not load Ops Requests: …`
  - `toReplaceRows(requests: OpsRequest[]): OpsReplaceRow[]`
  - `replaceOpsRequests(supabase: SupabaseClient<Database>, fileName: string, requests: OpsRequest[]): Promise<string>`

- [ ] **Step 1: Write the failing tests**

Create `tests/ops-load-mutations.test.ts`:

```ts
// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOpsDataset, mapOpsRequestRow, OPS_PAGE_SIZE } from "@/lib/ops/load";
import { replaceOpsRequests, toReplaceRows } from "@/lib/ops/mutations";
import type { Database, Tables } from "@/types/database";
import { makeOpsRequest } from "./fixtures/ops-requests";

function dbRow(id: string, overrides: Partial<Tables<"ops_requests">> = {}): Tables<"ops_requests"> {
  return {
    id: `uuid-${id}`,
    interaction_id: id,
    status: "closed",
    assignment_time: "2026-05-17T13:50:00",
    title: "New Task",
    request_title: "Deploy",
    description: "Deploy report",
    requestor_name: "NFawzy",
    requestor_key: "nfawzy",
    close_date: "2026-05-18T09:05:00",
    closure_code: "Successful",
    closure_comments: "Done",
    assigned_to: "helghandour",
    assigned_to_key: "helghandour",
    upload_id: "upload-1",
    ...overrides,
  };
}

function fakeClient(options: {
  pages?: Tables<"ops_requests">[][];
  upload?: Tables<"ops_request_uploads"> | null;
  requestsError?: { message: string };
  uploadError?: { message: string };
}) {
  const ranges: Array<[number, number]> = [];
  const client = {
    from(table: string) {
      if (table === "ops_requests") {
        const builder = {
          select: () => builder,
          order: () => builder,
          range: (from: number, to: number) => {
            ranges.push([from, to]);
            if (options.requestsError) return Promise.resolve({ data: null, error: options.requestsError });
            return Promise.resolve({ data: options.pages?.[ranges.length - 1] ?? [], error: null });
          },
        };
        return builder;
      }
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(
          options.uploadError
            ? { data: null, error: options.uploadError }
            : { data: options.upload ?? null, error: null },
        ),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, ranges };
}

describe("loadOpsDataset", () => {
  it("returns an empty dataset without a Supabase client", async () => {
    expect(await loadOpsDataset(null)).toEqual({ requests: [], upload: null });
  });

  it("pages through every request and maps the latest upload", async () => {
    const firstPage = Array.from({ length: OPS_PAGE_SIZE }, (_, index) => dbRow(`SD${index}`));
    const { client, ranges } = fakeClient({
      pages: [firstPage, [dbRow("SDlast")]],
      upload: {
        id: "upload-1",
        uploaded_at: "2026-10-22T07:45:00+00:00",
        uploaded_by: "admin",
        uploaded_by_email: "admin@example.com",
        file_name: "export.csv",
        row_count: 1001,
      },
    });
    const dataset = await loadOpsDataset(client);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(dataset.requests).toHaveLength(1001);
    expect(dataset.upload).toEqual({
      uploadedAt: "2026-10-22T07:45:00+00:00",
      uploadedByEmail: "admin@example.com",
      fileName: "export.csv",
      rowCount: 1001,
    });
  });

  it("throws a readable error when loading fails", async () => {
    await expect(loadOpsDataset(fakeClient({ requestsError: { message: "boom" } }).client))
      .rejects.toThrow("Could not load Ops Requests: boom");
    await expect(loadOpsDataset(fakeClient({ uploadError: { message: "nope" } }).client))
      .rejects.toThrow("Could not load Ops Requests: nope");
  });
});

describe("mapOpsRequestRow", () => {
  it("maps database columns and trims timestamp precision", () => {
    expect(mapOpsRequestRow(dbRow("SD1", {
      assignment_time: "2026-05-17T13:50:00.000",
      close_date: null,
      status: "open",
    }))).toEqual({
      interactionId: "SD1",
      status: "open",
      assignmentTime: "2026-05-17T13:50:00",
      title: "New Task",
      requestTitle: "Deploy",
      description: "Deploy report",
      requestorName: "NFawzy",
      requestorKey: "nfawzy",
      closeDate: null,
      closureCode: "Successful",
      closureComments: "Done",
      assignedTo: "helghandour",
      assignedToKey: "helghandour",
    });
  });
});

describe("replaceOpsRequests", () => {
  it("sends snake_case rows to the replace function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "upload-2", error: null });
    const request = makeOpsRequest({ interactionId: "SD7", closeDate: null, status: "open" });
    const id = await replaceOpsRequests({ rpc } as unknown as SupabaseClient<Database>, "export.csv", [request]);
    expect(id).toBe("upload-2");
    expect(rpc).toHaveBeenCalledWith("replace_ops_requests", {
      p_file_name: "export.csv",
      p_rows: toReplaceRows([request]),
    });
    expect(toReplaceRows([request])[0]).toEqual({
      interaction_id: "SD7",
      status: "open",
      assignment_time: "2026-05-04T09:00:00",
      title: "New Task",
      request_title: "Request",
      description: "",
      requestor_name: "NFawzy",
      requestor_key: "nfawzy",
      close_date: null,
      closure_code: "Successful",
      closure_comments: "",
      assigned_to: "HElGhandour",
      assigned_to_key: "helghandour",
    });
  });

  it("explains permission and other failures", async () => {
    const denied = vi.fn().mockResolvedValue({ data: null, error: { message: "admin access required" } });
    await expect(replaceOpsRequests({ rpc: denied } as unknown as SupabaseClient<Database>, "a.csv", []))
      .rejects.toThrow("Only admins can upload Ops Requests.");

    const broken = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(replaceOpsRequests({ rpc: broken } as unknown as SupabaseClient<Database>, "a.csv", []))
      .rejects.toThrow("Upload failed: timeout");

    const empty = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(replaceOpsRequests({ rpc: empty } as unknown as SupabaseClient<Database>, "a.csv", []))
      .rejects.toThrow("Upload failed: no upload id was returned.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ops-load-mutations.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/ops/load"`.

- [ ] **Step 3: Write the loader**

Create `lib/ops/load.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import type { OpsDataset, OpsRequest, OpsStatus, OpsUpload } from "./types";

export const OPS_PAGE_SIZE = 1000;

type OpsClient = SupabaseClient<Database>;

function wallClock(value: string): string {
  return value.slice(0, 19);
}

export function mapOpsRequestRow(row: Tables<"ops_requests">): OpsRequest {
  return {
    interactionId: row.interaction_id,
    status: row.status as OpsStatus,
    assignmentTime: wallClock(row.assignment_time),
    title: row.title,
    requestTitle: row.request_title,
    description: row.description,
    requestorName: row.requestor_name,
    requestorKey: row.requestor_key,
    closeDate: row.close_date ? wallClock(row.close_date) : null,
    closureCode: row.closure_code,
    closureComments: row.closure_comments,
    assignedTo: row.assigned_to,
    assignedToKey: row.assigned_to_key,
  };
}

function mapUpload(row: Tables<"ops_request_uploads">): OpsUpload {
  return {
    uploadedAt: row.uploaded_at,
    uploadedByEmail: row.uploaded_by_email,
    fileName: row.file_name,
    rowCount: row.row_count,
  };
}

function loadFailure(message: string): never {
  throw new Error(`Could not load Ops Requests: ${message}`);
}

async function fetchAllRequests(client: OpsClient): Promise<Tables<"ops_requests">[]> {
  const rows: Tables<"ops_requests">[] = [];
  for (let from = 0; ; from += OPS_PAGE_SIZE) {
    const { data, error } = await client
      .from("ops_requests")
      .select("*")
      .order("assignment_time", { ascending: false })
      .order("interaction_id", { ascending: true })
      .range(from, from + OPS_PAGE_SIZE - 1);
    if (error) loadFailure(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < OPS_PAGE_SIZE) return rows;
  }
}

export async function loadOpsDataset(client: OpsClient | null): Promise<OpsDataset> {
  if (!client) return { requests: [], upload: null };
  const [rows, uploadResult] = await Promise.all([
    fetchAllRequests(client),
    client
      .from("ops_request_uploads")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (uploadResult.error) loadFailure(uploadResult.error.message);
  return {
    requests: rows.map(mapOpsRequestRow),
    upload: uploadResult.data ? mapUpload(uploadResult.data) : null,
  };
}
```

- [ ] **Step 4: Write the replace call**

Create `lib/ops/mutations.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { OpsRequest } from "./types";

export type OpsReplaceRow = {
  interaction_id: string;
  status: string;
  assignment_time: string;
  title: string;
  request_title: string;
  description: string;
  requestor_name: string;
  requestor_key: string;
  close_date: string | null;
  closure_code: string;
  closure_comments: string;
  assigned_to: string;
  assigned_to_key: string;
};

export function toReplaceRows(requests: OpsRequest[]): OpsReplaceRow[] {
  return requests.map((request) => ({
    interaction_id: request.interactionId,
    status: request.status,
    assignment_time: request.assignmentTime,
    title: request.title,
    request_title: request.requestTitle,
    description: request.description,
    requestor_name: request.requestorName,
    requestor_key: request.requestorKey,
    close_date: request.closeDate,
    closure_code: request.closureCode,
    closure_comments: request.closureComments,
    assigned_to: request.assignedTo,
    assigned_to_key: request.assignedToKey,
  }));
}

export async function replaceOpsRequests(
  supabase: SupabaseClient<Database>,
  fileName: string,
  requests: OpsRequest[],
): Promise<string> {
  const { data, error } = await supabase.rpc("replace_ops_requests", {
    p_file_name: fileName,
    p_rows: toReplaceRows(requests),
  });
  if (error) {
    throw new Error(
      /admin access required/i.test(error.message)
        ? "Only admins can upload Ops Requests."
        : `Upload failed: ${error.message}`,
    );
  }
  if (!data) throw new Error("Upload failed: no upload id was returned.");
  return data;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ops-load-mutations.test.ts && npx tsc --noEmit`
Expected: PASS (6 tests), with no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/ops/load.ts lib/ops/mutations.ts tests/ops-load-mutations.test.ts
git commit -m "feat(ops): load requests with paging and call the replace function"
```

---

### Task 6: Read-only dashboard page

**Files:**
- Create: `app/ops/page.tsx`
- Create: `components/ops/ops-requests-page.tsx`
- Create: `components/ops/ops-kpis.tsx`
- Create: `components/ops/ops-breakdowns.tsx`
- Create: `components/ops/ops-timeline.tsx`
- Create: `components/ops/ops-ticket-list.tsx`
- Modify: `app/globals.css` (append the `ops-*` styles)
- Test: `tests/ops-requests-page.test.tsx`

**Interfaces:**
- Consumes: everything in `lib/ops/analytics.ts` (Task 3); `OpsDataset`, `OPS_STATUSES`, `OPS_STATUS_LABELS` (Task 1); `loadOpsDataset` (Task 5); `getAdminStatus` from `@/lib/data/initial-dashboard`; `ModalDialog` from `@/components/ui/modal-dialog`; `BrandMark` from `@/components/ui/brand-mark`
- Produces:
  - `OpsRequestsPage({ dataset, isAdmin, loadError }: { dataset: OpsDataset; isAdmin: boolean; loadError?: string | null })`
  - A `<div className="header-tools">` in the header, where Task 7 places the Upload control

- [ ] **Step 1: Write the failing component tests**

Create `tests/ops-requests-page.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsRequestsPage } from "@/components/ops/ops-requests-page";
import type { OpsDataset } from "@/lib/ops/types";
import { sampleRequests } from "./fixtures/ops-requests";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const dataset: OpsDataset = {
  requests: sampleRequests,
  upload: {
    uploadedAt: "2026-10-22T07:45:00Z",
    uploadedByEmail: "admin@example.com",
    fileName: "export.csv",
    rowCount: 5,
  },
};

function visibleIds() {
  return screen
    .getAllByRole("button", { name: /^View details for / })
    .map((button) => button.textContent);
}

describe("OpsRequestsPage", () => {
  it("shows the header, KPIs, breakdowns, timeline, and request list", () => {
    render(<OpsRequestsPage dataset={dataset} isAdmin={false} />);

    expect(screen.getByRole("heading", { level: 1, name: "Ops Requests" })).toBeInTheDocument();
    expect(screen.getByText(/Last updated .* by admin@example\.com · 5 requests/)).toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "Ops request overview" });
    expect(within(overview).getByText("Total requests").nextSibling).toHaveTextContent("5");
    expect(within(overview).getByRole("button", { name: /^Open/ })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /^Pending/ })).toHaveTextContent("1");
    expect(within(overview).getByRole("button", { name: /^Closed/ })).toHaveTextContent("3");
    expect(within(overview).getByText("60%")).toBeInTheDocument();

    expect(screen.getByRole("region", { name: "Closure codes" })).toHaveTextContent("Successful");
    const assignees = screen.getByRole("region", { name: "By assignee" });
    expect(within(assignees).getByRole("row", { name: /HElGhandour/ })).toHaveTextContent("2");
    expect(screen.getByRole("region", { name: "By requestor" })).toHaveTextContent("NFawzy");
    expect(screen.getByRole("listitem", { name: "Week of May 4: 2 assigned, 2 closed" })).toBeInTheDocument();

    expect(visibleIds()).toEqual(["SD1005", "SD1004", "SD1003", "SD1002", "SD1001"]);
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  });

  it("filters the list from the status cards and clears on a second click", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={dataset} isAdmin={false} />);
    const closed = screen.getByRole("button", { name: /^Closed/ });

    await user.click(closed);
    expect(closed).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds()).toEqual(["SD1003", "SD1002", "SD1001"]);
    expect(screen.getByLabelText("Status")).toHaveValue("closed");

    await user.click(closed);
    expect(visibleIds()).toHaveLength(5);
  });

  it("searches and filters by assignee", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={dataset} isAdmin={false} />);

    await user.type(screen.getByLabelText("Search"), "quota");
    expect(visibleIds()).toEqual(["SD1004"]);

    await user.clear(screen.getByLabelText("Search"));
    await user.selectOptions(screen.getByLabelText("Assignee"), "helghandour");
    expect(visibleIds()).toEqual(["SD1002", "SD1001"]);

    await user.type(screen.getByLabelText("Search"), "nothing matches");
    expect(screen.getByText("No requests match these filters.")).toBeInTheDocument();
  });

  it("opens request details in a dialog", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={dataset} isAdmin={false} />);

    await user.click(screen.getByRole("button", { name: "View details for SD1004" }));
    const dialog = screen.getByRole("dialog", { name: "Quota offer" });
    expect(dialog).toHaveTextContent("Double quota for the attached customer list");
    expect(dialog).toHaveTextContent("rshalim");

    await user.click(within(dialog).getByRole("button", { name: "Close request details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the empty state and load errors", () => {
    render(
      <OpsRequestsPage
        dataset={{ requests: [], upload: null }}
        isAdmin={false}
        loadError="Could not load Ops Requests: boom"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load Ops Requests: boom");
    expect(screen.getAllByText("No data uploaded yet").length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "Ops request overview" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ops-requests-page.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/ops/ops-requests-page"`.

- [ ] **Step 3: Write the KPI cards**

Create `components/ops/ops-kpis.tsx`:

```tsx
import {
  formatDuration,
  formatPercent,
  type OpsKpis as OpsKpiValues,
  type OpsStatusFilter,
} from "@/lib/ops/analytics";
import { OPS_STATUSES, OPS_STATUS_LABELS, type OpsStatus } from "@/lib/ops/types";

const STATUS_COLORS: Record<OpsStatus, string> = {
  open: "#b63027",
  pending: "#a94806",
  closed: "#237b4b",
};

function Metric({ label, value, meta }: { label: string; value: string | number; meta: string }) {
  return (
    <div className="kpi-card" style={{ ["--kpi-accent" as string]: "var(--orange)" }}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className="kpi-meta">{meta}</p>
    </div>
  );
}

export function OpsKpis({
  kpis,
  statusFilter,
  onStatusFilterChange,
}: {
  kpis: OpsKpiValues;
  statusFilter: OpsStatusFilter;
  onStatusFilterChange: (filter: OpsStatusFilter) => void;
}) {
  return (
    <section className="kpi-grid kpi-grid-status" aria-label="Ops request overview">
      <Metric label="Total requests" value={kpis.total} meta="In the latest upload" />
      {OPS_STATUSES.map((status) => {
        const active = statusFilter === status;
        return (
          <button
            type="button"
            key={status}
            className="kpi-card kpi-card-button"
            data-active={active}
            aria-pressed={active}
            style={{ ["--kpi-accent" as string]: STATUS_COLORS[status] }}
            onClick={() => onStatusFilterChange(active ? "all" : status)}
          >
            <p className="kpi-label">{OPS_STATUS_LABELS[status]}</p>
            <p className="kpi-value">{kpis.counts[status]}</p>
            <p className="kpi-meta">Click to filter requests</p>
          </button>
        );
      })}
      <Metric label="Closure rate" value={formatPercent(kpis.closureRate)} meta="Closed of all requests" />
      <Metric
        label="Avg resolution"
        value={formatDuration(kpis.avgResolutionMs)}
        meta={`Median ${formatDuration(kpis.medianResolutionMs)}`}
      />
      <Metric
        label="Open aging"
        value={formatDuration(kpis.avgOpenAgeMs)}
        meta={`Oldest ${formatDuration(kpis.oldestOpenAgeMs)}`}
      />
    </section>
  );
}
```

- [ ] **Step 4: Write the breakdowns**

Create `components/ops/ops-breakdowns.tsx`:

```tsx
import {
  formatDuration,
  formatPercent,
  type ClosureCodeRow,
  type PersonRow,
} from "@/lib/ops/analytics";

function PersonTable({
  title,
  id,
  rows,
  showResolution,
}: {
  title: string;
  id: string;
  rows: PersonRow[];
  showResolution: boolean;
}) {
  return (
    <section className="ops-panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="ops-number">Total</th>
              <th scope="col" className="ops-number">Open</th>
              <th scope="col" className="ops-number">Pending</th>
              <th scope="col" className="ops-number">Closed</th>
              {showResolution ? (
                <>
                  <th scope="col" className="ops-number">Avg resolution</th>
                  <th scope="col" className="ops-number">Median</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.name}</th>
                <td className="ops-number">{row.total}</td>
                <td className="ops-number">{row.counts.open}</td>
                <td className="ops-number">{row.counts.pending}</td>
                <td className="ops-number">{row.counts.closed}</td>
                {showResolution ? (
                  <>
                    <td className="ops-number">{formatDuration(row.avgResolutionMs)}</td>
                    <td className="ops-number">{formatDuration(row.medianResolutionMs)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OpsBreakdowns({
  closureCodes,
  assignees,
  requestors,
}: {
  closureCodes: ClosureCodeRow[];
  assignees: PersonRow[];
  requestors: PersonRow[];
}) {
  return (
    <div className="ops-breakdowns">
      <section className="ops-panel" aria-labelledby="ops-closure-title">
        <h2 id="ops-closure-title">Closure codes</h2>
        <ul className="ops-bars">
          {closureCodes.map((row) => (
            <li key={row.label}>
              <span className="ops-bar-label">{row.label}</span>
              <span className="ops-bar-track" aria-hidden="true">
                <span className="ops-bar-fill" style={{ width: `${Math.round(row.share * 100)}%` }} />
              </span>
              <span className="ops-bar-value">
                {row.count} · {formatPercent(row.share)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <PersonTable title="By assignee" id="ops-assignee-title" rows={assignees} showResolution />
      <PersonTable title="By requestor" id="ops-requestor-title" rows={requestors} showResolution={false} />
    </div>
  );
}
```

- [ ] **Step 5: Write the weekly timeline**

Create `components/ops/ops-timeline.tsx`:

```tsx
import { formatWeekLabel, type WeekBucket } from "@/lib/ops/analytics";

export function OpsTimeline({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map((week) => Math.max(week.assigned, week.closed)));
  return (
    <section className="ops-panel" aria-labelledby="ops-timeline-title">
      <h2 id="ops-timeline-title">Requests per week</h2>
      <p className="ops-legend">
        <span className="ops-legend-assigned" aria-hidden="true" /> Assigned
        <span className="ops-legend-closed" aria-hidden="true" /> Closed
      </p>
      <ol className="ops-weeks">
        {weeks.map((week) => {
          const label = formatWeekLabel(week.weekStart);
          return (
            <li
              key={week.weekStart}
              aria-label={`Week of ${label}: ${week.assigned} assigned, ${week.closed} closed`}
            >
              <div className="ops-week-bars" aria-hidden="true">
                <span
                  className="ops-week-bar ops-week-bar-assigned"
                  style={{ height: `${(week.assigned / max) * 100}%` }}
                />
                <span
                  className="ops-week-bar ops-week-bar-closed"
                  style={{ height: `${(week.closed / max) * 100}%` }}
                />
              </div>
              <span className="ops-week-label" aria-hidden="true">{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 6: Write the request list and detail dialog**

Create `components/ops/ops-ticket-list.tsx`:

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import {
  filterRequests,
  formatDuration,
  formatTimestamp,
  resolutionMs,
  type OpsStatusFilter,
  type PersonRow,
} from "@/lib/ops/analytics";
import { OPS_STATUSES, OPS_STATUS_LABELS, type OpsRequest } from "@/lib/ops/types";

function OpsRequestDetails({ request, onClose }: { request: OpsRequest; onClose: () => void }) {
  const fields: Array<[string, string]> = [
    ["Status", OPS_STATUS_LABELS[request.status]],
    ["Title", request.title],
    ["Requestor", request.requestorName],
    ["Assigned to", request.assignedTo],
    ["Assigned", formatTimestamp(request.assignmentTime)],
    ["Closed", formatTimestamp(request.closeDate)],
    ["Resolution", formatDuration(resolutionMs(request))],
    ["Closure code", request.closureCode],
  ];
  return (
    <ModalDialog
      labelledBy="ops-request-title"
      closeLabel="Close request details"
      onClose={onClose}
      className="ops-detail-modal"
    >
      <p className="eyebrow">{request.interactionId}</p>
      <h2 id="ops-request-title">{request.requestTitle || request.interactionId}</h2>
      <dl className="ops-detail-list">
        {fields.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <h3>Description</h3>
      <p className="ops-detail-text">{request.description || "—"}</p>
      <h3>Closure comments</h3>
      <p className="ops-detail-text">{request.closureComments || "—"}</p>
    </ModalDialog>
  );
}

export function OpsTicketList({
  requests,
  assignees,
  statusFilter,
  onStatusFilterChange,
}: {
  requests: OpsRequest[];
  assignees: PersonRow[];
  statusFilter: OpsStatusFilter;
  onStatusFilterChange: (filter: OpsStatusFilter) => void;
}) {
  const [query, setQuery] = useState("");
  const [assigneeKey, setAssigneeKey] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setSelectedId(null), []);

  const visible = useMemo(
    () => filterRequests(requests, { status: statusFilter, assigneeKey, query }),
    [assigneeKey, query, requests, statusFilter],
  );
  const selected = requests.find((request) => request.interactionId === selectedId) ?? null;

  return (
    <section className="ops-panel" aria-labelledby="ops-list-title">
      <div className="section-heading">
        <h2 id="ops-list-title">Requests</h2>
        <p>{visible.length} of {requests.length} shown</p>
      </div>
      <div className="ops-filters">
        <label className="form-field">
          <span>Search</span>
          <input
            type="search"
            value={query}
            placeholder="ID, title, person, or comment"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as OpsStatusFilter)}
          >
            <option value="all">All statuses</option>
            {OPS_STATUSES.map((status) => (
              <option key={status} value={status}>{OPS_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Assignee</span>
          <select value={assigneeKey} onChange={(event) => setAssigneeKey(event.target.value)}>
            <option value="all">All assignees</option>
            {assignees.map((assignee) => (
              <option key={assignee.key} value={assignee.key}>{assignee.name}</option>
            ))}
          </select>
        </label>
      </div>
      {visible.length ? (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Request</th>
                <th scope="col">Status</th>
                <th scope="col">Requestor</th>
                <th scope="col">Assignee</th>
                <th scope="col">Assigned</th>
                <th scope="col">Closed</th>
                <th scope="col" className="ops-number">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((request) => (
                <tr key={request.interactionId}>
                  <td>
                    <button
                      type="button"
                      className="ops-link-button"
                      aria-label={`View details for ${request.interactionId}`}
                      onClick={() => setSelectedId(request.interactionId)}
                    >
                      {request.interactionId}
                    </button>
                  </td>
                  <td>{request.requestTitle || "—"}</td>
                  <td>
                    <span className={`ops-status ops-status-${request.status}`}>
                      {OPS_STATUS_LABELS[request.status]}
                    </span>
                  </td>
                  <td>{request.requestorName || "—"}</td>
                  <td>{request.assignedTo || "—"}</td>
                  <td>{formatTimestamp(request.assignmentTime)}</td>
                  <td>{formatTimestamp(request.closeDate)}</td>
                  <td className="ops-number">{formatDuration(resolutionMs(request))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ops-empty-filter">No requests match these filters.</p>
      )}
      {selected ? <OpsRequestDetails request={selected} onClose={closeDetails} /> : null}
    </section>
  );
}
```

- [ ] **Step 7: Write the page shell**

Create `components/ops/ops-requests-page.tsx`:

```tsx
"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import {
  breakdownByClosureCode,
  formatUploadedAt,
  groupByPerson,
  summarizeKpis,
  wallClockNow,
  weeklyBuckets,
  type OpsStatusFilter,
} from "@/lib/ops/analytics";
import type { OpsDataset } from "@/lib/ops/types";
import { OpsBreakdowns } from "./ops-breakdowns";
import { OpsKpis } from "./ops-kpis";
import { OpsTicketList } from "./ops-ticket-list";
import { OpsTimeline } from "./ops-timeline";

let clientNowMs: number | null = null;

function subscribeToNow() {
  return () => undefined;
}

function getClientNow() {
  clientNowMs ??= wallClockNow();
  return clientNowMs;
}

function getServerNow() {
  return null;
}

function uploadSummary(dataset: OpsDataset) {
  const { upload } = dataset;
  if (!upload) return "No data uploaded yet";
  const by = upload.uploadedByEmail ? ` by ${upload.uploadedByEmail}` : "";
  return `Last updated ${formatUploadedAt(upload.uploadedAt)}${by} · ${upload.rowCount} requests`;
}

export function OpsRequestsPage({
  dataset,
  isAdmin,
  loadError = null,
}: {
  dataset: OpsDataset;
  isAdmin: boolean;
  loadError?: string | null;
}) {
  const { requests } = dataset;
  const nowMs = useSyncExternalStore(subscribeToNow, getClientNow, getServerNow);
  const [statusFilter, setStatusFilter] = useState<OpsStatusFilter>("all");

  const kpis = useMemo(() => summarizeKpis(requests, nowMs), [nowMs, requests]);
  const closureCodes = useMemo(() => breakdownByClosureCode(requests), [requests]);
  const assignees = useMemo(() => groupByPerson(requests, "assignee"), [requests]);
  const requestors = useMemo(() => groupByPerson(requests, "requestor"), [requests]);
  const weeks = useMemo(() => weeklyBuckets(requests), [requests]);

  return (
    <main className="dashboard ops-page">
      <header className="dashboard-header">
        <div className="brand-lockup">
          <p className="eyebrow">Service desk</p>
          <div className="brand-title-row">
            <BrandMark />
            <h1>Ops Requests</h1>
          </div>
          <p className="workspace-description">{uploadSummary(dataset)}</p>
        </div>
        <div className="header-tools" />
      </header>

      {loadError ? (
        <div className="mutation-notice" role="alert">
          <span>{loadError}</span>
        </div>
      ) : null}

      {requests.length ? (
        <>
          <OpsKpis kpis={kpis} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
          <OpsTimeline weeks={weeks} />
          <OpsBreakdowns closureCodes={closureCodes} assignees={assignees} requestors={requestors} />
          <OpsTicketList
            requests={requests}
            assignees={assignees}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </>
      ) : (
        <section className="view-state ops-empty">
          <p className="view-state-title">No data uploaded yet</p>
          <p>
            {isAdmin
              ? "Use Upload at the top of the page to add a service-desk export."
              : "An admin hasn't uploaded a service-desk export yet."}
          </p>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Write the server page**

Create `app/ops/page.tsx`:

```tsx
import type { Metadata } from "next";
import { OpsRequestsPage } from "@/components/ops/ops-requests-page";
import { getAdminStatus } from "@/lib/data/initial-dashboard";
import { loadOpsDataset } from "@/lib/ops/load";
import type { OpsDataset } from "@/lib/ops/types";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ops Requests",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const client = hasSupabasePublicEnv() ? await createClient() : null;
  let dataset: OpsDataset = { requests: [], upload: null };
  let loadError: string | null = null;
  try {
    dataset = await loadOpsDataset(client);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load Ops Requests.";
  }
  const isAdmin = client ? await getAdminStatus(client) : false;
  return <OpsRequestsPage dataset={dataset} isAdmin={isAdmin} loadError={loadError} />;
}
```

- [ ] **Step 9: Append the styles**

Append to the end of `app/globals.css`:

```css
.ops-page .kpi-grid-status {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.ops-panel {
  margin-bottom: 24px;
  padding: 22px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}

.ops-panel h2 {
  margin: 0 0 14px;
  font-size: 18px;
  letter-spacing: -0.02em;
}

.ops-breakdowns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.ops-breakdowns .ops-panel {
  margin-bottom: 0;
}

.ops-bars {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ops-bars li {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 2fr auto;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.ops-bar-track {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 60%, transparent);
}

.ops-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--orange);
}

.ops-bar-value {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.ops-table-wrap {
  overflow-x: auto;
}

.ops-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.ops-table th,
.ops-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.ops-table thead th {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ops-table .ops-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.ops-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 12px;
}

.ops-legend span {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.ops-legend-assigned,
.ops-week-bar-assigned {
  background: var(--orange);
}

.ops-legend-closed,
.ops-week-bar-closed {
  background: #237b4b;
}

.ops-weeks {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  min-height: 180px;
  margin: 0;
  padding: 0;
  overflow-x: auto;
  list-style: none;
}

.ops-weeks li {
  display: grid;
  flex: 0 0 48px;
  justify-items: center;
  gap: 6px;
}

.ops-week-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 150px;
}

.ops-week-bar {
  display: block;
  width: 14px;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
}

.ops-week-label {
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}

.ops-filters {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

.ops-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.ops-status-open {
  background: #fdecea;
  color: #b63027;
}

.ops-status-pending {
  background: #fff3e6;
  color: #a94806;
}

.ops-status-closed {
  background: #e8f5ee;
  color: #237b4b;
}

.ops-link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--orange);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.ops-empty-filter {
  color: var(--muted);
}

.ops-detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
  margin: 16px 0;
}

.ops-detail-list dt {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.ops-detail-list dd {
  margin: 2px 0 0;
}

.ops-detail-text {
  white-space: pre-wrap;
}

.ops-file-input {
  display: none;
}

.ops-upload-summary {
  font-size: 16px;
  font-weight: 700;
}

.ops-upload-errors {
  max-height: 260px;
  overflow-y: auto;
  padding-left: 18px;
  font-size: 13px;
}

@media (max-width: 720px) {
  .ops-filters,
  .ops-detail-list {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run tests/ops-requests-page.test.tsx && npx tsc --noEmit`
Expected: PASS (5 tests), with no type errors.

- [ ] **Step 11: Commit**

```bash
git add app/ops/page.tsx components/ops app/globals.css tests/ops-requests-page.test.tsx
git commit -m "feat(ops): add read-only Ops Requests dashboard at /ops"
```

---

### Task 7: Admin upload flow

**Files:**
- Create: `components/ops/ops-upload.tsx`
- Modify: `components/ops/ops-requests-page.tsx` (render Upload for admins and refresh after saving)
- Test: `tests/ops-upload.test.tsx`

**Interfaces:**
- Consumes: `parseSheetFile` (Task 1), `normalizeRequests` and `NormalizeResult` (Task 2), `countByStatus` (Task 3), `replaceOpsRequests` (Task 5), `createClient` from `@/lib/supabase/client`, `ModalDialog`, and `OpsRequestsPage` (Task 6)
- Produces: `OpsUpload({ onUploaded }: { onUploaded: () => void })`

- [ ] **Step 1: Write the failing tests**

Create `tests/ops-upload.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsRequestsPage } from "@/components/ops/ops-requests-page";

const refresh = vi.hoisted(() => vi.fn());
const replaceOpsRequests = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ kind: "browser-client" }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@/lib/ops/mutations", () => ({ replaceOpsRequests }));

const sampleCsv = readFileSync(resolve(import.meta.dirname, "fixtures/ops-requests-sample.csv"));
const emptyDataset = { requests: [], upload: null };

function chooseFile() {
  return screen.getByLabelText("Choose a CSV or Excel file to upload");
}

describe("Ops Requests upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceOpsRequests.mockResolvedValue("upload-1");
  });

  it("shows Upload only to admins", () => {
    const { rerender } = render(<OpsRequestsPage dataset={emptyDataset} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    rerender(<OpsRequestsPage dataset={emptyDataset} isAdmin />);
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("previews a valid file and cancels without saving", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File([sampleCsv], "export.csv", { type: "text/csv" }));

    const dialog = await screen.findByRole("dialog", { name: "export.csv" });
    expect(dialog).toHaveTextContent("19 requests found — 0 open, 0 pending, 19 closed");
    expect(dialog).toHaveTextContent("Replacing will delete all current Ops Requests data");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replaceOpsRequests).not.toHaveBeenCalled();
  });

  it("replaces the data and refreshes the page", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File([sampleCsv], "export.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog", { name: "export.csv" });
    await user.click(within(dialog).getByRole("button", { name: "Replace data" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(replaceOpsRequests).toHaveBeenCalledWith(fakeClient, "export.csv", expect.any(Array));
    expect(replaceOpsRequests.mock.calls[0][2]).toHaveLength(19);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with Retry when saving fails", async () => {
    const user = userEvent.setup();
    replaceOpsRequests.mockRejectedValueOnce(new Error("Upload failed: timeout"));
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File([sampleCsv], "export.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog", { name: "export.csv" });
    await user.click(within(dialog).getByRole("button", { name: "Replace data" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Upload failed: timeout");
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(replaceOpsRequests).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lists validation problems and offers no way to save", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);
    const csv = "Interaction ID,Status\nSD1,Open\n";

    await user.upload(chooseFile(), new File([csv], "partial.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog", { name: "partial.csv" });
    expect(dialog).toHaveTextContent("This file can't be uploaded");
    expect(dialog).toHaveTextContent("Missing columns: Assignment Time, Title");
    expect(within(dialog).queryByRole("button", { name: "Replace data" })).not.toBeInTheDocument();
  });

  it("rejects unsupported file types", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File(["hello"], "notes.txt", { type: "text/plain" }));
    const dialog = await screen.findByRole("dialog", { name: "notes.txt" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Upload a .csv or .xlsx file.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ops-upload.test.tsx`
Expected: FAIL. The first test fails with `Unable to find an accessible element with the role "button" and name "Upload"`.

- [ ] **Step 3: Write the upload component**

Create `components/ops/ops-upload.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { countByStatus } from "@/lib/ops/analytics";
import { replaceOpsRequests } from "@/lib/ops/mutations";
import { normalizeRequests, type NormalizeResult } from "@/lib/ops/normalize";
import { parseSheetFile } from "@/lib/ops/parse-sheet";
import { OPS_STATUSES, OPS_STATUS_LABELS } from "@/lib/ops/types";
import { createClient } from "@/lib/supabase/client";

const MAX_LISTED_ERRORS = 50;

type UploadState =
  | { phase: "idle" }
  | { phase: "reading"; fileName: string }
  | { phase: "failed"; fileName: string; message: string }
  | {
      phase: "review";
      fileName: string;
      result: NormalizeResult;
      saving: boolean;
      saveError: string | null;
    };

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
          <span>This file can&apos;t be uploaded. Fix these problems and try again. Nothing was changed.</span>
        </div>
        {result.missingHeaders.length ? (
          <p>Missing columns: {result.missingHeaders.join(", ")}</p>
        ) : null}
        {result.errors.length ? (
          <ul className="ops-upload-errors">
            {result.errors.slice(0, MAX_LISTED_ERRORS).map((error) => (
              <li key={error.rowNumber}>
                Row {error.rowNumber}
                {error.interactionId ? ` (${error.interactionId})` : ""}: {error.message}
              </li>
            ))}
          </ul>
        ) : null}
        {result.errors.length > MAX_LISTED_ERRORS ? (
          <p>…and {result.errors.length - MAX_LISTED_ERRORS} more.</p>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const close = useCallback(() => setState({ phase: "idle" }), []);

  async function readFile(file: File) {
    setState({ phase: "reading", fileName: file.name });
    try {
      const result = normalizeRequests(await parseSheetFile(file));
      setState({ phase: "review", fileName: file.name, result, saving: false, saveError: null });
    } catch (error) {
      setState({
        phase: "failed",
        fileName: file.name,
        message: error instanceof Error ? error.message : "The file could not be read.",
      });
    }
  }

  async function save() {
    if (state.phase !== "review" || !state.result.ok || state.saving) return;
    const { fileName, result } = state;
    setState({ ...state, saving: true, saveError: null });
    try {
      await replaceOpsRequests(createClient(), fileName, result.requests);
      setState({ phase: "idle" });
      onUploaded();
    } catch (error) {
      setState({
        phase: "review",
        fileName,
        result,
        saving: false,
        saveError: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

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
        aria-label="Choose a CSV or Excel file to upload"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void readFile(file);
        }}
      />
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
              onConfirm={() => void save()}
            />
          ) : null}
        </ModalDialog>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Wire the upload into the page**

In `components/ops/ops-requests-page.tsx`, make three edits:

1. Replace the React import line with these imports:

```tsx
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
```

2. Add this import after `import { OpsTimeline } from "./ops-timeline";`:

```tsx
import { OpsUpload } from "./ops-upload";
```

3. Inside `OpsRequestsPage`, add these lines directly after `const [statusFilter, setStatusFilter] = useState<OpsStatusFilter>("all");`:

```tsx
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
```

Then replace `<div className="header-tools" />` with:

```tsx
        <div className="header-tools">
          {isAdmin ? <OpsUpload onUploaded={refresh} /> : null}
        </div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ops-upload.test.tsx tests/ops-requests-page.test.tsx && npx tsc --noEmit`
Expected: PASS (11 tests), with no type errors.

- [ ] **Step 6: Commit**

```bash
git add components/ops/ops-upload.tsx components/ops/ops-requests-page.tsx tests/ops-upload.test.tsx
git commit -m "feat(ops): let admins upload and replace Ops Requests data"
```

---

### Task 8: Full verification and handoff

**Files:**
- No new files. Fixes go to whichever file a check points at.

**Interfaces:**
- Consumes: everything from Tasks 1–7

- [ ] **Step 1: Run every automated check**

Run:

```bash
npm run lint && npm run typecheck && npm run test:unit && npm run test:database && npm run build
```

Expected: all pass. The build output lists `ƒ /ops` as a dynamic route.

If `npm run build` fails because `exceljs` pulls in Node built-ins such as `fs`, `stream`, or `crypto` for the browser bundle, change the dynamic import in `lib/ops/parse-sheet.ts` from `await import("exceljs")` to `await import("exceljs/dist/exceljs.min.js")`, then re-run the build and `npx vitest run tests/ops-parse-sheet.test.ts`. If TypeScript has no declaration for that path, add `declare module "exceljs/dist/exceljs.min.js" { export * from "exceljs"; }` to a new file `types/exceljs-dist.d.ts`.

- [ ] **Step 2: Check the page manually in the browser**

Run `npm run dev` and open `http://127.0.0.1:3000/ops`:
- Without Supabase environment variables, the page shows "Ops Requests" and "No data uploaded yet", with no Upload button.
- With Supabase configured and the 0033 migration applied, sign in as an admin at `/login?next=/ops`. Click **Upload**, choose `tests/fixtures/ops-requests-sample.csv`, and confirm that the preview reads "19 requests found — 0 open, 0 pending, 19 closed". Click **Replace data**. The dashboard should show 19 total, a 100% closure rate, assignee and requestor tables, weekly bars from the week of May 11 through the week of Jun 15, and 19 rows in the list.
- Open `/hot-topics` and confirm the workspace dropdown has no Ops entry.

- [ ] **Step 3: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix(ops): address verification findings"
```

Skip this commit if nothing changed.

- [ ] **Step 4: Hand off for deployment, which needs the user's approval**

Report to the user:
- The code reaches production only after it is merged to `main`, which Vercel then deploys. Ask before pushing to `main`.
- The migration must be run once: paste the contents of `supabase/migrations/0033_ops_requests.sql` into the Supabase SQL editor and run it. If the editor asks about RLS, choose to run it as written, since the migration already enables RLS and adds the read policies.
```
