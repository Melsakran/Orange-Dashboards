export const OPS_STATUSES = ["open", "in_progress", "pending", "closed"] as const;

export type OpsStatus = (typeof OPS_STATUSES)[number];

export const OPS_STATUS_LABELS: Record<OpsStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  pending: "Pending",
  closed: "Closed",
};

export function isOpsStatus(value: string): value is OpsStatus {
  return (OPS_STATUSES as readonly string[]).includes(value);
}

export type OpsSource = "import" | "manual";

export type OpsTeam = "operations" | "data_analytics";

export const OPS_TEAMS: readonly OpsTeam[] = ["operations", "data_analytics"];

export const OPS_TEAM_LABELS: Record<OpsTeam, string> = {
  operations: "Operations",
  data_analytics: "Data Analytics",
};

export type OpsAreaGroup = "reporting" | "operations" | "demand";

export const OPS_AREA_GROUPS: readonly OpsAreaGroup[] = ["reporting", "operations", "demand"];

export const OPS_AREA_GROUP_LABELS: Record<OpsAreaGroup, string> = {
  reporting: "Reporting & Dashboarding SPOCs",
  operations: "Data Lake Operations",
  demand: "Demand Projects",
};

export interface OpsArea {
  id: string;
  group: OpsAreaGroup;
  name: string;
  ownerName: string;
  reportsTo: string;
  sortOrder: number;
}

export interface OpsSettings {
  escalationDays: number;
}

export const DEFAULT_OPS_SETTINGS: OpsSettings = { escalationDays: 5 };

// Request timestamps are wall-clock values formatted as YYYY-MM-DDTHH:MM:SS with no timezone.
export interface OpsRequest {
  /** Database id; empty before the request is saved. */
  id: string;
  source: OpsSource;
  /** The team the request belongs to. */
  team: OpsTeam;
  /** Owning area for issues; null for merge requests and unrouted issues. */
  areaId: string | null;
  /** Per-item owner override; empty means use the area's owner. */
  ownerName: string;
  interactionId: string;
  status: OpsStatus;
  assignmentTime: string;
  title: string;
  requestTitle: string;
  description: string;
  requestorName: string;
  requestorKey: string;
  closeDate: string | null;
  closureCode: string;
  closureComments: string;
  assignedTo: string;
  assignedToKey: string;
  /** Request Type chosen in the service-desk form ("Svc Options"); empty for older exports. */
  requestType: string;
  isMergeRequest: boolean;
}

export interface OpsUpload {
  team: OpsTeam;
  uploadedAt: string;
  uploadedByEmail: string | null;
  fileName: string;
  rowCount: number;
}

export interface OpsDataset {
  requests: OpsRequest[];
  /** The latest upload of each team; null when the team has none yet. */
  uploads: Record<OpsTeam, OpsUpload | null>;
  /** Not loaded any more (always empty); removed with the ownership UI in Task 3. */
  areas: OpsArea[];
  /** Not loaded any more (always the default); removed with the ownership UI in Task 3. */
  settings: OpsSettings;
}

export function emptyOpsDataset(): OpsDataset {
  return {
    requests: [],
    uploads: { operations: null, data_analytics: null },
    areas: [],
    settings: { ...DEFAULT_OPS_SETTINGS },
  };
}
