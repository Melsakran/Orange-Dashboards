import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectPriority, ProjectStatus } from "@/data/workspaces";
import type { Database, Tables } from "@/types/database";

export type ReportingCategory = "active" | "risk" | "delayed" | "completed";
export type WorkspaceRow = Tables<"workspaces">;
export type StatusRow = Tables<"statuses">;
export type WorkItemRow = Tables<"work_items">;
export type CommentRow = Tables<"comments">;
export type TeamTrackRow = Tables<"work_item_team_tracks">;

export interface DashboardRows {
  workspace: WorkspaceRow;
  statuses: StatusRow[];
  workItems: WorkItemRow[];
  comments: CommentRow[];
  teamTracks?: TeamTrackRow[];
}

export interface DashboardTeamTrack {
  id: string;
  teamName: string;
  statusId: string;
  statusName: string;
  statusColor: string;
  startDate?: string;
  endDate?: string;
  sortOrder: number;
}

export interface DashboardStatus {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  reportingCategory: ReportingCategory;
  updatedAt: string;
}

export interface DashboardComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export type OpsHealthStatus = "Clear" | "Delayed";

export interface DashboardWorkItem {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  statusId: string;
  statusName: string;
  statusColor: string;
  reportingCategory: ReportingCategory;
  owner: string;
  ownerRole?: string;
  priority: ProjectPriority;
  progress: number;
  startDate?: string;
  endDate?: string;
  lastWeekStatus?: OpsHealthStatus;
  currentStatus?: OpsHealthStatus;
  releaseTag?: string;
  readinessDate?: string;
  teamEffortWd?: number;
  timeToMarketWd?: number;
  teamTracks?: DashboardTeamTrack[];
  sortOrder: number;
  updatedAt: string;
  syncSource: "local" | "jira";
  jiraIssueKey?: string;
  jiraUrl?: string;
  comments: DashboardComment[];
}

export function projectMatchesStatusFilter(
  project: DashboardProject,
  statusId: string,
): boolean {
  if (project.teamTracks?.length) {
    return project.teamTracks.some((track) => track.statusId === statusId);
  }
  return project.statusId === statusId;
}

export interface DashboardProject extends DashboardWorkItem {
  subtasks: DashboardWorkItem[];
}

export interface DashboardKpis {
  total: number;
  active: number;
  needsAttention: number;
  completed: number;
  averageProgress: number;
}

export interface DashboardViewModel {
  id: string;
  slug: string;
  name: string;
  description: string;
  jiraLinked: boolean;
  jiraBrowseBaseUrl?: string;
  lastJiraSyncAt?: string;
  lastJiraSyncError?: string;
  statuses: DashboardStatus[];
  statusGroups: Record<ReportingCategory, string[]>;
  projects: DashboardProject[];
  kpis: DashboardKpis;
}

const reportingCategories: ReportingCategory[] = [
  "active",
  "risk",
  "delayed",
  "completed",
];

function asReportingCategory(value: string): ReportingCategory {
  if (reportingCategories.includes(value as ReportingCategory)) {
    return value as ReportingCategory;
  }
  throw new Error(`Unsupported reporting category: ${value}`);
}

function asPriority(value: string): ProjectPriority {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`Unsupported project priority: ${value}`);
}

function asOpsHealthStatus(value: string | null | undefined): OpsHealthStatus | undefined {
  if (value === "Clear" || value === "Delayed") return value;
  return undefined;
}

function projectStatus(category: ReportingCategory): ProjectStatus {
  return {
    active: "in-progress",
    risk: "at-risk",
    delayed: "delayed",
    completed: "completed",
  }[category] as ProjectStatus;
}

export function groupStatuses(
  statuses: DashboardStatus[],
): Record<ReportingCategory, string[]> {
  const groups: Record<ReportingCategory, string[]> = {
    active: [],
    risk: [],
    delayed: [],
    completed: [],
  };

  [...statuses]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((status) => groups[status.reportingCategory].push(status.id));

  return groups;
}

export function aggregateKpis(projects: DashboardProject[]): DashboardKpis {
  const totalProgress = projects.reduce((sum, project) => sum + project.progress, 0);

  return {
    total: projects.length,
    active: projects.filter((project) => project.reportingCategory === "active").length,
    needsAttention: projects.filter(
      (project) =>
        project.reportingCategory === "risk" || project.reportingCategory === "delayed",
    ).length,
    completed: projects.filter((project) => project.reportingCategory === "completed").length,
    averageProgress: projects.length ? Math.round(totalProgress / projects.length) : 0,
  };
}

