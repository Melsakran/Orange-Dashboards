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
