// @vitest-environment node

import { DAY_MS, timestampMs } from "@/lib/ops/analytics";
import {
  buildOwnershipBoard,
  describeIssues,
  escalationLines,
  filterIssues,
  summarizeIssues,
  type IssueFilters,
} from "@/lib/ops/issues";
import { DEFAULT_OPS_SETTINGS, type OpsArea } from "@/lib/ops/types";
import { makeOpsRequest } from "./fixtures/ops-requests";

const NOW = timestampMs("2026-05-21T08:00:00");
const settings = { escalationDays: 5 };

function makeArea(overrides: Partial<OpsArea> = {}): OpsArea {
  return {
    id: "area-1",
    group: "operations",
    name: "Pipelines",
    ownerName: "Alice",
    reportsTo: "Carol",
    sortOrder: 0,
    ...overrides,
  };
}

const areas: OpsArea[] = [
  makeArea({ id: "a-report", group: "reporting", name: "Sales reports", ownerName: "Rita", reportsTo: "Carol", sortOrder: 1 }),
  makeArea({ id: "a-ops-b", group: "operations", name: "Zeta loads", ownerName: "Omar", reportsTo: "Dina", sortOrder: 2 }),
  makeArea({ id: "a-ops-a", group: "operations", name: "Alpha loads", ownerName: "Olga", reportsTo: "Dina", sortOrder: 2 }),
  makeArea({ id: "a-ops-first", group: "operations", name: "Quality", ownerName: "Quinn", reportsTo: "", sortOrder: 0 }),
];

const ids = (items: { request: { interactionId: string } }[]) =>
  items.map((item) => item.request.interactionId);

const noFilters: IssueFilters = {
  status: "all",
  areaKey: "all",
  escalationLine: "all",
  escalationOnly: false,
  query: "",
};

describe("describeIssues", () => {
  it("skips merge requests", () => {
    const views = describeIssues(
      [makeOpsRequest({ interactionId: "I1" }), makeOpsRequest({ interactionId: "M1", isMergeRequest: true })],
      areas,
      settings,
      NOW,
    );
    expect(ids(views)).toEqual(["I1"]);
  });

  it("uses the area owner and escalation line, and the per-item owner override", () => {
    const [fallback, override] = describeIssues(
      [
        makeOpsRequest({ interactionId: "I1", areaId: "a-report" }),
        makeOpsRequest({ interactionId: "I2", areaId: "a-report", ownerName: "  Zed  " }),
      ],
      areas,
      settings,
      NOW,
    );
    expect(fallback.owner).toBe("Rita");
    expect(fallback.reportsTo).toBe("Carol");
    expect(fallback.area?.id).toBe("a-report");
    expect(override.owner).toBe("Zed");
  });

  it("treats a missing area as Unrouted and falls back to Unassigned", () => {
    const [none, gone, overridden] = describeIssues(
      [
        makeOpsRequest({ interactionId: "I1", areaId: null }),
        makeOpsRequest({ interactionId: "I2", areaId: "deleted-area" }),
        makeOpsRequest({ interactionId: "I3", areaId: null, ownerName: "Zed" }),
      ],
      areas,
      settings,
      NOW,
    );
    expect(none.area).toBeNull();
    expect(none.owner).toBe("Unassigned");
    expect(none.reportsTo).toBe("");
    expect(gone.area).toBeNull();
    expect(gone.owner).toBe("Unassigned");
    expect(overridden.owner).toBe("Zed");
  });

  it("measures open age from the assignment time", () => {
    const [view] = describeIssues(
      [makeOpsRequest({ status: "open", closeDate: null, assignmentTime: "2026-05-20T08:00:00" })],
      areas,
      settings,
      NOW,
    );
    expect(view.openAgeMs).toBe(DAY_MS);
  });

  it("escalates only after the threshold has been exceeded", () => {
    const assignedAt = (offsetMs: number) => {
      const iso = new Date(NOW - 5 * DAY_MS - offsetMs).toISOString().slice(0, 19);
      return makeOpsRequest({ status: "open", closeDate: null, assignmentTime: iso });
    };
    const [exact, justOver] = describeIssues([assignedAt(0), assignedAt(1000)], areas, settings, NOW);
    expect(exact.openAgeMs).toBe(5 * DAY_MS);
    expect(exact.needsEscalation).toBe(false);
    expect(justOver.openAgeMs).toBe(5 * DAY_MS + 1000);
    expect(justOver.needsEscalation).toBe(true);
  });

  it("honours the configured threshold", () => {
    const request = makeOpsRequest({ status: "pending", closeDate: null, assignmentTime: "2026-05-17T07:00:00" });
    const [tight] = describeIssues([request], areas, { escalationDays: 3 }, NOW);
    const [loose] = describeIssues([request], areas, { escalationDays: 5 }, NOW);
    expect(tight.needsEscalation).toBe(true);
    expect(loose.needsEscalation).toBe(false);
  });

  it("never escalates closed issues", () => {
    const [view] = describeIssues(
      [makeOpsRequest({ status: "closed", assignmentTime: "2026-01-01T00:00:00" })],
      areas,
      settings,
      NOW,
    );
    expect(view.openAgeMs).toBeNull();
    expect(view.needsEscalation).toBe(false);
  });

  it("does not escalate when the clock is unknown", () => {
    const [view] = describeIssues(
      [makeOpsRequest({ status: "open", closeDate: null, assignmentTime: "2026-01-01T00:00:00" })],
      areas,
      settings,
      null,
    );
    expect(view.openAgeMs).toBeNull();
    expect(view.needsEscalation).toBe(false);
  });

  it("works with the default settings", () => {
    expect(DEFAULT_OPS_SETTINGS.escalationDays).toBe(5);
  });
});

