import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { updateWorkspaceTag } from "@/lib/data/workspace-mutations";
import type { Database } from "@/types/database";

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ select: () => ({ maybeSingle }) }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from } as unknown as SupabaseClient<Database>, from, update, eq };
}

describe("updateWorkspaceTag", () => {
  it("saves the tag on the workspace row", async () => {
    const fake = fakeClient({ data: { id: "ws-1" }, error: null });
    await updateWorkspaceTag(fake.client, "ws-1", "October/November");
    expect(fake.from).toHaveBeenCalledWith("workspaces");
    expect(fake.update).toHaveBeenCalledWith({ tag_label: "October/November" });
    expect(fake.eq).toHaveBeenCalledWith("id", "ws-1");
  });

  it("reports database errors and silently blocked updates", async () => {
    await expect(
      updateWorkspaceTag(fakeClient({ data: null, error: { message: "offline" } }).client, "ws-1", null),
    ).rejects.toThrow("Saving the tag failed: offline");
    await expect(
      updateWorkspaceTag(fakeClient({ data: null, error: null }).client, "ws-1", null),
    ).rejects.toThrow("Saving the tag failed: the workspace was not updated.");
  });
});
