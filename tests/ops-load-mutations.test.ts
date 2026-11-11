// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOpsDataset, mapOpsRequestRow, OPS_PAGE_SIZE } from "@/lib/ops/load";
import {
  emptyOpsDataset,
  opsTeamFromParam,
  opsTeamToParam,
  OPS_TEAM_LABELS,
  OPS_TEAMS,
} from "@/lib/ops/types";
import { replaceOpsRequests, toReplaceRows } from "@/lib/ops/mutations";
import type { Database, Tables } from "@/types/database";
import { makeOpsRequest } from "./fixtures/ops-requests";

function dbRow(id: string, overrides: Partial<Tables<"ops_requests">> = {}): Tables<"ops_requests"> {
  return {
    id: `uuid-${id}`,
    interaction_id: id,
    status: "closed",
    assignment_time: "2026-05-17T13:50:00",
    title: "New Task",
    request_title: "Deploy",
    description: "Deploy report",
    requestor_name: "NFawzy",
    requestor_key: "nfawzy",
    close_date: "2026-05-18T09:05:00",
    closure_code: "Successful",
    closure_comments: "Done",
    assigned_to: "helghandour",
    assigned_to_key: "helghandour",
    request_type: "Merge Request",
    is_merge_request: true,
    upload_id: "upload-1",
    source: "import",
    area_id: null,
    owner_name: "",
    team: "operations",
    ...overrides,
  };
}

function uploadRow(
  team: "operations" | "data_analytics",
  overrides: Partial<Tables<"ops_request_uploads">> = {},
): Tables<"ops_request_uploads"> {
  return {
    id: `upload-${team}`,
    uploaded_at: "2026-10-22T07:45:00+00:00",
    uploaded_by: "admin",
    uploaded_by_email: "admin@example.com",
    file_name: `${team}.csv`,
    row_count: 3,
    team,
    ...overrides,
  };
}