describe("buildOwnershipBoard", () => {
  it("lists every area, in group order, then sort order, then name", () => {
    const board = buildOwnershipBoard([], areas);
    expect(board.map((group) => group.key)).toEqual(["reporting", "operations"]);
    expect(board[0].label).toBe("Reporting & Dashboarding SPOCs");
    expect(board[1].cards.map((card) => card.key)).toEqual(["a-ops-first", "a-ops-a", "a-ops-b"]);
    board.flatMap((group) => group.cards).forEach((card) => {
      expect(card.open).toBe(0);
      expect(card.closed).toBe(0);
      expect(card.escalations).toBe(0);
      expect(card.oldestOpenMs).toBeNull();
      expect(card.avgResolutionMs).toBeNull();
    });
  });

  it("omits the Unrouted group when every issue has an area", () => {
    const issues = describeIssues([makeOpsRequest({ areaId: "a-report" })], areas, settings, NOW);
    expect(buildOwnershipBoard(issues, areas).some((group) => group.key === "unrouted")).toBe(false);
  });

  it("counts issues per area and adds a final Unrouted group", () => {
    const issues = describeIssues(
      [
        makeOpsRequest({ interactionId: "I1", areaId: "a-report", status: "open", closeDate: null, assignmentTime: "2026-05-10T08:00:00" }),
        makeOpsRequest({ interactionId: "I2", areaId: "a-report", status: "in_progress", closeDate: null, assignmentTime: "2026-05-19T08:00:00" }),
        makeOpsRequest({ interactionId: "I3", areaId: "a-report", status: "closed", assignmentTime: "2026-05-04T09:00:00", closeDate: "2026-05-04T11:00:00" }),
        makeOpsRequest({ interactionId: "I4", areaId: "a-report", status: "closed", assignmentTime: "2026-05-04T09:00:00", closeDate: "2026-05-04T13:00:00" }),
        makeOpsRequest({ interactionId: "I5", areaId: null, status: "pending", closeDate: null, assignmentTime: "2026-05-20T08:00:00" }),
        makeOpsRequest({ interactionId: "I6", areaId: "deleted", status: "closed" }),
      ],
      areas,
      settings,
      NOW,
    );
    const board = buildOwnershipBoard(issues, areas);
    expect(board.map((group) => group.key)).toEqual(["reporting", "operations", "unrouted"]);

    const reporting = board[0].cards[0];
    expect(reporting.key).toBe("a-report");
    expect(reporting.name).toBe("Sales reports");
    expect(reporting.owner).toBe("Rita");
    expect(reporting.reportsTo).toBe("Carol");
    expect(reporting.open).toBe(2);
    expect(reporting.closed).toBe(2);
    expect(reporting.escalations).toBe(1);
    expect(reporting.oldestOpenMs).toBe(11 * DAY_MS);
    expect(reporting.avgResolutionMs).toBe(3 * 3_600_000);

    const unrouted = board[2];
    expect(unrouted.label).toBe("Unrouted");
    expect(unrouted.cards).toHaveLength(1);
    expect(unrouted.cards[0]).toMatchObject({
      key: "unrouted",
      area: null,
      name: "Unrouted",
      owner: "",
      reportsTo: "",
      open: 1,
      closed: 1,
      escalations: 0,
      oldestOpenMs: DAY_MS,
    });
  });

  it("omits groups that have no areas", () => {
    const board = buildOwnershipBoard([], [makeArea({ group: "demand" })]);
    expect(board.map((group) => group.key)).toEqual(["demand"]);
  });
});

