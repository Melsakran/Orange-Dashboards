"use client";

import { useCallback, useMemo, useState } from "react";
import { ModalDialog } from "@/components/ui/modal-dialog";
import {
  filterRequests,
  formatDuration,
  formatTimestamp,
  resolutionMs,
  type OpsKindFilter,
  type OpsStatusFilter,
} from "@/lib/ops/analytics";
import {
  OPS_REQUEST_KIND_LABELS,
  OPS_STATUSES,
  OPS_STATUS_LABELS,
  type OpsRequest,
} from "@/lib/ops/types";

function OpsRequestDetails({ request, onClose }: { request: OpsRequest; onClose: () => void }) {
  const fields: Array<[string, string]> = [
    ["Status", OPS_STATUS_LABELS[request.status]],
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
  statusFilter,
  onStatusFilterChange,
  kindFilter,
  onKindFilterChange,
}: {
  requests: OpsRequest[];
  statusFilter: OpsStatusFilter;
  onStatusFilterChange: (filter: OpsStatusFilter) => void;
  kindFilter: OpsKindFilter;
  onKindFilterChange: (filter: OpsKindFilter) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setSelectedId(null), []);

  const visible = useMemo(
    () => filterRequests(requests, { status: statusFilter, kind: kindFilter, query }),
    [kindFilter, query, requests, statusFilter],
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
          <span>Request type</span>
          <select
            value={kindFilter}
            onChange={(event) => onKindFilterChange(event.target.value as OpsKindFilter)}
          >
            <option value="all">All request types</option>
            <option value="merge">{OPS_REQUEST_KIND_LABELS.merge}</option>
            <option value="other">{OPS_REQUEST_KIND_LABELS.other}</option>
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
                  <td>
                    {request.requestTitle || "—"}
                    {request.isMergeRequest ? (
                      <span className="ops-merge-flag">Merge request</span>
                    ) : null}
                  </td>
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
