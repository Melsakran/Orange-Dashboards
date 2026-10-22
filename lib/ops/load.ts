import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import type { OpsDataset, OpsRequest, OpsStatus, OpsUpload } from "./types";

export const OPS_PAGE_SIZE = 1000;

type OpsClient = SupabaseClient<Database>;

function wallClock(value: string): string {
  return value.slice(0, 19);
}

export function mapOpsRequestRow(row: Tables<"ops_requests">): OpsRequest {
  return {
    interactionId: row.interaction_id,
    status: row.status as OpsStatus,
    assignmentTime: wallClock(row.assignment_time),
    title: row.title,
    requestTitle: row.request_title,
    description: row.description,
    requestorName: row.requestor_name,
    requestorKey: row.requestor_key,
    closeDate: row.close_date ? wallClock(row.close_date) : null,
    closureCode: row.closure_code,
    closureComments: row.closure_comments,
    assignedTo: row.assigned_to,
    assignedToKey: row.assigned_to_key,
  };
}

function mapUpload(row: Tables<"ops_request_uploads">): OpsUpload {
  return {
    uploadedAt: row.uploaded_at,
    uploadedByEmail: row.uploaded_by_email,
    fileName: row.file_name,
    rowCount: row.row_count,
  };
}

function loadFailure(message: string): never {
  throw new Error(`Could not load Ops Requests: ${message}`);
}

async function fetchAllRequests(client: OpsClient): Promise<Tables<"ops_requests">[]> {
  const rows: Tables<"ops_requests">[] = [];
  for (let from = 0; ; from += OPS_PAGE_SIZE) {
    const { data, error } = await client
      .from("ops_requests")
      .select("*")
      .order("assignment_time", { ascending: false })
      .order("interaction_id", { ascending: true })
      .range(from, from + OPS_PAGE_SIZE - 1);
    if (error) loadFailure(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < OPS_PAGE_SIZE) return rows;
  }
}

export async function loadOpsDataset(client: OpsClient | null): Promise<OpsDataset> {
  if (!client) return { requests: [], upload: null };
  const [rows, uploadResult] = await Promise.all([
    fetchAllRequests(client),
    client
      .from("ops_request_uploads")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (uploadResult.error) loadFailure(uploadResult.error.message);
  return {
    requests: rows.map(mapOpsRequestRow),
    upload: uploadResult.data ? mapUpload(uploadResult.data) : null,
  };
}