describe("filterIssues", () => {
  const requests = [
    makeOpsRequest({ interactionId: "SD1", areaId: "a-report", status: "open", closeDate: null, assignmentTime: "2026-05-01T08:00:00", requestTitle: "Broken dashboard", description: "Revenue tile is blank", requestorName: "Mona" }),
    makeOpsRequest({ interactionId: "SD2", areaId: "a-ops-a", status: "closed", assignmentTime: "2026-05-18T08:00:00", requestTitle: "Load delay", requestorName: "Sara" }),
    makeOpsRequest({ interactionId: "SD3", areaId: null, status: "pending", closeDate: null, assignmentTime: "2026-05-20T08:00:00", requestTitle: "Mystery", ownerName: "Zed" }),
    makeOpsRequest({ interactionId: "SD4", areaId: "a-ops-b", status: "in_progress", closeDate: null, assignmentTime: "2026-05-10T08:00:00", requestTitle: "Slow job" }),
  ];
  const issues = describeIssues(requests, areas, settings, NOW);
  const run = (patch: Partial<IssueFilters>) => ids(filterIssues(issues, { ...noFilters, ...patch }));

  it("returns everything, newest assignment first", () => {
    expect(run({})).toEqual(["SD3", "SD2", "SD4", "SD1"]);
  });

  it("filters by status", () => {
    expect(run({ status: "closed" })).toEqual(["SD2"]);
  });

  it("filters by area, including Unrouted", () => {
    expect(run({ areaKey: "a-report" })).toEqual(["SD1"]);
    expect(run({ areaKey: "unrouted" })).toEqual(["SD3"]);
  });

  it("filters by escalation line", () => {
    expect(run({ escalationLine: "Dina" })).toEqual(["SD2", "SD4"]);
    expect(run({ escalationLine: "Carol" })).toEqual(["SD1"]);
  });

  it("filters to issues needing escalation", () => {
    expect(run({ escalationOnly: true })).toEqual(["SD4", "SD1"]);
  });

  it("searches ID, title, description, requestor, owner and area name, ignoring case", () => {
    expect(run({ query: "sd2" })).toEqual(["SD2"]);
    expect(run({ query: "DASHBOARD" })).toEqual(["SD1"]);
    expect(run({ query: "tile is blank" })).toEqual(["SD1"]);
    expect(run({ query: "sara" })).toEqual(["SD2"]);
    expect(run({ query: "zed" })).toEqual(["SD3"]);
    expect(run({ query: "alpha loads" })).toEqual(["SD2"]);
    expect(run({ query: "  nothing matches  " })).toEqual([]);
  });

  it("combines filters", () => {
    expect(run({ status: "open", escalationOnly: true, areaKey: "a-report" })).toEqual(["SD1"]);
    expect(run({ escalationLine: "Dina", escalationOnly: true, query: "slow" })).toEqual(["SD4"]);
    expect(run({ status: "closed", escalationOnly: true })).toEqual([]);
  });
});

describe("escalationLines", () => {
  it("returns distinct, non-empty names in sorted order", () => {
    expect(escalationLines(areas)).toEqual(["Carol", "Dina"]);
    expect(escalationLines([])).toEqual([]);
  });
});

describe("summarizeIssues", () => {
  it("counts totals, statuses and escalations", () => {
    const issues = describeIssues(
      [
        makeOpsRequest({ interactionId: "I1", status: "open", closeDate: null, assignmentTime: "2026-05-01T08:00:00" }),
        makeOpsRequest({ interactionId: "I2", status: "pending", closeDate: null, assignmentTime: "2026-05-20T08:00:00" }),
        makeOpsRequest({ interactionId: "I3", status: "closed" }),
      ],
      areas,
      settings,
      NOW,
    );
    expect(summarizeIssues(issues)).toEqual({
      total: 3,
      counts: { open: 1, in_progress: 0, pending: 1, closed: 1 },
      needsEscalation: 1,
    });
  });
});
