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
