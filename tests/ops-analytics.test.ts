// @vitest-environment node

import {
  breakdownByClosureCode,
  DAY_MS,
  filterRequests,
  formatDuration,
  formatPercent,
  formatTimestamp,
  formatUploadedAt,
  formatWeekLabel,
  groupByPerson,
  HOUR_MS,
  resolutionMs,
  summarizeKpis,
  timestampMs,
  wallClockNow,
  weeklyBuckets,
} from "@/lib/ops/analytics";
import { makeOpsRequest, SAMPLE_NOW, sampleRequests } from "./fixtures/ops-requests";

const ids = (requests: { interactionId: string }[]) => requests.map((request) => request.interactionId);

describe("time helpers", () => {
  it("reads wall-clock timestamps without timezone shifts", () => {
    expect(timestampMs("2026-05-17T13:50:00")).toBe(Date.UTC(2026, 4, 17, 13, 50));
    expect(timestampMs("2026-05-17T13:50:00.000")).toBe(Date.UTC(2026, 4, 17, 13, 50));
  });

  it("turns the local clock into the same wall-clock frame", () => {
    const now = new Date(2026, 4, 21, 8, 0, 0);
    expect(wallClockNow(now)).toBe(timestampMs("2026-05-21T08:00:00"));
  });

  it("measures resolution only for closed requests with a close date", () => {
    expect(resolutionMs(sampleRequests[0])).toBe(2 * HOUR_MS);
    expect(resolutionMs(sampleRequests[3])).toBeNull();
    expect(resolutionMs(makeOpsRequest({ status: "closed", closeDate: null }))).toBeNull();
  });
});

describe("summarizeKpis", () => {
  it("counts statuses, closure rate, resolution, and open aging", () => {
    const kpis = summarizeKpis(sampleRequests, timestampMs(SAMPLE_NOW));
    expect(kpis).toEqual({
      total: 5,
      counts: { open: 1, pending: 1, closed: 3 },
      closureRate: 0.6,
      avgResolutionMs: (50.5 * HOUR_MS) / 3,
      medianResolutionMs: 2 * HOUR_MS,
      avgOpenAgeMs: 4.5 * DAY_MS,
      oldestOpenAgeMs: 8 * DAY_MS,
    });
  });

  it("leaves aging empty until the clock is known, and handles no rows", () => {
    expect(summarizeKpis(sampleRequests, null).avgOpenAgeMs).toBeNull();
    expect(summarizeKpis([], 0)).toMatchObject({
      total: 0,
      closureRate: null,
      avgResolutionMs: null,
      medianResolutionMs: null,
      avgOpenAgeMs: null,
      oldestOpenAgeMs: null,
    });
  });
});

describe("breakdownByClosureCode", () => {
  it("groups codes, puts missing codes under (none), and sorts by count", () => {
    expect(breakdownByClosureCode(sampleRequests)).toEqual([
      { label: "Successful", count: 2, share: 0.4 },
      { label: "(none)", count: 2, share: 0.4 },
      { label: "Failed", count: 1, share: 0.2 },
    ]);
  });
});

describe("groupByPerson", () => {
  it("groups assignees case-insensitively with resolution times", () => {
    expect(groupByPerson(sampleRequests, "assignee")).toEqual([
      {
        key: "amdelsabban",
        name: "amdelsabban",
        total: 2,
        counts: { open: 1, pending: 0, closed: 1 },
        avgResolutionMs: 0.5 * HOUR_MS,
        medianResolutionMs: 0.5 * HOUR_MS,
      },
      {
        key: "helghandour",
        name: "HElGhandour",
        total: 2,
        counts: { open: 0, pending: 0, closed: 2 },
        avgResolutionMs: 25 * HOUR_MS,
        medianResolutionMs: 25 * HOUR_MS,
      },
      {
        key: "",
        name: "(none)",
        total: 1,
        counts: { open: 0, pending: 1, closed: 0 },
        avgResolutionMs: null,
        medianResolutionMs: null,
      },
    ]);
  });

  it("uses the most common spelling for requestors", () => {
    expect(groupByPerson(sampleRequests, "requestor").map((row) => [row.name, row.total])).toEqual([
      ["NFawzy", 3],
      ["AhKamel", 1],
      ["rshalim", 1],
    ]);
  });
});

describe("weeklyBuckets", () => {
  it("buckets assigned and closed counts into Monday weeks without gaps", () => {
    expect(weeklyBuckets(sampleRequests)).toEqual([
      { weekStart: "2026-05-04", assigned: 2, closed: 2 },
      { weekStart: "2026-05-11", assigned: 2, closed: 1 },
      { weekStart: "2026-05-18", assigned: 1, closed: 0 },
    ]);
  });

  it("returns no buckets for no rows", () => {
    expect(weeklyBuckets([])).toEqual([]);
  });
});

describe("filterRequests", () => {
  it("filters by status and assignee and sorts newest first", () => {
    expect(ids(filterRequests(sampleRequests, { status: "closed", assigneeKey: "all", query: "" })))
      .toEqual(["SD1003", "SD1002", "SD1001"]);
    expect(ids(filterRequests(sampleRequests, { status: "all", assigneeKey: "helghandour", query: "" })))
      .toEqual(["SD1002", "SD1001"]);
  });

  it("searches ID, titles, description, people, and comments without regard to case", () => {
    const search = (query: string) =>
      ids(filterRequests(sampleRequests, { status: "all", assigneeKey: "all", query }));
    expect(search("kamel")).toEqual(["SD1003"]);
    expect(search("CUSTOMER LIST")).toEqual(["SD1004"]);
    expect(search("production")).toEqual(["SD1001"]);
    expect(search("sd1002")).toEqual(["SD1002"]);
  });
});

describe("formatting", () => {
  it("formats durations in minutes, hours, or days", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(30 * 60_000)).toBe("30m");
    expect(formatDuration(2 * HOUR_MS)).toBe("2.0h");
    expect(formatDuration(48 * HOUR_MS)).toBe("2.0d");
  });

  it("formats percentages, timestamps, and week labels", () => {
    expect(formatPercent(0.6)).toBe("60%");
    expect(formatPercent(null)).toBe("—");
    expect(formatTimestamp("2026-05-17T13:50:00")).toBe("May 17, 2026 13:50");
    expect(formatTimestamp(null)).toBe("—");
    expect(formatWeekLabel("2026-05-04")).toBe("May 4");
  });

  it("formats upload times in Cairo time", () => {
    expect(formatUploadedAt("2026-10-22T07:45:00Z")).toBe("Oct 22, 2026, 10:45 AM");
  });
});