export function mapDashboardRows(
  rows: DashboardRows,
  options?: {
    jiraLinked?: boolean;
    jiraBrowseBaseUrl?: string;
    lastJiraSyncAt?: string | null;
    lastJiraSyncError?: string | null;
  },
): DashboardViewModel {
  const workspaceId = rows.workspace.id;
  const statuses = rows.statuses
    .filter((status) => status.workspace_id === workspaceId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((status) => ({
      id: status.id,
      name: status.name,
      color: status.color,
      sortOrder: status.sort_order,
      reportingCategory: asReportingCategory(status.reporting_category),
      updatedAt: status.updated_at,
    }));
  const statusesById = new Map(statuses.map((status) => [status.id, status]));
  const workItems = rows.workItems
    .filter(
      (item) => item.workspace_id === workspaceId && statusesById.has(item.status_id),
    )
    .sort((a, b) => a.sort_order - b.sort_order);
  const itemIds = new Set(workItems.map((item) => item.id));
  const commentsByItem = new Map<string, DashboardComment[]>();
  const teamTracksByItem = new Map<string, DashboardTeamTrack[]>();

  rows.comments
    .filter((comment) => itemIds.has(comment.work_item_id))
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .forEach((comment) => {
      const comments = commentsByItem.get(comment.work_item_id) ?? [];
      comments.push({
        id: comment.id,
        author: comment.author_name,
        text: comment.body,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
      });
      commentsByItem.set(comment.work_item_id, comments);
    });

  (rows.teamTracks ?? [])
    .filter((track) => itemIds.has(track.work_item_id) && statusesById.has(track.status_id))
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order
        || a.team_name.localeCompare(b.team_name)
        || a.id.localeCompare(b.id),
    )
    .forEach((track) => {
      const status = statusesById.get(track.status_id);
      if (!status) return;
      const tracks = teamTracksByItem.get(track.work_item_id) ?? [];
      tracks.push({
        id: track.id,
        teamName: track.team_name,
        statusId: status.id,
        statusName: status.name,
        statusColor: status.color,
        ...(track.start_date ? { startDate: track.start_date } : {}),
        ...(track.end_date ? { endDate: track.end_date } : {}),
        sortOrder: track.sort_order,
      });
      teamTracksByItem.set(track.work_item_id, tracks);
    });

  function mapItem(item: WorkItemRow): DashboardWorkItem {
    const status = statusesById.get(item.status_id);
    if (!status) throw new Error(`Missing status ${item.status_id} for work item ${item.id}`);
    const teamTracks = teamTracksByItem.get(item.id);

    return {
      id: item.id,
      title: item.title,
      description: item.description ?? "",
      status: projectStatus(status.reportingCategory),
      statusId: status.id,
      statusName: status.name,
      statusColor: status.color,
      reportingCategory: status.reportingCategory,
      owner: item.assignee ?? "Unassigned",
      priority: asPriority(item.priority),
      progress: item.progress,
      ...(item.start_date ? { startDate: item.start_date } : {}),
      ...(item.end_date ? { endDate: item.end_date } : {}),
      ...(asOpsHealthStatus(item.last_week_status)
        ? { lastWeekStatus: asOpsHealthStatus(item.last_week_status) }
        : {}),
      ...(asOpsHealthStatus(item.current_status)
        ? { currentStatus: asOpsHealthStatus(item.current_status) }
        : {}),
      ...(item.release_tag ? { releaseTag: item.release_tag } : {}),
      ...(item.readiness_date ? { readinessDate: item.readiness_date } : {}),
      ...(item.team_effort_wd !== null && item.team_effort_wd !== undefined
        ? { teamEffortWd: Number(item.team_effort_wd) }
        : {}),
      ...(item.time_to_market_wd !== null && item.time_to_market_wd !== undefined
        ? { timeToMarketWd: Number(item.time_to_market_wd) }
        : {}),
      ...(teamTracks?.length ? { teamTracks } : {}),
      sortOrder: item.sort_order,
      updatedAt: item.updated_at,
      syncSource: item.sync_source === "jira" ? "jira" : "local",
      ...(item.jira_issue_key && options?.jiraBrowseBaseUrl
        ? {
            jiraIssueKey: item.jira_issue_key,
            jiraUrl: `${options.jiraBrowseBaseUrl}/browse/${item.jira_issue_key}`,
          }
        : item.jira_issue_key
          ? { jiraIssueKey: item.jira_issue_key }
          : {}),
      comments: commentsByItem.get(item.id) ?? [],
    };
  }

  const projects = workItems
    .filter((item) => item.parent_id === null)
    .map((item) => ({
      ...mapItem(item),
      subtasks: workItems
        .filter((subtask) => subtask.parent_id === item.id)
        .map(mapItem),
    }));

  return {
    id: rows.workspace.id,
    slug: rows.workspace.slug,
    name: rows.workspace.name,
    description: rows.workspace.description ?? "",
    jiraLinked: Boolean(options?.jiraLinked),
    ...(options?.jiraBrowseBaseUrl ? { jiraBrowseBaseUrl: options.jiraBrowseBaseUrl } : {}),
    ...(options?.lastJiraSyncAt ? { lastJiraSyncAt: options.lastJiraSyncAt } : {}),
    ...(options?.lastJiraSyncError ? { lastJiraSyncError: options.lastJiraSyncError } : {}),
    statuses,
    statusGroups: groupStatuses(statuses),
    projects,
    kpis: aggregateKpis(projects),
  };
}

