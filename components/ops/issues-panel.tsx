"use client";

import { useMemo, useState } from "react";
import type { OpsStatusFilter } from "@/lib/ops/analytics";
import {
  buildOwnershipBoard,
  describeIssues,
  escalationLines,
  filterIssues,
  summarizeIssues,
  type IssueFilters,
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
import type { OpsAdminContext } from "./request-admin-actions";
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
  admin,
}: {
  /** Every Ops item; the panel keeps only issues. */
  requests: OpsRequest[];
  areas?: OpsArea[];
  settings?: OpsSettings;
  /** Admin-only actions in the issue details dialog; omitted for visitors. */
  admin?: OpsAdminContext;
}) {
  const nowMs = useClientNow();
  const [chosenFilters, setFilters] = useState<IssueFilters>(INITIAL_FILTERS);

  const issues = useMemo(
    () => describeIssues(requests, areas, settings, nowMs),
    [requests, areas, settings, nowMs],
  );
  const summary = useMemo(() => summarizeIssues(issues), [issues]);
  const groups = useMemo(() => buildOwnershipBoard(issues, areas), [issues, areas]);
  const lines = useMemo(() => escalationLines(areas), [areas]);
  // The chosen area or line can disappear after a refresh (last unrouted issue routed, area deleted
  // or re-pointed); fall back to "all" so the list never dead-ends on a filter nothing can clear.
  const filters = useMemo<IssueFilters>(() => {
    const areaKnown = groups.some((group) => group.cards.some((card) => card.key === chosenFilters.areaKey));
    return {
      ...chosenFilters,
      areaKey: chosenFilters.areaKey !== "all" && !areaKnown ? "all" : chosenFilters.areaKey,
      escalationLine:
        chosenFilters.escalationLine !== "all" && !lines.includes(chosenFilters.escalationLine)
          ? "all"
          : chosenFilters.escalationLine,
    };
  }, [chosenFilters, groups, lines]);
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
        admin={admin}
      />
    </>
  );
}
