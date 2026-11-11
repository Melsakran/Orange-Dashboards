"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { formatDuration, formatTimestamp, resolutionMs, type OpsStatusFilter } from "@/lib/ops/analytics";
import type { IssueFilters, IssueView, OwnershipGroup } from "@/lib/ops/issues";
import { OPS_STATUSES, OPS_STATUS_LABELS } from "@/lib/ops/types";

const UNROUTED_LABEL = "Unrouted";

function escalationText(issue: IssueView) {
  return issue.reportsTo ? `Escalate to ${issue.reportsTo}` : "Needs escalation";
}

function IssueDetails({ issue, onClose }: { issue: IssueView; onClose: () => void }) {
  const { request } = issue;
  const fields: Array<[string, string]> = [
    ["Status", OPS_STATUS_LABELS[request.status]],
    ["Area", issue.area?.name ?? UNROUTED_LABEL],
    ["Owner", issue.owner],
    ["Reports to", issue.reportsTo],
    ["Request type", request.requestType],
    ["Title", request.title],
    ["Requestor", request.requestorName],
    ["Assigned to", request.assignedTo],
    ["Assigned", formatTimestamp(request.assignmentTime)],
    ["Closed", formatTimestamp(request.closeDate)],
    ["Resolution", formatDuration(resolutionMs(request))],
    ["Closure code", request.closureCode],
  ];
  return (
    <ModalDialog
      labelledBy="ops-issue-title"
      closeLabel="Close issue details"
      onClose={onClose}
      className="ops-detail-modal"
    >
      <p className="eyebrow">{request.interactionId}</p>
      <h2 id="ops-issue-title">{request.requestTitle || request.interactionId}</h2>
      <dl className="ops-detail-list">
        {fields.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <h3>Description</h3>
      <p className="ops-detail-text">{request.description || "—"}</p>
      <h3>Closure comments</h3>
      <p className="ops-detail-text">{request.closureComments || "—"}</p>
    </ModalDialog>
  );
}

export function IssueList({
  issues,
  visible,
  filters,
  onFiltersChange,
  groups,
  lines,
  rowActions,
}: {
  /** Every issue, before filtering. */
  issues: IssueView[];
  /** Issues after filtering, in display order. */
  visible: IssueView[];
  filters: IssueFilters;
  onFiltersChange: (changes: Partial<IssueFilters>) => void;
  /** Ownership board groups; they drive the Area options. */
  groups: OwnershipGroup[];
  /** Escalation lines (the names areas report to). */
  lines: string[];
  /** Optional extra cell per row (admin actions); adds an Actions column when set. */
  rowActions?: (issue: IssueView) => ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setSelectedId(null), []);
  const selected = issues.find((issue) => issue.request.interactionId === selectedId) ?? null;

  return (
    <section className="ops-panel" aria-labelledby="ops-issues-title">
      <div className="section-heading">
        <h2 id="ops-issues-title">Issues</h2>
        <p>{visible.length} of {issues.length} shown</p>
      </div>
      <div className="ops-filters ops-issue-filters">
        <label className="form-field">
          <span>Search</span>
          <input
            type="search"
            value={filters.query}
            placeholder="ID, title, person, or area"
            onChange={(event) => onFiltersChange({ query: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => onFiltersChange({ status: event.target.value as OpsStatusFilter })}
          >
            <option value="all">All statuses</option>
            {OPS_STATUSES.map((status) => (
              <option key={status} value={status}>{OPS_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Area</span>
          <select
            value={filters.areaKey}
            onChange={(event) => onFiltersChange({ areaKey: event.target.value })}
          >
            <option value="all">All areas</option>
            {groups.map((group) =>
              group.key === "unrouted" ? (
                <option key={group.key} value="unrouted">{UNROUTED_LABEL}</option>
              ) : (
                <optgroup key={group.key} label={group.label}>
                  {group.cards.map((card) => (
                    <option key={card.key} value={card.key}>{card.name}</option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </label>
        <label className="form-field">
          <span>Escalation line</span>
          <select
            value={filters.escalationLine}
            onChange={(event) => onFiltersChange({ escalationLine: event.target.value })}
          >
            <option value="all">All lines</option>
            {lines.map((line) => (
              <option key={line} value={line}>{line}</option>
            ))}
          </select>
        </label>
      </div>
      {visible.length ? (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Issue</th>
                <th scope="col">Area</th>
                <th scope="col">Owner</th>
                <th scope="col">Status</th>
                <th scope="col">Raised</th>
                <th scope="col" className="ops-number">Age / Resolution</th>
                {rowActions ? <th scope="col">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((issue) => {
                const { request } = issue;
                return (
                  <tr key={request.interactionId}>
                    <td>
                      <button
                        type="button"
                        className="ops-link-button"
                        aria-label={`View details for ${request.interactionId}`}
                        onClick={() => setSelectedId(request.interactionId)}
                      >
                        {request.interactionId}
                      </button>
                    </td>
                    <td>
                      {request.requestTitle || "—"}
                      {request.source === "manual" ? (
                        <span className="ops-manual-flag">Manual</span>
                      ) : null}
                      {issue.needsEscalation ? (
                        <span className="ops-escalate-flag">{escalationText(issue)}</span>
                      ) : null}
                    </td>
                    <td>{issue.area?.name ?? UNROUTED_LABEL}</td>
                    <td>{issue.owner}</td>
                    <td>
                      <span className={`ops-status ops-status-${request.status}`}>
                        {OPS_STATUS_LABELS[request.status]}
                      </span>
                    </td>
                    <td>{formatTimestamp(request.assignmentTime)}</td>
                    <td className="ops-number">
                      {request.status === "closed"
                        ? formatDuration(resolutionMs(request))
                        : issue.openAgeMs === null
                          ? "—"
                          : `${formatDuration(issue.openAgeMs)} open`}
                    </td>
                    {rowActions ? <td>{rowActions(issue)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ops-empty-filter">
          {issues.length ? "No issues match these filters." : "No issues yet."}
        </p>
      )}
      {selected ? <IssueDetails issue={selected} onClose={closeDetails} /> : null}
    </section>
  );
}
