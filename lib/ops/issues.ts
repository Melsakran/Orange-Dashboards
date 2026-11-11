import {
  average,
  countByStatus,
  DAY_MS,
  resolutionMs,
  timestampMs,
  type OpsStatusFilter,
} from "./analytics";
import {
  OPS_AREA_GROUP_LABELS,
  OPS_AREA_GROUPS,
  type OpsArea,
  type OpsAreaGroup,
  type OpsRequest,
  type OpsSettings,
  type OpsStatus,
} from "./types";

const UNROUTED_KEY = "unrouted";
const UNROUTED_LABEL = "Unrouted";
const UNASSIGNED_LABEL = "Unassigned";

export interface IssueView {
  request: OpsRequest;
  /** null = Unrouted (no area, or the area no longer exists). */
  area: OpsArea | null;
  owner: string;
  reportsTo: string;
  /** Not closed and the clock is known: nowMs - assignment. */
  openAgeMs: number | null;
  needsEscalation: boolean;
}

export interface OwnershipCard {
  /** Area id, or "unrouted". */
  key: string;
  area: OpsArea | null;
  name: string;
  owner: string;
  reportsTo: string;
  open: number;
  closed: number;
  escalations: number;
  oldestOpenMs: number | null;
  avgResolutionMs: number | null;
}

export interface OwnershipGroup {
  key: OpsAreaGroup | "unrouted";
  label: string;
  cards: OwnershipCard[];
}

export interface IssueFilters {
  status: OpsStatusFilter;
  /** "all" | area id | "unrouted" */
  areaKey: string;
  /** "all" | reportsTo name */
  escalationLine: string;
  escalationOnly: boolean;
  query: string;
}

export function describeIssues(
  requests: OpsRequest[],
  areas: OpsArea[],
  settings: OpsSettings,
  nowMs: number | null,
): IssueView[] {
  const areaById = new Map(areas.map((area) => [area.id, area]));
  return requests
    .filter((request) => !request.isMergeRequest)
    .map((request) => {
      const area = (request.areaId && areaById.get(request.areaId)) || null;
      const openAgeMs = nowMs === null || request.status === "closed"
        ? null
        : Math.max(0, nowMs - timestampMs(request.assignmentTime));
      return {
        request,
        area,
        owner: request.ownerName.trim() || area?.ownerName || UNASSIGNED_LABEL,
        reportsTo: area?.reportsTo ?? "",
        openAgeMs,
        needsEscalation: openAgeMs !== null && openAgeMs > settings.escalationDays * DAY_MS,
      };
    });
}

function buildCard(
  key: string,
  area: OpsArea | null,
  issues: IssueView[],
): OwnershipCard {
  const openAges = issues
    .map((issue) => issue.openAgeMs)
    .filter((age): age is number => age !== null);
  const resolved = issues
    .map((issue) => resolutionMs(issue.request))
    .filter((value): value is number => value !== null);
  return {
    key,
    area,
    name: area?.name ?? UNROUTED_LABEL,
    owner: area?.ownerName ?? "",
    reportsTo: area?.reportsTo ?? "",
    open: issues.filter((issue) => issue.request.status !== "closed").length,
    closed: issues.filter((issue) => issue.request.status === "closed").length,
    escalations: issues.filter((issue) => issue.needsEscalation).length,
    oldestOpenMs: openAges.length ? Math.max(...openAges) : null,
    avgResolutionMs: average(resolved),
  };
}

export function buildOwnershipBoard(issues: IssueView[], areas: OpsArea[]): OwnershipGroup[] {
  const groups: OwnershipGroup[] = [];

  OPS_AREA_GROUPS.forEach((group) => {
    const cards = areas
      .filter((area) => area.group === group)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((area) => buildCard(area.id, area, issues.filter((issue) => issue.area?.id === area.id)));
    if (cards.length) groups.push({ key: group, label: OPS_AREA_GROUP_LABELS[group], cards });
  });

  const unrouted = issues.filter((issue) => issue.area === null);
  if (unrouted.length) {
    groups.push({
      key: UNROUTED_KEY,
      label: UNROUTED_LABEL,
      cards: [buildCard(UNROUTED_KEY, null, unrouted)],
    });
  }

  return groups;
}

export function filterIssues(issues: IssueView[], filters: IssueFilters): IssueView[] {
  const query = filters.query.trim().toLowerCase();
  return issues
    .filter((issue) => filters.status === "all" || issue.request.status === filters.status)
    .filter((issue) => filters.areaKey === "all" || (issue.area?.id ?? UNROUTED_KEY) === filters.areaKey)
    .filter((issue) => filters.escalationLine === "all" || issue.reportsTo === filters.escalationLine)
    .filter((issue) => !filters.escalationOnly || issue.needsEscalation)
    .filter((issue) => !query || [
      issue.request.interactionId,
      issue.request.requestTitle,
      issue.request.description,
      issue.request.requestorName,
      issue.owner,
      issue.area?.name ?? "",
    ].some((value) => value.toLowerCase().includes(query)))
    .sort((a, b) => b.request.assignmentTime.localeCompare(a.request.assignmentTime));
}

export function escalationLines(areas: OpsArea[]): string[] {
  return [...new Set(areas.map((area) => area.reportsTo).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function summarizeIssues(issues: IssueView[]): {
  total: number;
  counts: Record<OpsStatus, number>;
  needsEscalation: number;
} {
  return {
    total: issues.length,
    counts: countByStatus(issues.map((issue) => issue.request)),
    needsEscalation: issues.filter((issue) => issue.needsEscalation).length,
  };
}
