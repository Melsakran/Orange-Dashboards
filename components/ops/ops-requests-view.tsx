"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatUploadedAt } from "@/lib/ops/analytics";
import type { OpsDataset } from "@/lib/ops/types";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { IssuesPanel } from "./issues-panel";
import { MergeRequestsPanel } from "./merge-requests-panel";
import { OpsUpload } from "./ops-upload";

export type OpsRequestsTab = "merge" | "issues";

const TAB_OPTIONS: ReadonlyArray<{ value: OpsRequestsTab; label: string }> = [
  { value: "merge", label: "Merge Requests" },
  { value: "issues", label: "Issues" },
];

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
  initialTab = "merge",
}: {
  dataset: OpsDataset;
  isAdmin: boolean;
  loadError?: string | null;
  toolbar?: ReactNode;
  initialTab?: OpsRequestsTab;
}) {
  const { requests } = dataset;
  const [tab, setTab] = useState<OpsRequestsTab>(initialTab);
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  function changeTab(next: OpsRequestsTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "merge") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }

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

      <div className="kpi-row-header ops-tab-row">
        <SegmentedToggle label="Request category" options={TAB_OPTIONS} value={tab} onChange={changeTab} />
        {/* Slot for the active tab's admin actions. */}
        <div className="ops-tab-actions" />
      </div>

      {loadError ? (
        <div className="mutation-notice" role="alert">
          <span>{loadError}</span>
        </div>
      ) : tab === "issues" ? (
        <IssuesPanel requests={requests} />
      ) : (
        <MergeRequestsPanel requests={requests} isAdmin={isAdmin} />
      )}
    </div>
  );
}
