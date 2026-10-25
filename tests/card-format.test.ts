import { describe, expect, it } from "vitest";
import {
  deliverySummary,
  formatCardDate,
  formatWorkingDays,
  parseWorkingDays,
} from "@/lib/dashboard/card-format";

describe("formatCardDate", () => {
  it("formats ISO dates and falls back when empty or invalid", () => {
    expect(formatCardDate("2026-04-15")).toBe("Apr 15, 2026");
    expect(formatCardDate(undefined)).toBe("Not scheduled");
    expect(formatCardDate("nope")).toBe("Not scheduled");
  });
});

describe("formatWorkingDays", () => {
  it.each([
    [undefined, "Not set"],
    [0, "0 WDs"],
    [1, "1 WD"],
    [2.5, "2.5 WDs"],
    [8, "8 WDs"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatWorkingDays(value)).toBe(expected);
  });
});

describe("parseWorkingDays", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["0", 0],
    ["2.5", 2.5],
    [" 10 ", 10],
    ["9999.9", 9999.9],
  ])("accepts %j", (text, expected) => {
    expect(parseWorkingDays(text)).toBe(expected);
  });

  it.each(["1.25", "-1", "10000", "abc", "1.", ".5", "1e2"])("rejects %j", (text) => {
    expect(parseWorkingDays(text)).toBeUndefined();
  });
});

describe("deliverySummary", () => {
  it("lists only the fields that are set", () => {
    expect(deliverySummary({
      startDate: "2026-04-01",
      readinessDate: "2026-04-20",
      teamEffortWd: 1,
      timeToMarketWd: 12.5,
    })).toBe("Start Apr 1, 2026 · Readiness Apr 20, 2026 · Team 1 WD · Time to market 12.5 WDs");
    expect(deliverySummary({ endDate: "2026-04-10", teamEffortWd: 0 }))
      .toBe("Deployment Apr 10, 2026 · Team 0 WDs");
    expect(deliverySummary({})).toBe("");
  });
});
