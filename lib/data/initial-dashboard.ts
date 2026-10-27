import type { Workspace } from "@/data/workspaces";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  aggregateKpis,
  groupStatuses,
  type DashboardProject,
  type DashboardStatus,
  type DashboardViewModel,
  type ReportingCategory,
} from "./dashboard";

export type DashboardSource = "database" | "fixture";

interface InitialDashboardDependencies<Client> {
  envConfigured: boolean;
  createClient: () => Promise<Client>;
  load: (client: Client, workspaceSlug: string) => Promise<DashboardViewModel | null>;
  getAdminStatus: (client: Client) => Promise<boolean>;
  getFixture: (workspaceSlug: string) => DashboardViewModel | undefined;
}

export async function getAdminStatus(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;

  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

export async function resolveInitialDashboard<Client>(
  workspaceSlug: string,
  dependencies: InitialDashboardDependencies<Client>,
): Promise<{
  dashboard: DashboardViewModel | null;
  source: DashboardSource;
  isAdmin: boolean;
}> {
  if (!dependencies.envConfigured) {
    return {
      dashboard: dependencies.getFixture(workspaceSlug) ?? null,
      source: "fixture",
      isAdmin: false,
    };
  }

  const client = await dependencies.createClient();
  const [dashboard, isAdmin] = await Promise.all([
    dependencies.load(client, workspaceSlug),
    dependencies.getAdminStatus(client),
  ]);
  return {
    dashboard,
    source: "database",
    isAdmin,
  };
}

type FixtureStatusDefinition = {
  legacyStatus: DashboardProject["status"];
  name: string;
  category: ReportingCategory;
  color: string;
  key?: string;
};

const defaultFixtureStatusDefinitions: FixtureStatusDefinition[] = [
  { legacyStatus: "in-progress", name: "In Progress", category: "active", color: "#237b4b" },
  { legacyStatus: "at-risk", name: "At Risk", category: "risk", color: "#a94806" },
  { legacyStatus: "delayed", name: "Delayed", category: "delayed", color: "#b63027" },
  { legacyStatus: "completed", name: "Completed", category: "completed", color: "#246a91" },
];

const manualDeliveryFixtureStatuses: FixtureStatusDefinition[] = [
  { legacyStatus: "in-progress", name: "Planning", category: "active", color: "#237b4b" },
  { legacyStatus: "at-risk", name: "In Progress", category: "active", color: "#237b4b" },
  { legacyStatus: "completed", name: "Done", category: "completed", color: "#246a91" },
  { legacyStatus: "delayed", name: "Delayed", category: "delayed", color: "#b63027" },
];

const peDeliveryFixtureStatuses: FixtureStatusDefinition[] = [
  { legacyStatus: "in-progress", name: "Planning", category: "active", color: "#23b123", key: "planning" },
  { legacyStatus: "in-progress", name: "Development", category: "active", color: "#23b123", key: "development" },
  { legacyStatus: "in-progress", name: "Upcoming Delivery", category: "active", color: "#23b123", key: "upcoming-delivery" },
  { legacyStatus: "in-progress", name: "Testing", category: "active", color: "#246a91", key: "testing" },
  { legacyStatus: "completed", name: "Live", category: "completed", color: "#16a34a", key: "live" },
  { legacyStatus: "delayed", name: "Delayed", category: "delayed", color: "#ef4444", key: "delayed" },
  { legacyStatus: "at-risk", name: "On Hold", category: "risk", color: "#f59e0b", key: "on-hold" },
];

const peOpsFixtureStatuses: FixtureStatusDefinition[] = [
  { legacyStatus: "in-progress", name: "Promos", category: "active", color: "#e56f18" },
  { legacyStatus: "at-risk", name: "PE Platform", category: "active", color: "#246a91" },
  { legacyStatus: "completed", name: "Plot", category: "active", color: "#237b4b" },
  { legacyStatus: "delayed", name: "Connect", category: "active", color: "#a94806" },
];

const datalakeOpsFixtureStatuses: FixtureStatusDefinition[] = [
  { legacyStatus: "in-progress", name: "Data Ingestion", category: "active", color: "#e56f18", key: "data-ingestion" },
  { legacyStatus: "at-risk", name: "DAG Monitoring", category: "active", color: "#246a91", key: "dag-monitoring" },
  { legacyStatus: "completed", name: "Segmentation Files", category: "active", color: "#237b4b", key: "segmentation-files" },
  { legacyStatus: "delayed", name: "Reporting Delivery", category: "active", color: "#a94806", key: "reporting-delivery" },
  { legacyStatus: "in-progress", name: "Feeds", category: "active", color: "#0e7490", key: "feeds" },
  { legacyStatus: "in-progress", name: "Deployments", category: "active", color: "#475569", key: "deployments" },
];

const digitalFixtureStatuses: FixtureStatusDefinition[] = [
  { legacyStatus: "in-progress", name: "In Progress", category: "active", color: "#237b4b", key: "in-progress" },
  { legacyStatus: "at-risk", name: "Pending", category: "risk", color: "#f59e0b", key: "pending" },
  { legacyStatus: "delayed", name: "Cancelled", category: "delayed", color: "#64748b", key: "cancelled" },
  { legacyStatus: "completed", name: "Live", category: "completed", color: "#16a34a", key: "live" },
];

const dataLakeFixtureStatuses: FixtureStatusDefinition[] = [
  { legacyStatus: "in-progress", name: "Planning", category: "active", color: "#237b4b", key: "planning" },
  { legacyStatus: "in-progress", name: "In Progress", category: "active", color: "#237b4b", key: "in-progress" },
  { legacyStatus: "at-risk", name: "Pending", category: "risk", color: "#f59e0b", key: "pending" },
  { legacyStatus: "at-risk", name: "On Hold", category: "risk", color: "#f59e0b", key: "on-hold" },
  { legacyStatus: "in-progress", name: "Testing", category: "active", color: "#246a91", key: "testing" },
  { legacyStatus: "completed", name: "Done", category: "completed", color: "#16a34a", key: "done" },
];

const fixtureStatusesBySlug: Record<string, FixtureStatusDefinition[]> = {
  "platforms-development": manualDeliveryFixtureStatuses,
  "pe-delivery": peDeliveryFixtureStatuses,
  "pe-ops": peOpsFixtureStatuses,
  "datalake-ops": datalakeOpsFixtureStatuses,
  digital: digitalFixtureStatuses,
  "data-lake": dataLakeFixtureStatuses,
  "reports-and-insights": dataLakeFixtureStatuses,
};

export function mapFixtureWorkspace(workspace: Workspace): DashboardViewModel {
  const fixtureStatusDefinitions =
    fixtureStatusesBySlug[workspace.slug] ?? defaultFixtureStatusDefinitions;
  const statuses: DashboardStatus[] = fixtureStatusDefinitions.map((definition, sortOrder) => ({
    id: `fixture-${definition.key ?? definition.legacyStatus}`,
    name: definition.name,
    color: definition.color,
    sortOrder,
    reportingCategory: definition.category,
    updatedAt: "",
  }));
  const statusByLegacyName = new Map(
    fixtureStatusDefinitions.map((definition, index) => [
      definition.legacyStatus,
      statuses[index],
    ]),
  );
  const projects: DashboardProject[] = workspace.projects.map((project, sortOrder) => {
    const status = statusByLegacyName.get(project.status);
    if (!status) throw new Error(`Unsupported fixture status: ${project.status}`);
    return {
      ...project,
      statusId: status.id,
      statusName: status.name,
      statusColor: status.color,
      reportingCategory: status.reportingCategory,
      sortOrder,
      updatedAt: "",
      syncSource: "local" as const,
      comments: project.comments.map((comment, index) => ({
        id: `fixture-${project.id}-comment-${index}`,
        ...comment,
        createdAt: "",
        updatedAt: "",
      })),
      subtasks: [],
    };
  });

  return {
    id: `fixture-${workspace.slug}`,
    slug: workspace.slug,
    name: workspace.name,
    description: workspace.description,
    jiraLinked: false,
    statuses,
    statusGroups: groupStatuses(statuses),
    projects,
    kpis: aggregateKpis(projects),
  };
}
