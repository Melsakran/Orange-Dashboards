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
