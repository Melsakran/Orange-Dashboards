export const CHART_KEYS = ["tx_prov", "h_dynamic", "upselling", "sms"] as const;

export type ChartKey = (typeof CHART_KEYS)[number];

export const CHART_LABELS: Record<ChartKey, string> = {
  tx_prov: "Promos – TX_PROV",
  h_dynamic: "Promos – H_DYNAMIC",
  upselling: "Upselling trend",
  sms: "SMS Offline vs Online",
};

export const DEFAULT_VISIBLE_CHARTS: readonly ChartKey[] = ["tx_prov", "h_dynamic"];

export function isChartKey(value: string): value is ChartKey {
  return (CHART_KEYS as readonly string[]).includes(value);
}

export const SECTION_KEYS = [
  "tx_prov",
  "actions",
  "offer_sheet",
  "data_lake",
  "it_cases",
  "grafana",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

export type ManualFieldValue = string | number | null;

export type ManualRow = Record<string, ManualFieldValue>;

export function emptyManualSections(): Record<SectionKey, ManualRow[]> {
  return Object.fromEntries(SECTION_KEYS.map((key) => [key, []])) as unknown as Record<
    SectionKey,
    ManualRow[]
  >;
}

export interface PromoCounts {
  promo: string;
  lastWeek: number;
  dayBefore: number;
  yesterday: number;
}

export type SmsChannel = "offline" | "online";

export interface SmsCounts extends PromoCounts {
  channel: SmsChannel;
}

// `day` and every report date are ISO calendar dates (YYYY-MM-DD).
export interface UpsellingDay {
  day: string;
  count: number;
}

export interface ParsedReport {
  reportDate: string;
  promos: PromoCounts[];
  sms: SmsCounts[];
  upselling: UpsellingDay[];
}

export interface PeDailyReport extends ParsedReport {
  uploadedAt: string;
  uploadedByEmail: string | null;
  fileName: string;
  manual: Record<SectionKey, ManualRow[]>;
}

export interface PeDailyPageData {
  dates: string[];
  report: PeDailyReport | null;
  requestedDate: string | null;
  visibleCharts: ChartKey[];
}
