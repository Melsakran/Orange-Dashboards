// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeRequests,
  OPTIONAL_COLUMNS,
  parseSheetDate,
  REQUIRED_COLUMNS,
} from "@/lib/ops/normalize";
import { parseCsv, tableToSheet } from "@/lib/sheets/parse-sheet";

type Column = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];
const OLD_TEMPLATE: readonly Column[] = [...REQUIRED_COLUMNS, "Title", "Closure Comments"];

const validRow: Partial<Record<Column, string>> = {
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

function sheetOf(rows: Array<Partial<Record<Column, string>>>, columns: readonly string[] = OLD_TEMPLATE) {
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
      requestType: "",
      isMergeRequest: false,
    });
  });

  it("reads the new template and flags merge requests from Svc Options", () => {
    const text = readFileSync(resolve(import.meta.dirname, "fixtures/ops-requests-merge-sample.csv"), "utf8");
    const result = normalizeRequests(tableToSheet(parseCsv(text)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requests).toHaveLength(28);
    expect(result.requests.filter((request) => request.isMergeRequest)).toHaveLength(17);
    const types = new Map<string, number>();
    result.requests.forEach((request) => types.set(request.requestType, (types.get(request.requestType) ?? 0) + 1));
    expect(Object.fromEntries(types)).toEqual({
      "Merge Request": 17,
      "Report Recovery": 4,
      "CVM View Deployment": 3,
      "Model Recovery": 2,
      "New Tables Sync": 1,
      "CVM Plan Issue": 1,
    });
    expect(result.requests[0]).toMatchObject({
      interactionId: "SD1307028",
      status: "in_progress",
      requestTitle: "new recharge field",
      title: "",
      closureComments: "",
      assignedTo: "",
      requestType: "Merge Request",
      isMergeRequest: true,
    });
  });

  it("flags only the Merge Request type and keeps the other type names", () => {
    const form = (type: string) =>
      `<form><select help="&lt;p>Request Type&lt;/p> " id="RequestType" label="&lt;p>Request Type&lt;/p>">${type}<option id="0">Merge Request</option></select></form>`;
    const result = normalizeRequests(sheetOf(
      [
        { ...validRow, "Interaction ID": "SD1", "Svc Options": form("Merge Request") },
        { ...validRow, "Interaction ID": "SD2", "Svc Options": form("Report Recovery") },
        { ...validRow, "Interaction ID": "SD3", "Svc Options": "" },
      ],
      [...REQUIRED_COLUMNS, "Svc Options"],
    ));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requests.map((request) => [request.requestType, request.isMergeRequest])).toEqual([
      ["Merge Request", true],
      ["Report Recovery", false],
      ["", false],
    ]);
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

  it.each(["In Progress", "in progress", "IN-PROGRESS", "In_Progress", " In  Progress "])(
    "accepts %j as the In Progress status",
    (status) => {
      const result = normalizeRequests(sheetOf([{ ...validRow, Status: status, "Close Date": "" }]));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.requests[0].status).toBe("in_progress");
    },
  );

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
        return match ? validRow[match as Column] ?? "" : "ignored";
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
        { rowNumber: 5, interactionId: "SD3", message: 'Unrecognized status "Resolved". Use Open, In Progress, Pending, or Closed.' },
        { rowNumber: 6, interactionId: "SD4", message: "Assignment Time is required." },
        { rowNumber: 7, interactionId: "SD5", message: 'Unrecognized assignment time "31/31/2026". Use month/day/year.' },
        { rowNumber: 8, interactionId: "SD6", message: 'Unrecognized close date "tomorrow". Use month/day/year.' },
        { rowNumber: 9, interactionId: "SD7", message: "Close Date is earlier than Assignment Time." },
      ],
    });
  });
});
