import {
  emptyManualSections,
  type PeDailyPageData,
  type PeDailyReport,
} from "@/lib/pe-daily/types";

export function makeReport(overrides: Partial<PeDailyReport> = {}): PeDailyReport {
  return {
    reportDate: "2026-10-22",
    uploadedAt: "2026-10-22T07:45:00Z",
    uploadedByEmail: "admin@example.com",
    fileName: "daily report.csv",
    promos: [
      { promo: "loyalty", lastWeek: 7, dayBefore: 5, yesterday: 14 },
      { promo: "orange-coins", lastWeek: 273901, dayBefore: 270548, yesterday: 272015 },
      { promo: "charges-platform", lastWeek: 1959859, dayBefore: 2041804, yesterday: 2024695 },
      { promo: "revive", lastWeek: 7603289, dayBefore: 8471845, yesterday: 8823587 },
    ],
    sms: [
      { channel: "offline", promo: "revive", lastWeek: 13952684, dayBefore: 14335238, yesterday: 14795483 },
      { channel: "online", promo: "opportunity", lastWeek: 3444720, dayBefore: 3574499, yesterday: 3061708 },
      { channel: "online", promo: "revive", lastWeek: 154752, dayBefore: 163307, yesterday: 130766 },
    ],
    upselling: [
      { day: "2026-10-20", count: 13661474 },
      { day: "2026-10-21", count: 13625673 },
    ],
    manual: {
      ...emptyManualSections(),
      tx_prov: [{ promo: "go-2", last_week: 408, day_before: 0, yesterday: 0 }],
      actions: [{ action: "Restart provisioning job", status: "Done" }],
    },
    ...overrides,
  };
}

export function makePageData(overrides: Partial<PeDailyPageData> = {}): PeDailyPageData {
  return {
    dates: ["2026-10-22", "2026-10-21"],
    report: makeReport(),
    requestedDate: null,
    visibleCharts: ["tx_prov", "h_dynamic"],
    ...overrides,
  };
}
