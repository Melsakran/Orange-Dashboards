// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import {
  normalizeHeader,
  parseCsv,
  parseSheetFile,
  readSheetTable,
  readXlsxTable,
  tableToSheet,
} from "@/lib/sheets/parse-sheet";

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

  it("keeps a quote that does not start a field", () => {
    expect(parseCsv('id,desc\n1,27" monitor\n2,ok')).toEqual([
      ["id", "desc"],
      ["1", '27" monitor'],
      ["2", "ok"],
    ]);
  });

  it("rejects an unclosed quote", () => {
    expect(() => parseCsv('id,desc\n1,"27 monitor\n2,ok')).toThrow("The CSV has an unclosed quote.");
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
