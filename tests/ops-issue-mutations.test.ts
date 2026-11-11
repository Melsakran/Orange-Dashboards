// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteOpsArea,
  deleteOpsManualItem,
  routeOpsRequest,
  saveOpsArea,
  saveOpsManualItem,
  saveOpsSettings,
  type OpsManualItemInput,
} from "@/lib/ops/mutations";
import type { Database } from "@/types/database";

function clientWith(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { rpc, client: { rpc } as unknown as SupabaseClient<Database> };
}

const denied = { error: { message: "admin access required" } };
const broken = { error: { message: "timeout" } };

const item: OpsManualItemInput = {
  team: "operations",
  kind: "issue",
  interactionId: "",
  status: "open",
  assignmentTime: "2026-05-20T08:00:00",
  closeDate: null,
  requestTitle: "Dashboard is empty",
  description: "No data since morning",
  requestorName: "Sara",
  assignedTo: "helghandour",
  closureCode: "",
  areaId: "area-1",
  ownerName: "",
};

describe("saveOpsManualItem", () => {
  it("sends the snake_case payload and returns the id", async () => {
    const { rpc, client } = clientWith({ data: "item-1" });
    expect(await saveOpsManualItem(client, item)).toBe("item-1");
    expect(rpc).toHaveBeenCalledWith("save_ops_manual_item", {
      p_item: {
        id: null,
        team: "operations",
        kind: "issue",
        interaction_id: "",
        status: "open",
        assignment_time: "2026-05-20T08:00:00",
        close_date: null,
        request_title: "Dashboard is empty",
        description: "No data since morning",
        requestor_name: "Sara",
        assigned_to: "helghandour",
        closure_code: "",
        area_id: "area-1",
        owner_name: "",
      },
    });
  });

  it("passes the id when editing", async () => {
    const { rpc, client } = clientWith({ data: "item-9" });
    await saveOpsManualItem(client, { ...item, id: "item-9", kind: "merge", areaId: null });
    expect(rpc.mock.calls[0][1].p_item).toMatchObject({ id: "item-9", kind: "merge", area_id: null });
  });

  it("sends the selected team", async () => {
    const { rpc, client } = clientWith({ data: "item-2" });
    await saveOpsManualItem(client, { ...item, team: "data_analytics" });
    expect(rpc.mock.calls[0][1].p_item).toMatchObject({ team: "data_analytics" });
  });

  it("omits area and owner when the input does not carry them", async () => {
    const { rpc, client } = clientWith({ data: "item-3" });
    const withoutArea: OpsManualItemInput = { ...item };
    delete withoutArea.areaId;
    delete withoutArea.ownerName;
    await saveOpsManualItem(client, withoutArea);
    const payload = rpc.mock.calls[0][1].p_item;
    expect(payload).toMatchObject({ team: "operations", kind: "issue" });
    expect(payload).not.toHaveProperty("area_id");
    expect(payload).not.toHaveProperty("owner_name");
  });

  it("explains permission and other failures", async () => {
    await expect(saveOpsManualItem(clientWith(denied).client, item))
      .rejects.toThrow("Only admins can change Ops Requests.");
    await expect(saveOpsManualItem(clientWith(broken).client, item))
      .rejects.toThrow("Saving failed: timeout");
  });

  it("fails when no id is returned", async () => {
    await expect(saveOpsManualItem(clientWith({}).client, item)).rejects.toThrow("Saving failed");
  });
});

describe("deleteOpsManualItem", () => {
  it("calls the delete function", async () => {
    const { rpc, client } = clientWith({});
    await deleteOpsManualItem(client, "item-1");
    expect(rpc).toHaveBeenCalledWith("delete_ops_manual_item", { p_id: "item-1" });
  });

  it("explains failures", async () => {
    await expect(deleteOpsManualItem(clientWith(denied).client, "x"))
      .rejects.toThrow("Only admins can change Ops Requests.");
    await expect(deleteOpsManualItem(clientWith(broken).client, "x"))
      .rejects.toThrow("Saving failed: timeout");
  });
});

describe("routeOpsRequest", () => {
  it("sends the area and owner override", async () => {
    const { rpc, client } = clientWith({});
    await routeOpsRequest(client, "req-1", "area-2", "Mona");
    expect(rpc).toHaveBeenCalledWith("route_ops_request", {
      p_id: "req-1",
      p_area_id: "area-2",
      p_owner_name: "Mona",
    });
  });

  it("allows clearing the area", async () => {
    const { rpc, client } = clientWith({});
    await routeOpsRequest(client, "req-1", null, "");
    expect(rpc).toHaveBeenCalledWith("route_ops_request", { p_id: "req-1", p_area_id: null, p_owner_name: "" });
  });

  it("explains failures", async () => {
    await expect(routeOpsRequest(clientWith(denied).client, "x", null, ""))
      .rejects.toThrow("Only admins can change Ops Requests.");
    await expect(routeOpsRequest(clientWith(broken).client, "x", null, ""))
      .rejects.toThrow("Saving failed: timeout");
  });
});

describe("saveOpsArea", () => {
  const area = {
    group: "demand" as const,
    name: "Promo Engine",
    ownerName: "Yasmine",
    reportsTo: "Mohamed Habib",
    sortOrder: 1,
  };

  it("sends the snake_case payload and returns the id", async () => {
    const { rpc, client } = clientWith({ data: "area-7" });
    expect(await saveOpsArea(client, { ...area, id: "area-7" })).toBe("area-7");
    expect(rpc).toHaveBeenCalledWith("save_ops_area", {
      p_area: {
        id: "area-7",
        area_group: "demand",
        name: "Promo Engine",
        owner_name: "Yasmine",
        reports_to: "Mohamed Habib",
        sort_order: 1,
      },
    });
  });

  it("sends a null id for a new area", async () => {
    const { rpc, client } = clientWith({ data: "area-8" });
    await saveOpsArea(client, area);
    expect(rpc.mock.calls[0][1].p_area.id).toBeNull();
  });

  it("explains failures", async () => {
    await expect(saveOpsArea(clientWith(denied).client, area))
      .rejects.toThrow("Only admins can change Ops Requests.");
    await expect(saveOpsArea(clientWith(broken).client, area))
      .rejects.toThrow("Saving failed: timeout");
    await expect(saveOpsArea(clientWith({}).client, area)).rejects.toThrow("Saving failed");
  });
});

describe("deleteOpsArea", () => {
  it("calls the delete function", async () => {
    const { rpc, client } = clientWith({});
    await deleteOpsArea(client, "area-1");
    expect(rpc).toHaveBeenCalledWith("delete_ops_area", { p_id: "area-1" });
  });

  it("explains failures", async () => {
    await expect(deleteOpsArea(clientWith(denied).client, "x"))
      .rejects.toThrow("Only admins can change Ops Requests.");
    await expect(deleteOpsArea(clientWith(broken).client, "x"))
      .rejects.toThrow("Saving failed: timeout");
  });
});

describe("saveOpsSettings", () => {
  it("sends the escalation days", async () => {
    const { rpc, client } = clientWith({});
    await saveOpsSettings(client, 7);
    expect(rpc).toHaveBeenCalledWith("save_ops_settings", { p_escalation_days: 7 });
  });

  it("explains failures", async () => {
    await expect(saveOpsSettings(clientWith(denied).client, 7))
      .rejects.toThrow("Only admins can change Ops Requests.");
    await expect(saveOpsSettings(clientWith(broken).client, 7))
      .rejects.toThrow("Saving failed: timeout");
  });
});
