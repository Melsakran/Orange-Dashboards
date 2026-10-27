import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkItemFormValue } from "@/components/admin/work-item-form";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/types/database";

export class WorkItemMutationError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "WorkItemMutationError";
  }
}

export const WORK_ITEM_CONFLICT_CODE = "WORK_ITEM_CONFLICT";

function conflictFailure(): never {
  throw new WorkItemMutationError(
    "This work item changed by another administrator. Review the latest version and reapply your change.",
    false,
    WORK_ITEM_CONFLICT_CODE,
  );
}

function deliveryPayload(value: WorkItemFormValue) {
  return {
    ...(value.readinessDate !== undefined ? { readiness_date: value.readinessDate } : {}),
    ...(value.teamEffortWd !== undefined ? { team_effort_wd: value.teamEffortWd } : {}),
    ...(value.timeToMarketWd !== undefined ? { time_to_market_wd: value.timeToMarketWd } : {}),
    ...(value.projectTier !== undefined ? { project_tier: value.projectTier } : {}),
  };
}

export function buildWorkItemPayload(
  workspaceId: string,
  parentId: string | null,
  value: WorkItemFormValue,
  sortOrder: number,
  id?: string,
): TablesInsert<"work_items"> {
  return {
    ...(id ? { id } : {}),
    workspace_id: workspaceId,
    parent_id: parentId,
    title: value.title,
    description: value.description || null,
    status_id: value.statusId,
    priority: value.priority,
    progress: value.progress,
    start_date: value.startDate,
    end_date: value.endDate,
    last_week_status: value.lastWeekStatus,
    current_status: value.currentStatus,
    assignee: value.assignee,
    release_tag: value.releaseTag,
    ...deliveryPayload(value),
    sort_order: sortOrder,
  };
}

function updatePayload(value: WorkItemFormValue): TablesUpdate<"work_items"> {
  return {
    title: value.title,
    description: value.description || null,
    status_id: value.statusId,
    priority: value.priority,
    progress: value.progress,
    start_date: value.startDate,
    end_date: value.endDate,
    last_week_status: value.lastWeekStatus,
    current_status: value.currentStatus,
    assignee: value.assignee,
    release_tag: value.releaseTag,
    ...deliveryPayload(value),
  };
}

function mutationFailure(
  operation: string,
  error: { message: string; code?: string } | null,
): never {
  throw new WorkItemMutationError(
    `${operation} failed: ${error?.message ?? "No affected row was returned."}`,
    error?.code === "55P03",
    error?.code,
  );
}

export async function createWorkItem(
  supabase: SupabaseClient<Database>,
  payload: TablesInsert<"work_items">,
): Promise<Tables<"work_items">> {
  const { data, error } = await supabase
    .from("work_items")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) mutationFailure("Create", error);
  return data;
}

export async function updateWorkItem(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  itemId: string,
  expectedUpdatedAt: string,
  value: WorkItemFormValue,
): Promise<Tables<"work_items">> {
  const { data, error } = await supabase
    .from("work_items")
    .update(updatePayload(value))
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .eq("updated_at", expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) mutationFailure("Update", error);
  if (!data) conflictFailure();
  return data;
}

export async function deleteWorkItem(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  itemId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("work_items")
    .delete()
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error) mutationFailure("Delete", error);
  if (!data) conflictFailure();
}

export async function reorderWorkItems(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  parentId: string | null,
  orderedItemIds: string[],
): Promise<void> {
  if (!orderedItemIds.length || new Set(orderedItemIds).size !== orderedItemIds.length) {
    throw new WorkItemMutationError("Reorder requires a complete, unique sibling list.");
  }
  const { error } = await supabase.rpc("reorder_work_items", {
    p_workspace_id: workspaceId,
    p_parent_id: parentId,
    p_ordered_item_ids: orderedItemIds,
  });
  if (!error) return;
  if (error.code === "55P03") {
    throw new WorkItemMutationError(
      "Another administrator is changing this order. Try again in a moment.",
      true,
      error.code,
    );
  }
  mutationFailure("Reorder", error);
}

export async function replaceWorkItemTeamTracks(
  supabase: SupabaseClient<Database>,
  workItemId: string,
  tracks: NonNullable<WorkItemFormValue["teamTracks"]>,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("work_item_team_tracks")
    .delete()
    .eq("work_item_id", workItemId);
  if (deleteError) mutationFailure("Replace team tracks", deleteError);

  if (!tracks.length) return;

  const rows: TablesInsert<"work_item_team_tracks">[] = tracks.map((track, index) => ({
    work_item_id: workItemId,
    team_name: track.teamName,
    status_id: track.statusId,
    start_date: track.startDate,
    end_date: track.endDate,
    sort_order: index,
  }));

  const { error: insertError } = await supabase
    .from("work_item_team_tracks")
    .insert(rows);
  if (insertError) mutationFailure("Replace team tracks", insertError);
}
