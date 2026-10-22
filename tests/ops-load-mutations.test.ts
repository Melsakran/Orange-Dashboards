// @vitest-environment node

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOpsDataset, mapOpsRequestRow, OPS_PAGE_SIZE } from "@/lib/ops/load";
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
    upload_id: "upload-1",
    ...overrides,
  };
}

function fakeClient(options: {
  pages?: Tables<"ops_requests">[][];
  upload?: Tables<"ops_request_uploads"> | null;
  requestsError?: { message: string };
  uploadError?: { message: string };
}) {
  const ranges: Array<[number, number]> = [];
  const client = {
    from(table: string) {
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
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(
          options.uploadError
            ? { data: null, error: options.uploadError }
            : { data: options.upload ?? null, error: null },
        ),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, ranges };
}

describe("loadOpsDataset", () => {
  it("returns an empty dataset without a Supabase client", async () => {
    expect(await loadOpsDataset(null)).toEqual({ requests: [], upload: null });
  });

  it("pages through every request and maps the latest upload", async () => {
    const firstPage = Array.from({ length: OPS_PAGE_SIZE }, (_, index) => dbRow(`SD${index}`));
    const { client, ranges } = fakeClient({
      pages: [firstPage, [dbRow("SDlast")]],
      upload: {
        id: "upload-1",
        uploaded_at: "2026-10-22T07:45:00+00:00",
        uploaded_by: "admin",
        uploaded_by_email: "admin@example.com",
        file_name: "export.csv",
        row_count: 1001,
      },
    });
    const dataset = await loadOpsDataset(client);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(dataset.requests).toHaveLength(1001);
    expect(dataset.upload).toEqual({
      uploadedAt: "2026-10-22T07:45:00+00:00",
      uploadedByEmail: "admin@example.com",
      fileName: "export.csv",
      rowCount: 1001,
    });
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
    }))).toEqual({
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
    });
  });
});

describe("replaceOpsRequests", () => {
  it("sends snake_case rows to the replace function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "upload-2", error: null });
    const request = makeOpsRequest({ interactionId: "SD7", closeDate: null, status: "open" });
    const id = await replaceOpsRequests({ rpc } as unknown as SupabaseClient<Database>, "export.csv", [request]);
    expect(id).toBe("upload-2");
    expect(rpc).toHaveBeenCalledWith("replace_ops_requests", {
      p_file_name: "export.csv",
      p_rows: toReplaceRows([request]),
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
    });
  });

  it("explains permission and other failures", async () => {
    const denied = vi.fn().mockResolvedValue({ data: null, error: { message: "admin access required" } });
    await expect(replaceOpsRequests({ rpc: denied } as unknown as SupabaseClient<Database>, "a.csv", []))
      .rejects.toThrow("Only admins can upload Ops Requests.");

    const broken = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(replaceOpsRequests({ rpc: broken } as unknown as SupabaseClient<Database>, "a.csv", []))
      .rejects.toThrow("Upload failed: timeout");

    const empty = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(replaceOpsRequests({ rpc: empty } as unknown as SupabaseClient<Database>, "a.csv", []))
      .rejects.toThrow("Upload failed: no upload id was returned.");
  });
});
