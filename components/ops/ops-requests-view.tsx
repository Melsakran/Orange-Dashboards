"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  breakdownByClosureCode,
  formatUploadedAt,
  groupByPerson,
  groupByRequestKind,
  summarizeKpis,
  wallClockNow,
  weeklyBuckets,
  type OpsKindFilter,
  type OpsStatusFilter,
} from "@/lib/ops/analytics";
import type { OpsDataset } from "@/lib/ops/types";
import { OpsBreakdowns } from "./ops-breakdowns";
import { OpsKpis } from "./ops-kpis";
import { OpsTicketList } from "./ops-ticket-list";
import { OpsTimeline } from "./ops-timeline";
import { OpsUpload } from "./ops-upload";

let clientNowMs: number | null = null;

function subscribeToNow() {
  return () => undefined;
}

function getClientNow() {
  clientNowMs ??= wallClockNow();
  return clientNowMs;
}

function getServerNow() {
  return null;
}

function uploadSummary(dataset: OpsDataset) {
  const { upload } = dataset;
  if (!upload) return "No data uploaded yet";
  const by = upload.uploadedByEmail ? ` by ${upload.uploadedByEmail}` : "";
  return `Last updated ${formatUploadedAt(upload.uploadedAt)}${by} · ${upload.rowCount} requests`;
}

export function OpsRequestsView({
  dataset,
  isAdmin,
  loadError = null,
  toolbar,
}: {
  dataset: OpsDataset;
  isAdmin: boolean;
  loadError?: string | null;
  toolbar?: ReactNode;
}) {
  const { requests } = dataset;
  const nowMs = useSyncExternalStore(subscribeToNow, getClientNow, getServerNow);
  const [statusFilter, setStatusFilter] = useState<OpsStatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<OpsKindFilter>("all");
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  const kpis = useMemo(() => summarizeKpis(requests, nowMs), [nowMs, requests]);
  const closureCodes = useMemo(() => breakdownByClosureCode(requests), [requests]);
  const requestKinds = useMemo(() => groupByRequestKind(requests), [requests]);
  const requestors = useMemo(() => groupByPerson(requests, "requestor"), [requests]);
  const weeks = useMemo(() => weeklyBuckets(requests), [requests]);

  return (
    <div className="ops-requests-view">
      <div className="kpi-row-header">
        {toolbar}
        <div className="ops-requests-meta">
          <p className="workspace-description">
            {loadError ? "Couldn't load the latest data" : uploadSummary(dataset)}
          </p>
          {isAdmin ? <OpsUpload onUploaded={refresh} /> : null}
        </div>
      </div>

      {loadError ? (
        <div className="mutation-notice" role="alert">
          <span>{loadError}</span>
        </div>
      ) : requests.length ? (
        <>
          <OpsKpis
            kpis={kpis}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
          />
          <OpsTimeline weeks={weeks} />
          <OpsBreakdowns closureCodes={closureCodes} requestKinds={requestKinds} requestors={requestors} />
          <OpsTicketList
            requests={requests}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
          />
        </>
      ) : (
        <section className="view-state ops-empty">
          <p className="view-state-title">No data uploaded yet</p>
          <p>
            {isAdmin
              ? "Use Upload above to add a service-desk export."
              : "An admin hasn't uploaded a service-desk export yet."}
          </p>
        </section>
      )}
    </div>
  );
}