function dataOrThrow<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error) throw new Error(`Unable to load ${label}: ${error.message}`);
  if (data === null) throw new Error(`${label} not found`);
  return data;
}

export async function loadDashboard(
  supabase: SupabaseClient<Database>,
  workspaceSlug: string,
): Promise<DashboardViewModel | null> {
  const workspaceResult = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (workspaceResult.error) {
    throw new Error(`Unable to load workspace: ${workspaceResult.error.message}`);
  }
  if (!workspaceResult.data) return null;

  const workspace = workspaceResult.data;
  const [statusesResult, workItemsResult, jiraSettingsResult] = await Promise.all([
    supabase
      .from("statuses")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("work_items")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("workspace_jira_settings")
      .select("enabled, last_synced_at, last_sync_error")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
  ]);

  const statuses = dataOrThrow(statusesResult.data, statusesResult.error, "statuses");
  const workItems = dataOrThrow(workItemsResult.data, workItemsResult.error, "work items");
  const itemIds = workItems.map((item) => item.id);
  let comments: CommentRow[] = [];
  let teamTracks: TeamTrackRow[] = [];

  if (itemIds.length) {
    const [commentsResult, teamTracksResult] = await Promise.all([
      supabase
        .from("comments")
        .select("*")
        .in("work_item_id", itemIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("work_item_team_tracks")
        .select("*")
        .in("work_item_id", itemIds)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
    ]);
    comments = dataOrThrow(commentsResult.data, commentsResult.error, "comments");
    // Older environments may not have the team-tracks table yet.
    if (!teamTracksResult.error) {
      teamTracks = teamTracksResult.data ?? [];
    } else if (!/work_item_team_tracks|schema cache/i.test(teamTracksResult.error.message)) {
      throw new Error(`Unable to load team tracks: ${teamTracksResult.error.message}`);
    }
  }

  return mapDashboardRows(
    { workspace, statuses, workItems, comments, teamTracks },
    {
      jiraLinked: Boolean(jiraSettingsResult.data?.enabled),
      jiraBrowseBaseUrl: resolveJiraBrowseBaseUrl(workspace.slug),
      lastJiraSyncAt: jiraSettingsResult.data?.last_synced_at ?? null,
      lastJiraSyncError: jiraSettingsResult.data?.last_sync_error ?? null,
    },
  );
}

function resolveJiraBrowseBaseUrl(workspaceSlug: string) {
  const prefixBySlug: Record<string, string> = {
    "pe-development": "JIRA_PE",
    "platform-development": "JIRA_PLATFORM",
    "pe-operations": "JIRA_PE_OPS",
    "development-operations": "JIRA_DEV_OPS",
    "datalake-operations": "JIRA_DATALAKE_OPS",
  };
  const prefix = prefixBySlug[workspaceSlug];
  if (!prefix) return undefined;
  return process.env[`${prefix}_BASE_URL`]?.replace(/\/$/, "");
}