function fakeClient(options: {
  pages?: Tables<"ops_requests">[][];
  uploads?: Partial<Record<"operations" | "data_analytics", Tables<"ops_request_uploads">>>;
  requestsError?: { message: string };
  uploadError?: { message: string };
}) {
  const ranges: Array<[number, number]> = [];
  const tables: string[] = [];
  const uploadQueries: Array<{ eq: Array<[string, unknown]>; order: Array<[string, boolean | undefined]>; limit: number[] }> = [];
  const client = {
    from(table: string) {
      tables.push(table);
      if (table === "ops_requests") {
        const builder = {
          select: () => builder,
          order: () => builder,
          range: (from: number, to: number) => {
            ranges.push([from, to]);
            if (options.requestsError) return Promise.resolve({ data: null, error: options.requestsError });
            return Promise.resolve({ data: options.pages?.[ranges.length - 1] ?? [], error: null });
          },
        };
        return builder;
      }
      if (table !== "ops_request_uploads") throw new Error(`unexpected table ${table}`);
      const query = { eq: [] as Array<[string, unknown]>, order: [] as Array<[string, boolean | undefined]>, limit: [] as number[] };
      uploadQueries.push(query);
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          query.eq.push([column, value]);
          return builder;
        },
        order: (column: string, opts?: { ascending?: boolean }) => {
          query.order.push([column, opts?.ascending]);
          return builder;
        },
        limit: (count: number) => {
          query.limit.push(count);
          return builder;
        },
        maybeSingle: () => {
          if (options.uploadError) return Promise.resolve({ data: null, error: options.uploadError });
          const team = query.eq.find(([column]) => column === "team")?.[1] as
            | "operations"
            | "data_analytics"
            | undefined;
          return Promise.resolve({ data: (team && options.uploads?.[team]) ?? null, error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, ranges, tables, uploadQueries };
}

describe("loadOpsDataset", () => {
  it("returns an empty dataset without a Supabase client", async () => {
    expect(await loadOpsDataset(null)).toEqual(emptyOpsDataset());
    expect(emptyOpsDataset().requests).toEqual([]);
    expect(emptyOpsDataset().uploads).toEqual({ operations: null, data_analytics: null });
  });

  it("exposes the two teams and their labels", () => {
    expect(OPS_TEAMS).toEqual(["operations", "data_analytics"]);
    expect(OPS_TEAM_LABELS).toEqual({ operations: "Operations", data_analytics: "Data Analytics" });
  });

  it("pages through every request, maps team, and loads the latest upload per team", async () => {
    const firstPage = Array.from({ length: OPS_PAGE_SIZE }, (_, index) => dbRow(`SD${index}`));
    const { client, ranges, uploadQueries } = fakeClient({
      pages: [firstPage, [dbRow("SDlast", { team: "data_analytics" })]],
      uploads: {
        operations: uploadRow("operations", { file_name: "export.csv", row_count: 1001 }),
        data_analytics: uploadRow("data_analytics", {
          uploaded_by_email: null,
          file_name: "da.csv",
          row_count: 7,
        }),
      },
    });
    const dataset = await loadOpsDataset(client);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(dataset.requests).toHaveLength(1001);
    expect(dataset.requests[0].team).toBe("operations");
    expect(dataset.requests[1000].team).toBe("data_analytics");
    expect(dataset.uploads.operations).toEqual({
      team: "operations",
      uploadedAt: "2026-10-22T07:45:00+00:00",
      uploadedByEmail: "admin@example.com",
      fileName: "export.csv",
      rowCount: 1001,
    });
    expect(dataset.uploads.data_analytics).toEqual({
      team: "data_analytics",
      uploadedAt: "2026-10-22T07:45:00+00:00",
      uploadedByEmail: null,
      fileName: "da.csv",
      rowCount: 7,
    });
    expect(uploadQueries.map((query) => query.eq)).toEqual([
      [["team", "operations"]],
      [["team", "data_analytics"]],
    ]);
    for (const query of uploadQueries) {
      expect(query.order).toEqual([["uploaded_at", false]]);
      expect(query.limit).toEqual([1]);
    }
  });

  it("leaves a team without uploads as null", async () => {
    const { client } = fakeClient({ uploads: { operations: uploadRow("operations") } });
    const dataset = await loadOpsDataset(client);
    expect(dataset.uploads.operations).not.toBeNull();
    expect(dataset.uploads.data_analytics).toBeNull();
  });

  it("no longer loads areas or settings", async () => {
    const { client, tables } = fakeClient({});
    const dataset = await loadOpsDataset(client);
    expect(new Set(tables)).toEqual(new Set(["ops_requests", "ops_request_uploads"]));
    expect(dataset).not.toHaveProperty("areas");
    expect(dataset).not.toHaveProperty("settings");
  });

  it("throws a readable error when loading fails", async () => {
    await expect(loadOpsDataset(fakeClient({ requestsError: { message: "boom" } }).client))
      .rejects.toThrow("Could not load Ops Requests: boom");
    await expect(loadOpsDataset(fakeClient({ uploadError: { message: "nope" } }).client))
      .rejects.toThrow("Could not load Ops Requests: nope");
  });
});

describe("mapOpsRequestRow", () => {
  it("maps database columns and trims timestamp precision", () => {
    expect(mapOpsRequestRow(dbRow("SD1", {
      assignment_time: "2026-05-17T13:50:00.000",
      close_date: null,
      status: "open",
      source: "manual",
      team: "data_analytics",
    }))).toEqual({
      id: "uuid-SD1",
      source: "manual",
      team: "data_analytics",
      interactionId: "SD1",
      status: "open",
      assignmentTime: "2026-05-17T13:50:00",
      title: "New Task",
      requestTitle: "Deploy",
      description: "Deploy report",
      requestorName: "NFawzy",
      requestorKey: "nfawzy",
      closeDate: null,
      closureCode: "Successful",
      closureComments: "Done",
      assignedTo: "helghandour",
      assignedToKey: "helghandour",
      requestType: "Merge Request",
      isMergeRequest: true,
    });
  });
});

describe("replaceOpsRequests", () => {
  it("sends snake_case rows to the replace function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "upload-2", error: null });
    const request = makeOpsRequest({
      interactionId: "SD7",
      closeDate: null,
      status: "open",
      requestType: "Merge Request",
      isMergeRequest: true,
    });
    const id = await replaceOpsRequests({ rpc } as unknown as SupabaseClient<Database>, "data_analytics", "export.csv", [request]);
    expect(id).toBe("upload-2");
    expect(rpc).toHaveBeenCalledWith("replace_ops_requests", {
      p_file_name: "export.csv",
      p_rows: toReplaceRows([request]),
      p_team: "data_analytics",
    });
    expect(toReplaceRows([request])[0]).toEqual({
      interaction_id: "SD7",
      status: "open",
      assignment_time: "2026-05-04T09:00:00",
      title: "New Task",
      request_title: "Request",
      description: "",
      requestor_name: "NFawzy",
      requestor_key: "nfawzy",
      close_date: null,
      closure_code: "Successful",
      closure_comments: "",
      assigned_to: "HElGhandour",
      assigned_to_key: "helghandour",
      request_type: "Merge Request",
      is_merge_request: true,
    });
  });

  it("explains permission and other failures", async () => {
    const denied = vi.fn().mockResolvedValue({ data: null, error: { message: "admin access required" } });
    await expect(replaceOpsRequests({ rpc: denied } as unknown as SupabaseClient<Database>, "operations", "a.csv", []))
      .rejects.toThrow("Only admins can upload Ops Requests.");

    const broken = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(replaceOpsRequests({ rpc: broken } as unknown as SupabaseClient<Database>, "operations", "a.csv", []))
      .rejects.toThrow("Upload failed: timeout");

    const empty = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(replaceOpsRequests({ rpc: empty } as unknown as SupabaseClient<Database>, "operations", "a.csv", []))
      .rejects.toThrow("Upload failed: no upload id was returned.");
  });
});

describe("team URL parameter", () => {
  it("maps analytics to Data Analytics and everything else to Operations", () => {
    expect(opsTeamFromParam("analytics")).toBe("data_analytics");
    expect(opsTeamFromParam(undefined)).toBe("operations");
    expect(opsTeamFromParam("operations")).toBe("operations");
    expect(opsTeamFromParam("nonsense")).toBe("operations");
    expect(opsTeamFromParam(["analytics"])).toBe("operations");
  });

  it("leaves Operations out of the URL", () => {
    expect(opsTeamToParam("data_analytics")).toBe("analytics");
    expect(opsTeamToParam("operations")).toBeNull();
  });
});
