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
