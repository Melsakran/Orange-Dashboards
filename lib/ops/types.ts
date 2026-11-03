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

// Request timestamps are wall-clock values formatted as YYYY-MM-DDTHH:MM:SS with no timezone.
export interface OpsRequest {
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

export type OpsRequestKind = "merge" | "other";

export const OPS_REQUEST_KIND_LABELS: Record<OpsRequestKind, string> = {
  merge: "Merge requests",
  other: "Other requests",
};

export function requestKindOf(request: Pick<OpsRequest, "isMergeRequest">): OpsRequestKind {
  return request.isMergeRequest ? "merge" : "other";
}

export interface OpsUpload {
  uploadedAt: string;
  uploadedByEmail: string | null;
  fileName: string;
  rowCount: number;
}

export interface OpsDataset {
  requests: OpsRequest[];
  upload: OpsUpload | null;
}
