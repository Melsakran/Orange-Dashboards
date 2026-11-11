import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import {
  DEFAULT_OPS_SETTINGS,
  emptyOpsDataset,
  OPS_AREA_GROUPS,
  type OpsArea,
  type OpsAreaGroup,
  type OpsDataset,
  type OpsRequest,
  type OpsSettings,
  type OpsSource,
  type OpsStatus,
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
    uploadedAt: row.uploaded_at,
    uploadedByEmail: row.uploaded_by_email,
    fileName: row.file_name,
    rowCount: row.row_count,
  };
}

function mapArea(row: Tables<"ops_areas">): OpsArea {
  return {
    id: row.id,
    group: row.area_group as OpsAreaGroup,
    name: row.name,
    ownerName: row.owner_name,
    reportsTo: row.reports_to,
    sortOrder: row.sort_order,
  };
}

function compareAreas(a: OpsArea, b: OpsArea): number {
  return (
    OPS_AREA_GROUPS.indexOf(a.group) - OPS_AREA_GROUPS.indexOf(b.group) ||
    a.sortOrder - b.sortOrder ||
    a.name.localeCompare(b.name)
  );
}

function mapSettings(row: Tables<"ops_settings"> | null): OpsSettings {
  return row ? { escalationDays: row.escalation_days } : { ...DEFAULT_OPS_SETTINGS };
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
  if (!client) return emptyOpsDataset();
  const [rows, uploadResult, areasResult, settingsResult] = await Promise.all([
    fetchAllRequests(client),
    client
      .from("ops_request_uploads")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("ops_areas")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    client.from("ops_settings").select("*").maybeSingle(),
  ]);
  if (uploadResult.error) loadFailure(uploadResult.error.message);
  if (areasResult.error) loadFailure(areasResult.error.message);
  if (settingsResult.error) loadFailure(settingsResult.error.message);
  return {
    requests: rows.map(mapOpsRequestRow),
    upload: uploadResult.data ? mapUpload(uploadResult.data) : null,
    areas: (areasResult.data ?? []).map(mapArea).sort(compareAreas),
    settings: mapSettings(settingsResult.data),
  };
}
