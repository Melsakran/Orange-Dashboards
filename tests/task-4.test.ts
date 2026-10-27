import { describe, expect, it, vi } from "vitest";
import {
  aggregateKpis,
  groupStatuses,
  mapDashboardRows,
  type DashboardRows,
} from "@/lib/data/dashboard";
import {
  getAdminSession,
  requireAdmin,
  type AdminAuthDependencies,
} from "@/lib/auth/require-admin";
import { safeReturnTo } from "@/lib/auth/return-to";

const rows: DashboardRows = {
  workspace: {
    id: "workspace-a",
    slug: "alpha",
    name: "Alpha",
    description: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  statuses: [
    {
      id: "status-review",
      workspace_id: "workspace-a",
      name: "Review",
      color: "#ff7900",
      sort_order: 2,
      reporting_category: "active",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "status-blocked",
      workspace_id: "workspace-a",
      name: "Blocked",
      color: "#c62828",
      sort_order: 1,
      reporting_category: "risk",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "foreign-status",
      workspace_id: "workspace-b",
      name: "Foreign",
      color: "#000000",
      sort_order: 0,
      reporting_category: "completed",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  workItems: [
    {
      id: "child",
      workspace_id: "workspace-a",
      parent_id: "project",
      title: "Second child",
      description: null,
      status_id: "status-review",
      priority: "low",
      progress: 40,
      project_tier: "standard",
      start_date: null,
      end_date: null,
      last_week_status: null,
      current_status: null,
      release_tag: null,
      readiness_date: null,
      team_effort_wd: null,
      time_to_market_wd: null,
      assignee: null,
      sort_order: 3,
      sync_source: "local",
      jira_issue_id: null,
      jira_issue_key: null,
      jira_updated_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "project",
      workspace_id: "workspace-a",
      parent_id: null,
      title: "Project",
      description: "Description",
      status_id: "status-blocked",
      priority: "high",
      progress: 60,
      project_tier: "standard",
      start_date: "2026-01-01",
      end_date: null,
      last_week_status: null,
      current_status: null,
      release_tag: null,
      readiness_date: null,
      team_effort_wd: null,
      time_to_market_wd: null,
      assignee: "Admin",
      sort_order: 4,
      sync_source: "local",
      jira_issue_id: null,
      jira_issue_key: null,
      jira_updated_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "foreign-project",
      workspace_id: "workspace-b",
      parent_id: null,
      title: "Foreign",
      description: null,
      status_id: "foreign-status",
      priority: "medium",
      progress: 100,
      project_tier: "standard",
      start_date: null,
      end_date: null,
      last_week_status: null,
      current_status: null,
      release_tag: null,
      readiness_date: null,
      team_effort_wd: null,
      time_to_market_wd: null,
      assignee: null,
      sort_order: 0,
      sync_source: "local",
      jira_issue_id: null,
      jira_issue_key: null,
      jira_updated_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  comments: [
    {
      id: "comment-later",
      work_item_id: "project",
      author_name: "Later",
      body: "Second",
      created_at: "2026-01-03T00:00:00Z",
      updated_at: "2026-01-03T00:00:00Z",
    },
    {
      id: "comment-first",
      work_item_id: "project",
      author_name: "First",
      body: "First",
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    {
      id: "foreign-comment",
      work_item_id: "foreign-project",
      author_name: "Foreign",
      body: "Do not leak",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
};

describe("dashboard data mapping", () => {
  it("preserves normalized sort order and workspace isolation", () => {
    const dashboard = mapDashboardRows(rows);

    expect(dashboard.statuses.map((status) => status.name)).toEqual(["Blocked", "Review"]);
    expect(dashboard.projects.map((project) => project.id)).toEqual(["project"]);
    expect(dashboard.projects[0].subtasks.map((subtask) => subtask.id)).toEqual(["child"]);
    expect(dashboard.projects[0].comments.map((comment) => comment.author)).toEqual([
      "First",
      "Later",
    ]);
    expect(JSON.stringify(dashboard)).not.toContain("Foreign");
  });

  it("aggregates project KPIs without counting subtasks", () => {
    const dashboard = mapDashboardRows(rows);
    expect(aggregateKpis(dashboard.projects)).toEqual({
      total: 1,
      active: 0,
      needsAttention: 1,
      completed: 0,
      averageProgress: 60,
    });
  });

  it("groups custom statuses by reporting category in status order", () => {
    const dashboard = mapDashboardRows(rows);
    expect(groupStatuses(dashboard.statuses)).toEqual({
      active: ["status-review"],
      risk: ["status-blocked"],
      delayed: [],
      completed: [],
    });
  });

  it("maps PE Development delivery fields", () => {
    const dashboard = mapDashboardRows({
      ...rows,
      workItems: rows.workItems.map((item) =>
        item.id === "project"
          ? {
              ...item,
              end_date: "2026-02-01",
              readiness_date: "2026-02-10",
              team_effort_wd: 2.5,
              time_to_market_wd: 12,
            }
          : item),
    });

    expect(dashboard.projects[0]).toMatchObject({
      endDate: "2026-02-01",
      readinessDate: "2026-02-10",
      teamEffortWd: 2.5,
      timeToMarketWd: 12,
    });
    expect(dashboard.projects[0].subtasks[0]).not.toHaveProperty("readinessDate");
    expect(dashboard.projects[0].subtasks[0]).not.toHaveProperty("teamEffortWd");
    expect(dashboard.projects[0].subtasks[0]).not.toHaveProperty("timeToMarketWd");
  });

  it("maps a zero effort and numeric strings from PostgREST", () => {
    const dashboard = mapDashboardRows({
      ...rows,
      workItems: rows.workItems.map((item) =>
        item.id === "project"
          ? {
              ...item,
              team_effort_wd: 0,
              time_to_market_wd: "3.5" as unknown as number,
            }
          : item),
    });

    expect(dashboard.projects[0].teamEffortWd).toBe(0);
    expect(dashboard.projects[0].timeToMarketWd).toBe(3.5);
  });
});

describe("safe return paths", () => {
  it.each([
    ["https://evil.example/phish", "/hot-topics"],
    ["//evil.example/phish", "/hot-topics"],
    ["/\\evil.example", "/hot-topics"],
    ["javascript:alert(1)", "/hot-topics"],
    ["/platform-development?view=active", "/platform-development?view=active"],
  ])("maps %s to %s", (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected);
  });
});

describe("admin authorization", () => {
  const user = { id: "user-1", email: "admin@example.com" };

  it("returns an admin session only for a verified Supabase admin", async () => {
    const dependencies: AdminAuthDependencies = {
      getUser: vi.fn().mockResolvedValue(user),
      isAdmin: vi.fn().mockResolvedValue(true),
    };

    await expect(getAdminSession(dependencies)).resolves.toEqual({ user });
  });

  it("does not query membership without a verified user", async () => {
    const dependencies: AdminAuthDependencies = {
      getUser: vi.fn().mockResolvedValue(null),
      isAdmin: vi.fn(),
    };

    await expect(getAdminSession(dependencies)).resolves.toBeNull();
    expect(dependencies.isAdmin).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to a safe login return path", async () => {
    const redirect = vi.fn((location: string): never => {
      throw new Error(`redirect:${location}`);
    });

    await expect(
      requireAdmin(
        {
          getUser: vi.fn().mockResolvedValue(null),
          isAdmin: vi.fn(),
        },
        { returnTo: "//evil.example", redirect },
      ),
    ).rejects.toThrow("redirect:/login?next=%2Fhot-topics");
  });

  it("returns unauthorized without redirecting a signed-in non-admin", async () => {
    const redirect = vi.fn();
    await expect(
      requireAdmin(
        {
          getUser: vi.fn().mockResolvedValue(user),
          isAdmin: vi.fn().mockResolvedValue(false),
        },
        { redirect },
      ),
    ).resolves.toEqual({ ok: false, status: 403 });
    expect(redirect).not.toHaveBeenCalled();
  });
});
