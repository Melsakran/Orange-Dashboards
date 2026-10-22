"use client";

import { useCallback, useMemo, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import {
  filterRequests,
  formatDuration,
  formatTimestamp,
  resolutionMs,
  type OpsStatusFilter,
  type PersonRow,
} from "@/lib/ops/analytics";
import { OPS_STATUSES, OPS_STATUS_LABELS, type OpsRequest } from "@/lib/ops/types";

function OpsRequestDetails({ request, onClose }: { request: OpsRequest; onClose: () => void }) {
  const fields: Array<[string, string]> = [
    ["Status", OPS_STATUS_LABELS[request.status]],
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
      labelledBy="ops-request-title"
      closeLabel="Close request details"
      onClose={onClose}
      className="ops-detail-modal"
    >
      <p className="eyebrow">{request.interactionId}</p>
      <h2 id="ops-request-title">{request.requestTitle || request.interactionId}</h2>
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

export function OpsTicketList({
  requests,
  assignees,
  statusFilter,
  onStatusFilterChange,
}: {
  requests: OpsRequest[];
  assignees: PersonRow[];
  statusFilter: OpsStatusFilter;
  onStatusFilterChange: (filter: OpsStatusFilter) => void;
}) {
  const [query, setQuery] = useState("");
  const [assigneeKey, setAssigneeKey] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setSelectedId(null), []);

  const visible = useMemo(
    () => filterRequests(requests, { status: statusFilter, assigneeKey, query }),
    [assigneeKey, query, requests, statusFilter],
  );
  const selected = requests.find((request) => request.interactionId === selectedId) ?? null;

  return (
    <section className="ops-panel" aria-labelledby="ops-list-title">
      <div className="section-heading">
        <h2 id="ops-list-title">Requests</h2>
        <p>{visible.length} of {requests.length} shown</p>
      </div>
      <div className="ops-filters">
        <label className="form-field">
          <span>Search</span>
          <input
            type="search"
            value={query}
            placeholder="ID, title, person, or comment"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as OpsStatusFilter)}
          >
            <option value="all">All statuses</option>
            {OPS_STATUSES.map((status) => (
              <option key={status} value={status}>{OPS_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Assignee</span>
          <select value={assigneeKey} onChange={(event) => setAssigneeKey(event.target.value)}>
            <option value="all">All assignees</option>
            {assignees.map((assignee) => (
              <option key={assignee.key} value={assignee.key}>{assignee.name}</option>
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
                <th scope="col">Request</th>
                <th scope="col">Status</th>
                <th scope="col">Requestor</th>
                <th scope="col">Assignee</th>
                <th scope="col">Assigned</th>
                <th scope="col">Closed</th>
                <th scope="col" className="ops-number">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((request) => (
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
                  <td>{request.requestTitle || "—"}</td>
                  <td>
                    <span className={`ops-status ops-status-${request.status}`}>
                      {OPS_STATUS_LABELS[request.status]}
                    </span>
                  </td>
                  <td>{request.requestorName || "—"}</td>
                  <td>{request.assignedTo || "—"}</td>
                  <td>{formatTimestamp(request.assignmentTime)}</td>
                  <td>{formatTimestamp(request.closeDate)}</td>
                  <td className="ops-number">{formatDuration(resolutionMs(request))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ops-empty-filter">No requests match these filters.</p>
      )}
      {selected ? <OpsRequestDetails request={selected} onClose={closeDetails} /> : null}
    </section>
  );
}
