"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { OpsStatusFilter } from "@/lib/ops/analytics";
import {
  buildOwnershipBoard,
  describeIssues,
  escalationLines,
  filterIssues,
  summarizeIssues,
  type IssueFilters,
  type IssueView,
} from "@/lib/ops/issues";
import {
  DEFAULT_OPS_SETTINGS,
  OPS_STATUSES,
  OPS_STATUS_LABELS,
  type OpsArea,
  type OpsRequest,
  type OpsSettings,
  type OpsStatus,
} from "@/lib/ops/types";
import { IssueList } from "./issue-list";
import { IssuesBoard } from "./issues-board";
import { useClientNow } from "./use-client-now";

const STATUS_COLORS: Record<OpsStatus, string> = {
  open: "#b63027",
  in_progress: "#246a91",
  pending: "#a94806",
  closed: "#237b4b",
};

const ESCALATION_COLOR = "#b63027";

const INITIAL_FILTERS: IssueFilters = {
  status: "all",
  areaKey: "all",
  escalationLine: "all",
  escalationOnly: false,
  query: "",
};

const NO_AREAS: OpsArea[] = [];

export function IssuesPanel({
  requests,
  areas = NO_AREAS,
  settings = DEFAULT_OPS_SETTINGS,
  rowActions,
}: {
  /** Every Ops item; the panel keeps only issues. */
  requests: OpsRequest[];
  areas?: OpsArea[];
  settings?: OpsSettings;
  /** Optional extra cell per row (admin actions). */
  rowActions?: (issue: IssueView) => ReactNode;
}) {
  const nowMs = useClientNow();
  const [filters, setFilters] = useState<IssueFilters>(INITIAL_FILTERS);

  const issues = useMemo(
    () => describeIssues(requests, areas, settings, nowMs),
    [requests, areas, settings, nowMs],
  );
  const summary = useMemo(() => summarizeIssues(issues), [issues]);
  const groups = useMemo(() => buildOwnershipBoard(issues, areas), [issues, areas]);
  const lines = useMemo(() => escalationLines(areas), [areas]);
  const visible = useMemo(() => filterIssues(issues, filters), [issues, filters]);

  function change(changes: Partial<IssueFilters>) {
    setFilters((current) => ({ ...current, ...changes }));
  }

  return (
    <>
      <section className="kpi-grid kpi-grid-status" aria-label="Issue overview">
        <div className="kpi-card" style={{ ["--kpi-accent" as string]: "var(--orange)" }}>
          <p className="kpi-label">Total issues</p>
          <p className="kpi-value">{summary.total}</p>
          <p className="kpi-meta">Excluding merge requests</p>
        </div>
        {OPS_STATUSES.map((status) => {
          const active = filters.status === status;
          return (
            <button
              type="button"
              key={status}
              className="kpi-card kpi-card-button"
              data-active={active}
              aria-pressed={active}
              style={{ ["--kpi-accent" as string]: STATUS_COLORS[status] }}
              onClick={() => change({ status: (active ? "all" : status) as OpsStatusFilter })}
            >
              <p className="kpi-label">{OPS_STATUS_LABELS[status]}</p>
              <p className="kpi-value">{summary.counts[status]}</p>
              <p className="kpi-meta">Click to filter issues</p>
            </button>
          );
        })}
        <button
          type="button"
          className="kpi-card kpi-card-button"
          data-active={filters.escalationOnly}
          aria-pressed={filters.escalationOnly}
          style={{ ["--kpi-accent" as string]: ESCALATION_COLOR }}
          onClick={() => change({ escalationOnly: !filters.escalationOnly })}
        >
          <p className="kpi-label">Needs escalation</p>
          <p className="kpi-value">{summary.needsEscalation}</p>
          <p className="kpi-meta">Open more than {settings.escalationDays} days</p>
        </button>
      </section>
      <IssuesBoard
        groups={groups}
        areaKey={filters.areaKey}
        onAreaKeyChange={(areaKey) => change({ areaKey })}
      />
      <IssueList
        issues={issues}
        visible={visible}
        filters={filters}
        onFiltersChange={change}
        groups={groups}
        lines={lines}
        rowActions={rowActions}
      />
    </>
  );
}
