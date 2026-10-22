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
