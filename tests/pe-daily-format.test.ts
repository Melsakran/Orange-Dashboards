// @vitest-environment node

import {
  groupSms,
  promoChartData,
  smsChartData,
  txProvChartData,
  upsellingChartData,
} from "@/lib/pe-daily/chart-data";
import {
  formatCompact,
  formatCount,
  formatDayLabel,
  formatReportDate,
  parseCount,
  splitLargePromos,
} from "@/lib/pe-daily/format";
import { emptyManualSections, isChartKey, isSectionKey } from "@/lib/pe-daily/types";
import { makeReport } from "./fixtures/pe-daily";

describe("counts", () => {
  it.each([
    ["0", 0],
    ["1234", 1234],
    ["1,234", 1234],
    ["13,310,531", 13310531],
    [" 42 ", 42],
  ])("parses %s", (raw, expected) => {
    expect(parseCount(raw)).toBe(expected);
  });

  it.each(["", "-1", "1.5", "12,34", "1,2345", "abc", "99999999999999999999"])(
    "rejects %s",
    (raw) => {
      expect(parseCount(raw)).toBeNull();
    },
  );

  it("formats counts with separators and a dash when missing", () => {
    expect(formatCount(8823587)).toBe("8,823,587");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("-");
    expect(formatCount(undefined)).toBe("-");
  });

  it("formats compact axis labels", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(450000)).toBe("450K");
    expect(formatCompact(1234567)).toBe("1.2M");
    expect(formatCompact(8823587)).toBe("8.8M");
  });
});

describe("dates", () => {
  it("formats report dates and day labels", () => {
    expect(formatReportDate("2026-10-22")).toBe("22 Oct 2026");
    expect(formatDayLabel("2026-10-15")).toBe("15 Oct");
  });
});

describe("splitLargePromos", () => {
  const rows = makeReport().promos;

  it("hides promos with yesterday counts of 1M or more", () => {
    const { visible, hiddenCount } = splitLargePromos(rows, true);
    expect(visible.map((row) => row.promo)).toEqual(["loyalty", "orange-coins"]);
    expect(hiddenCount).toBe(2);
  });

  it("keeps every promo when the switch is off", () => {
    expect(splitLargePromos(rows, false)).toEqual({ visible: rows, hiddenCount: 0 });
  });

  it("treats a missing yesterday count as small", () => {
    expect(splitLargePromos([{ yesterday: null }], true).hiddenCount).toBe(0);
  });
});

describe("chart data", () => {
  const report = makeReport();

  it("builds grouped promo bars", () => {
    expect(promoChartData(report.promos.slice(0, 1))).toEqual([
      { category: "loyalty", lastWeek: 7, dayBefore: 5, yesterday: 14 },
    ]);
  });

  it("builds TX_PROV bars from admin rows, with blanks as null", () => {
    expect(txProvChartData([
      { promo: "go-2", last_week: 408, day_before: 0, yesterday: null },
    ])).toEqual([{ category: "go-2", lastWeek: 408, dayBefore: 0, yesterday: null }]);
  });

  it("groups SMS rows by promo in first-appearance order", () => {
    expect(groupSms(report.sms).map((group) => [
      group.promo,
      group.offline?.yesterday ?? null,
      group.online?.yesterday ?? null,
    ])).toEqual([
      ["revive", 14795483, 130766],
      ["opportunity", null, 3061708],
    ]);
    expect(smsChartData(report.sms)).toEqual([
      { category: "revive", offline: 14795483, online: 130766 },
      { category: "opportunity", offline: null, online: 3061708 },
    ]);
  });

  it("labels upselling days", () => {
    expect(upsellingChartData(report.upselling)).toEqual([
      { category: "20 Oct", count: 13661474 },
      { category: "21 Oct", count: 13625673 },
    ]);
  });
});

describe("type guards", () => {
  it("recognizes chart and section keys", () => {
    expect(isChartKey("sms")).toBe(true);
    expect(isChartKey("pie")).toBe(false);
    expect(isSectionKey("grafana")).toBe(true);
    expect(isSectionKey("notes")).toBe(false);
    expect(Object.keys(emptyManualSections())).toEqual([
      "tx_prov",
      "actions",
      "offer_sheet",
      "data_lake",
      "it_cases",
      "grafana",
    ]);
  });
});
