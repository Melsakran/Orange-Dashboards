// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteOpsManualItem,
  saveOpsManualItem,
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
      },
    });
  });

  it("passes the id when editing", async () => {
    const { rpc, client } = clientWith({ data: "item-9" });
    await saveOpsManualItem(client, { ...item, id: "item-9", kind: "merge" });
    expect(rpc.mock.calls[0][1].p_item).toMatchObject({ id: "item-9", kind: "merge" });
  });

  it("sends the selected team", async () => {
    const { rpc, client } = clientWith({ data: "item-2" });
    await saveOpsManualItem(client, { ...item, team: "data_analytics" });
    expect(rpc.mock.calls[0][1].p_item).toMatchObject({ team: "data_analytics" });
  });

  it("never sends the retired area and owner fields", async () => {
    const { rpc, client } = clientWith({ data: "item-3" });
    await saveOpsManualItem(client, item);
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
