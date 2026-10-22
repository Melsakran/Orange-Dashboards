import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { OpsRequest } from "./types";

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
