import { formatDayLabel } from "./format";
import type { ManualFieldValue, ManualRow, SmsCounts, UpsellingDay } from "./types";

export type ChartDatum = { category: string } & Record<string, string | number | null>;

export interface CountRow {
  promo: string;
  lastWeek: number | null;
  dayBefore: number | null;
  yesterday: number | null;
}

export interface SmsGroup {
  promo: string;
  offline: SmsCounts | null;
  online: SmsCounts | null;
}

function asCount(value: ManualFieldValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

export function promoChartData(rows: CountRow[]): ChartDatum[] {
  return rows.map((row) => ({
    category: row.promo,
    lastWeek: row.lastWeek,
    dayBefore: row.dayBefore,
    yesterday: row.yesterday,
  }));
}

export function txProvCounts(rows: ManualRow[]): CountRow[] {
  return rows.map((row) => ({
    promo: typeof row.promo === "string" ? row.promo : "",
    lastWeek: asCount(row.last_week),
    dayBefore: asCount(row.day_before),
    yesterday: asCount(row.yesterday),
  }));
}

export function txProvChartData(rows: ManualRow[]): ChartDatum[] {
  return promoChartData(txProvCounts(rows));
}

export function groupSms(rows: SmsCounts[]): SmsGroup[] {
  const groups = new Map<string, SmsGroup>();
  rows.forEach((row) => {
    const group = groups.get(row.promo) ?? { promo: row.promo, offline: null, online: null };
    group[row.channel] = row;
    groups.set(row.promo, group);
  });
  return [...groups.values()];
}

export function smsChartData(rows: SmsCounts[]): ChartDatum[] {
  return groupSms(rows).map((group) => ({
    category: group.promo,
    offline: group.offline?.yesterday ?? null,
    online: group.online?.yesterday ?? null,
  }));
}

export function upsellingChartData(days: UpsellingDay[]): ChartDatum[] {
  return days.map((entry) => ({ category: formatDayLabel(entry.day), count: entry.count }));
}
