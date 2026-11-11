import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { OpsAreaGroup, OpsRequest, OpsStatus } from "./types";

export type OpsReplaceRow = {
  interaction_id: string;
  status: string;
  assignment_time: string;
  title: string;
  request_title: string;
  description: string;
  requestor_name: string;
  requestor_key: string;
  close_date: string | null;
  closure_code: string;
  closure_comments: string;
  assigned_to: string;
  assigned_to_key: string;
  request_type: string;
  is_merge_request: boolean;
};

export function toReplaceRows(requests: OpsRequest[]): OpsReplaceRow[] {
  return requests.map((request) => ({
    interaction_id: request.interactionId,
    status: request.status,
    assignment_time: request.assignmentTime,
    title: request.title,
    request_title: request.requestTitle,
    description: request.description,
    requestor_name: request.requestorName,
    requestor_key: request.requestorKey,
    close_date: request.closeDate,
    closure_code: request.closureCode,
    closure_comments: request.closureComments,
    assigned_to: request.assignedTo,
    assigned_to_key: request.assignedToKey,
    request_type: request.requestType,
    is_merge_request: request.isMergeRequest,
  }));
}

export async function replaceOpsRequests(
  supabase: SupabaseClient<Database>,
  fileName: string,
  requests: OpsRequest[],
): Promise<string> {
  const { data, error } = await supabase.rpc("replace_ops_requests", {
    p_file_name: fileName,
    p_rows: toReplaceRows(requests),
  });
  if (error) {
    throw new Error(
      /admin access required/i.test(error.message)
        ? "Only admins can upload Ops Requests."
        : `Upload failed: ${error.message}`,
    );
  }
  if (!data) throw new Error("Upload failed: no upload id was returned.");
  return data;
}

export interface OpsManualItemInput {
  id?: string;
  kind: "merge" | "issue";
  /** Empty lets the database generate MAN-XXXXXXXX. */
  interactionId: string;
  status: OpsStatus;
  /** YYYY-MM-DDTHH:MM:SS wall clock. */
  assignmentTime: string;
  closeDate: string | null;
  requestTitle: string;
  description: string;
  requestorName: string;
  assignedTo: string;
  closureCode: string;
  /** Issues only. */
  areaId: string | null;
  /** Issues only; empty means the area's owner. */
  ownerName: string;
}

export interface OpsAreaInput {
  id?: string;
  group: OpsAreaGroup;
  name: string;
  ownerName: string;
  reportsTo: string;
  sortOrder: number;
}

type OpsClient = SupabaseClient<Database>;

function saveFailure(message: string): Error {
  return new Error(
    /admin access required/i.test(message)
      ? "Only admins can change Ops Requests."
      : `Saving failed: ${message}`,
  );
}

export async function saveOpsManualItem(supabase: OpsClient, input: OpsManualItemInput): Promise<string> {
  const { data, error } = await supabase.rpc("save_ops_manual_item", {
    p_item: {
      id: input.id ?? null,
      kind: input.kind,
      interaction_id: input.interactionId,
      status: input.status,
      assignment_time: input.assignmentTime,
      close_date: input.closeDate,
      request_title: input.requestTitle,
      description: input.description,
      requestor_name: input.requestorName,
      assigned_to: input.assignedTo,
      closure_code: input.closureCode,
      area_id: input.areaId,
      owner_name: input.ownerName,
    },
  });
  if (error) throw saveFailure(error.message);
  if (!data) throw saveFailure("no id was returned.");
  return data;
}

export async function deleteOpsManualItem(supabase: OpsClient, id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_ops_manual_item", { p_id: id });
  if (error) throw saveFailure(error.message);
}

export async function routeOpsRequest(
  supabase: OpsClient,
  id: string,
  areaId: string | null,
  ownerName: string,
): Promise<void> {
  const { error } = await supabase.rpc("route_ops_request", {
    p_id: id,
    p_area_id: areaId,
    p_owner_name: ownerName,
  });
  if (error) throw saveFailure(error.message);
}

export async function saveOpsArea(supabase: OpsClient, area: OpsAreaInput): Promise<string> {
  const { data, error } = await supabase.rpc("save_ops_area", {
    p_area: {
      id: area.id ?? null,
      area_group: area.group,
      name: area.name,
      owner_name: area.ownerName,
      reports_to: area.reportsTo,
      sort_order: area.sortOrder,
    },
  });
  if (error) throw saveFailure(error.message);
  if (!data) throw saveFailure("no id was returned.");
  return data;
}

export async function deleteOpsArea(supabase: OpsClient, id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_ops_area", { p_id: id });
  if (error) throw saveFailure(error.message);
}

export async function saveOpsSettings(supabase: OpsClient, escalationDays: number): Promise<void> {
  const { error } = await supabase.rpc("save_ops_settings", { p_escalation_days: escalationDays });
  if (error) throw saveFailure(error.message);
}
