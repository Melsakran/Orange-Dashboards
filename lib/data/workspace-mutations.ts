import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function updateWorkspaceTag(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  tag: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from("workspaces")
    .update({ tag_label: tag })
    .eq("id", workspaceId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Saving the tag failed: ${error.message}`);
  if (!data) throw new Error("Saving the tag failed: the workspace was not updated.");
}
