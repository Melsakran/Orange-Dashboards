"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/ui/brand-mark";
import {
  breakdownByClosureCode,
  formatUploadedAt,
  groupByPerson,
  summarizeKpis,
  wallClockNow,
  weeklyBuckets,
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

export function OpsRequestsPage({
  dataset,
  isAdmin,
  loadError = null,
}: {
  dataset: OpsDataset;
  isAdmin: boolean;
  loadError?: string | null;
}) {
  const { requests } = dataset;
  const nowMs = useSyncExternalStore(subscribeToNow, getClientNow, getServerNow);
  const [statusFilter, setStatusFilter] = useState<OpsStatusFilter>("all");
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  const kpis = useMemo(() => summarizeKpis(requests, nowMs), [nowMs, requests]);
  const closureCodes = useMemo(() => breakdownByClosureCode(requests), [requests]);
  const assignees = useMemo(() => groupByPerson(requests, "assignee"), [requests]);
  const requestors = useMemo(() => groupByPerson(requests, "requestor"), [requests]);
  const weeks = useMemo(() => weeklyBuckets(requests), [requests]);

  return (
    <main className="dashboard ops-page">
      <header className="dashboard-header">
        <div className="brand-lockup">
          <p className="eyebrow">Service desk</p>
          <div className="brand-title-row">
            <BrandMark />
            <h1>Ops Requests</h1>
          </div>
          <p className="workspace-description">
            {loadError ? "Couldn't load the latest data" : uploadSummary(dataset)}
          </p>
        </div>
        <div className="header-tools">
          {isAdmin ? <OpsUpload onUploaded={refresh} /> : null}
        </div>
      </header>

      {loadError ? (
        <div className="mutation-notice" role="alert">
          <span>{loadError}</span>
        </div>
      ) : requests.length ? (
        <>
          <OpsKpis kpis={kpis} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
          <OpsTimeline weeks={weeks} />
          <OpsBreakdowns closureCodes={closureCodes} assignees={assignees} requestors={requestors} />
          <OpsTicketList
            requests={requests}
            assignees={assignees}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </>
      ) : (
        <section className="view-state ops-empty">
          <p className="view-state-title">No data uploaded yet</p>
          <p>
            {isAdmin
              ? "Use Upload at the top of the page to add a service-desk export."
              : "An admin hasn't uploaded a service-desk export yet."}
          </p>
        </section>
      )}
    </main>
  );
}
