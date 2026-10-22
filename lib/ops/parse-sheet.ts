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
