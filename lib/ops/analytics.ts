import { OPS_STATUSES, type OpsRequest, type OpsStatus } from "./types";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NONE_LABEL = "(none)";

export type OpsStatusFilter = OpsStatus | "all";

export interface RequestFilters {
  status: OpsStatusFilter;
  assigneeKey: string;
  query: string;
}

export interface OpsKpis {
  total: number;
  counts: Record<OpsStatus, number>;
  closureRate: number | null;
  avgResolutionMs: number | null;
  medianResolutionMs: number | null;
  avgOpenAgeMs: number | null;
  oldestOpenAgeMs: number | null;
}

export interface ClosureCodeRow {
  label: string;
  count: number;
  share: number;
}

export interface PersonRow {
  key: string;
  name: string;
  total: number;
  counts: Record<OpsStatus, number>;
  avgResolutionMs: number | null;
  medianResolutionMs: number | null;
}

export interface WeekBucket {
  weekStart: string;
  assigned: number;
  closed: number;
}

export function timestampMs(value: string): number {
  const [datePart, timePart = "00:00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

export function wallClockNow(now = new Date()): number {
  return Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
}

export function resolutionMs(request: OpsRequest): number | null {
  if (request.status !== "closed" || !request.closeDate) return null;
  return timestampMs(request.closeDate) - timestampMs(request.assignmentTime);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function resolutions(requests: OpsRequest[]): number[] {
  return requests.map(resolutionMs).filter((value): value is number => value !== null);
}

export function countByStatus(requests: OpsRequest[]): Record<OpsStatus, number> {
  const counts = Object.fromEntries(OPS_STATUSES.map((status) => [status, 0])) as Record<OpsStatus, number>;
  requests.forEach((request) => {
    counts[request.status] += 1;
  });
  return counts;
}

export function summarizeKpis(requests: OpsRequest[], nowMs: number | null): OpsKpis {
  const counts = countByStatus(requests);
  const resolved = resolutions(requests);
  const openAges = nowMs === null
    ? []
    : requests
        .filter((request) => request.status !== "closed")
        .map((request) => Math.max(0, nowMs - timestampMs(request.assignmentTime)));
  return {
    total: requests.length,
    counts,
    closureRate: requests.length ? counts.closed / requests.length : null,
    avgResolutionMs: average(resolved),
    medianResolutionMs: median(resolved),
    avgOpenAgeMs: average(openAges),
    oldestOpenAgeMs: openAges.length ? Math.max(...openAges) : null,
  };
}

function byCountThenLabel(a: { count: number; label: string }, b: { count: number; label: string }) {
  if (b.count !== a.count) return b.count - a.count;
  if (a.label === NONE_LABEL) return 1;
  if (b.label === NONE_LABEL) return -1;
  return a.label.localeCompare(b.label);
}

export function breakdownByClosureCode(requests: OpsRequest[]): ClosureCodeRow[] {
  const counts = new Map<string, number>();
  requests.forEach((request) => {
    const label = request.closureCode || NONE_LABEL;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: count / requests.length }))
    .sort(byCountThenLabel);
}

export function groupByPerson(
  requests: OpsRequest[],
  field: "assignee" | "requestor",
): PersonRow[] {
  type PersonGroup = {
    requests: OpsRequest[];
    spellings: Map<string, { count: number; firstIndex: number }>;
  };
  const groups = new Map<string, PersonGroup>();

  requests.forEach((request, index) => {
    const key = field === "assignee" ? request.assignedToKey : request.requestorKey;
    const name = field === "assignee" ? request.assignedTo : request.requestorName;
    const group: PersonGroup = groups.get(key) ?? { requests: [], spellings: new Map() };
    group.requests.push(request);
    const spelling = group.spellings.get(name) ?? { count: 0, firstIndex: index };
    spelling.count += 1;
    group.spellings.set(name, spelling);
    groups.set(key, group);
  });

  return [...groups.entries()]
    .map(([key, group]) => {
      const [name] = [...group.spellings.entries()].sort(
        ([, a], [, b]) => b.count - a.count || a.firstIndex - b.firstIndex,
      )[0];
      const resolved = resolutions(group.requests);
      return {
        key,
        name: key ? name : NONE_LABEL,
        total: group.requests.length,
        counts: countByStatus(group.requests),
        avgResolutionMs: average(resolved),
        medianResolutionMs: median(resolved),
      };
    })
    .sort((a, b) => byCountThenLabel(
      { count: a.total, label: a.name },
      { count: b.total, label: b.name },
    ));
}

function weekStartMs(ms: number): number {
  const date = new Date(ms);
  const offset = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offset);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function weeklyBuckets(requests: OpsRequest[]): WeekBucket[] {
  const assigned = new Map<number, number>();
  const closed = new Map<number, number>();
  requests.forEach((request) => {
    const assignedWeek = weekStartMs(timestampMs(request.assignmentTime));
    assigned.set(assignedWeek, (assigned.get(assignedWeek) ?? 0) + 1);
    if (request.status === "closed" && request.closeDate) {
      const closedWeek = weekStartMs(timestampMs(request.closeDate));
      closed.set(closedWeek, (closed.get(closedWeek) ?? 0) + 1);
    }
  });

  const weeks = [...assigned.keys(), ...closed.keys()];
  if (!weeks.length) return [];
  const buckets: WeekBucket[] = [];
  for (let week = Math.min(...weeks); week <= Math.max(...weeks); week += 7 * DAY_MS) {
    buckets.push({
      weekStart: isoDate(week),
      assigned: assigned.get(week) ?? 0,
      closed: closed.get(week) ?? 0,
    });
  }
  return buckets;
}

export function filterRequests(requests: OpsRequest[], filters: RequestFilters): OpsRequest[] {
  const query = filters.query.trim().toLowerCase();
  return requests
    .filter((request) => filters.status === "all" || request.status === filters.status)
    .filter((request) => filters.assigneeKey === "all" || request.assignedToKey === filters.assigneeKey)
    .filter((request) => !query || [
      request.interactionId,
      request.requestTitle,
      request.description,
      request.requestorName,
      request.assignedTo,
      request.closureComments,
    ].some((value) => value.toLowerCase().includes(query)))
    .sort((a, b) => b.assignmentTime.localeCompare(a.assignmentTime));
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < HOUR_MS) return `${Math.round(ms / 60_000)}m`;
  if (ms < DAY_MS) return `${(ms / HOUR_MS).toFixed(1)}h`;
  return `${(ms / DAY_MS).toFixed(1)}d`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(timestampMs(value));
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} ${hours}:${minutes}`;
}

export function formatWeekLabel(weekStart: string): string {
  const date = new Date(timestampMs(weekStart));
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

const uploadedAtFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Cairo",
});

export function formatUploadedAt(value: string): string {
  return uploadedAtFormatter.format(new Date(value));
}
