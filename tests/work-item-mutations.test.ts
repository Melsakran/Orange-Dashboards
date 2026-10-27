import {
  buildWorkItemPayload,
  createWorkItem,
  deleteWorkItem,
  reorderWorkItems,
  updateWorkItem,
  WorkItemMutationError,
} from "@/lib/data/work-item-mutations";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const draft = {
  title: "Project",
  description: "Description",
  statusId: "status-a",
  priority: "high" as const,
  progress: 45,
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  lastWeekStatus: null,
  currentStatus: null,
  assignee: "Avery",
  releaseTag: null,
};

describe("work item payloads", () => {
  it("builds project and one-level subtask payloads with fixed workspace membership", () => {
    expect(buildWorkItemPayload("workspace-a", null, draft, 2, "item-a")).toEqual({
      id: "item-a",
      workspace_id: "workspace-a",
      parent_id: null,
      title: "Project",
      description: "Description",
      status_id: "status-a",
      priority: "high",
      progress: 45,
      start_date: "2026-07-01",
      end_date: "2026-07-31",
      last_week_status: null,
      current_status: null,
      assignee: "Avery",
      release_tag: null,
      sort_order: 2,
    });
    expect(buildWorkItemPayload("workspace-a", "project-a", draft, 0, "subtask-a").parent_id)
      .toBe("project-a");
  });

  it("sends delivery fields only when the form provides them", () => {
    expect(buildWorkItemPayload("workspace-a", null, draft, 0)).not.toHaveProperty("readiness_date");
    expect(buildWorkItemPayload("workspace-a", null, {
      ...draft,
      readinessDate: "2026-08-05",
      teamEffortWd: 2.5,
      timeToMarketWd: null,
    }, 0)).toMatchObject({
      readiness_date: "2026-08-05",
      team_effort_wd: 2.5,
      time_to_market_wd: null,
    });
  });

  it("sends the project tier only when the form provides it", () => {
    expect(buildWorkItemPayload("workspace-a", null, draft, 0)).not.toHaveProperty("project_tier");
    expect(buildWorkItemPayload("workspace-a", null, { ...draft, projectTier: "critical" }, 0))
      .toMatchObject({ project_tier: "critical" });
  });
});

describe("work item mutations", () => {
  it("atomically matches updated_at for update and delete", async () => {
    const inserted = { id: "item-a", updated_at: "2026-07-15T10:00:00.000Z" };
    const insertSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const deleteSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const updateTimestampEq = vi.fn(() => ({
      select: () => ({ maybeSingle: updateSingle }),
    }));
    const deleteTimestampEq = vi.fn(() => ({
      select: () => ({ maybeSingle: deleteSingle }),
    }));
    const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));
    const update = vi.fn(() => ({
      eq: () => ({ eq: () => ({ eq: updateTimestampEq }) }),
    }));
    const remove = vi.fn(() => ({
      eq: () => ({ eq: () => ({ eq: deleteTimestampEq }) }),
    }));
    const client = {
      from: vi.fn(() => ({ insert, update, delete: remove })),
    } as unknown as SupabaseClient<Database>;

    await expect(createWorkItem(client, buildWorkItemPayload("workspace-a", null, draft, 0, "item-a")))
      .resolves.toBe(inserted);
    await expect(updateWorkItem(
      client,
      "workspace-a",
      "item-a",
      inserted.updated_at,
      draft,
    )).resolves.toBe(inserted);
    await expect(deleteWorkItem(
      client,
      "workspace-a",
      "item-a",
      inserted.updated_at,
    )).resolves.toBeUndefined();
    expect(updateTimestampEq).toHaveBeenCalledWith("updated_at", inserted.updated_at);
    expect(deleteTimestampEq).toHaveBeenCalledWith("updated_at", inserted.updated_at);

    updateSingle.mockResolvedValueOnce({ data: null, error: null });
    const staleUpdate = await updateWorkItem(
      client,
      "workspace-a",
      "item-a",
      "2026-07-15T09:00:00.000Z",
      draft,
    ).catch((caught) => caught);
    expect(staleUpdate).toBeInstanceOf(WorkItemMutationError);
    expect(staleUpdate).toMatchObject({
      code: "WORK_ITEM_CONFLICT",
      retryable: false,
    });
    expect(staleUpdate.message).toMatch(/changed by another administrator/i);

    deleteSingle.mockResolvedValueOnce({ data: null, error: null });
    const staleDelete = await deleteWorkItem(
      client,
      "workspace-a",
      "item-a",
      "2026-07-15T09:00:00.000Z",
    ).catch((caught) => caught);
    expect(staleDelete).toMatchObject({
      code: "WORK_ITEM_CONFLICT",
      retryable: false,
    });
  });

  it("sends delivery fields in the update payload only when provided", async () => {
    const updated = { id: "item-a", updated_at: "2026-07-15T10:00:00.000Z" };
    const updateSingle = vi.fn().mockResolvedValue({ data: updated, error: null });
    const update = vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({ select: () => ({ maybeSingle: updateSingle }) }),
        }),
      }),
    }));
    const client = {
      from: vi.fn(() => ({ update })),
    } as unknown as SupabaseClient<Database>;

    await updateWorkItem(client, "workspace-a", "item-a", updated.updated_at, {
      ...draft,
      readinessDate: "2026-08-05",
      teamEffortWd: 1,
      timeToMarketWd: 3,
      projectTier: "standard",
    });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      readiness_date: "2026-08-05",
      team_effort_wd: 1,
      time_to_market_wd: 3,
      project_tier: "standard",
    }));

    await updateWorkItem(client, "workspace-a", "item-a", updated.updated_at, draft);
    const plainPayload = (update.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0];
    expect(plainPayload).not.toHaveProperty("readiness_date");
    expect(plainPayload).not.toHaveProperty("team_effort_wd");
    expect(plainPayload).not.toHaveProperty("time_to_market_wd");
    expect(plainPayload).not.toHaveProperty("project_tier");
  });

  it("sends the complete ordered sibling list to the reorder RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: undefined, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await reorderWorkItems(client, "workspace-a", "project-a", ["one", "two", "three"]);

    expect(rpc).toHaveBeenCalledWith("reorder_work_items", {
      p_workspace_id: "workspace-a",
      p_parent_id: "project-a",
      p_ordered_item_ids: ["one", "two", "three"],
    });
  });

  it("marks SQLSTATE 55P03 reorder failures as retryable", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "55P03", message: "lock not available" },
      }),
    } as unknown as SupabaseClient<Database>;

    const error = await reorderWorkItems(client, "workspace-a", null, ["one", "two"])
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(WorkItemMutationError);
    expect(error.retryable).toBe(true);
    expect(error.message).toContain("Try again");
  });
});
