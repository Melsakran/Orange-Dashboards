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

  it("rejects a file with headers but no requests", () => {
    expect(normalizeRequests(sheetOf([]))).toEqual({
      ok: false,
      missingHeaders: [],
      errors: [],
      fileError: "The file has no requests.",
    });
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
