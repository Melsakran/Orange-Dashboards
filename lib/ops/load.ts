import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import {
  emptyOpsDataset,
  OPS_TEAMS,
  type OpsDataset,
  type OpsRequest,
  type OpsSource,
  type OpsStatus,
  type OpsTeam,
  type OpsUpload,
} from "./types";

export const OPS_PAGE_SIZE = 1000;

type OpsClient = SupabaseClient<Database>;

function wallClock(value: string): string {
  return value.slice(0, 19);
}

export function mapOpsRequestRow(row: Tables<"ops_requests">): OpsRequest {
  return {
    id: row.id,
    source: row.source as OpsSource,
    team: row.team as OpsTeam,
    areaId: row.area_id,
    ownerName: row.owner_name,
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
    requestType: row.request_type,
    isMergeRequest: row.is_merge_request,
  };
}

function mapUpload(row: Tables<"ops_request_uploads">): OpsUpload {
  return {
    team: row.team as OpsTeam,
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

async function fetchLatestUpload(client: OpsClient, team: OpsTeam): Promise<OpsUpload | null> {
  const { data, error } = await client
    .from("ops_request_uploads")
    .select("*")
    .eq("team", team)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) loadFailure(error.message);
  return data ? mapUpload(data) : null;
}

export async function loadOpsDataset(client: OpsClient | null): Promise<OpsDataset> {
  if (!client) return emptyOpsDataset();
  const [rows, ...uploads] = await Promise.all([
    fetchAllRequests(client),
    ...OPS_TEAMS.map((team) => fetchLatestUpload(client, team)),
  ]);
  return {
    ...emptyOpsDataset(),
    requests: rows.map(mapOpsRequestRow),
    uploads: Object.fromEntries(OPS_TEAMS.map((team, index) => [team, uploads[index]])) as Record<
      OpsTeam,
      OpsUpload | null
    >,
  };
}
