import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  ChartKey,
  ManualRow,
  ParsedReport,
  PromoCounts,
  SectionKey,
  SmsChannel,
} from "./types";

type PeClient = SupabaseClient<Database>;

type PromoPayload = { promo: string; last_week: number; day_before: number; yesterday: number };
type SmsPayload = PromoPayload & { channel: SmsChannel };
type UpsellingPayload = { day: string; count: number };

function failure(action: string, message: string): never {
  throw new Error(
    /admin access required/i.test(message)
      ? "Only admins can change the PE Daily Report."
      : `${action} failed: ${message}`,
  );
}

function toPromoPayload(row: PromoCounts): PromoPayload {
  return {
    promo: row.promo,
    last_week: row.lastWeek,
    day_before: row.dayBefore,
    yesterday: row.yesterday,
  };
}

export function toReportPayload(report: ParsedReport): {
  p_report_date: string;
  p_promos: PromoPayload[];
  p_sms: SmsPayload[];
  p_upselling: UpsellingPayload[];
} {
  return {
    p_report_date: report.reportDate,
    p_promos: report.promos.map(toPromoPayload),
    p_sms: report.sms.map((row) => ({ ...toPromoPayload(row), channel: row.channel })),
    p_upselling: report.upselling.map((entry) => ({ day: entry.day, count: entry.count })),
  };
}

export async function savePeDailyReport(
  supabase: PeClient,
  fileName: string,
  report: ParsedReport,
): Promise<void> {
  const { error } = await supabase.rpc("save_pe_daily_report", {
    ...toReportPayload(report),
    p_file_name: fileName,
  });
  if (error) failure("Saving the report", error.message);
}

export async function savePeDailySection(
  supabase: PeClient,
  reportDate: string,
  section: SectionKey,
  rows: ManualRow[],
): Promise<void> {
  const { error } = await supabase.rpc("save_pe_daily_section", {
    p_report_date: reportDate,
    p_section: section,
    p_rows: rows,
  });
  if (error) failure("Saving the section", error.message);
}

export async function deletePeDailyReport(supabase: PeClient, reportDate: string): Promise<void> {
  const { error } = await supabase.rpc("delete_pe_daily_report", { p_report_date: reportDate });
  if (error) failure("Deleting the report", error.message);
}

export async function savePeDailyChartSettings(
  supabase: PeClient,
  visibleCharts: ChartKey[],
): Promise<void> {
  const { error } = await supabase.rpc("save_pe_daily_chart_settings", {
    p_visible_charts: visibleCharts,
  });
  if (error) failure("Saving chart settings", error.message);
}
