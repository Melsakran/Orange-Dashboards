"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatUploadedAt } from "@/lib/ops/analytics";
import {
  OPS_TEAMS,
  OPS_TEAM_LABELS,
  opsTeamToParam,
  type OpsDataset,
  type OpsTeam,
} from "@/lib/ops/types";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { ManualItemForm, type ManualItemKind } from "./manual-item-form";
import { OpsUpload } from "./ops-upload";
import type { OpsAdminContext } from "./request-admin-actions";
import { RequestsPanel } from "./requests-panel";

export type OpsRequestsTab = "merge" | "issues";

const TAB_OPTIONS: ReadonlyArray<{ value: OpsRequestsTab; label: string }> = [
  { value: "merge", label: "Merge Requests" },
  { value: "issues", label: "Issues" },
];

const TEAM_OPTIONS: ReadonlyArray<{ value: OpsTeam; label: string }> = OPS_TEAMS.map((value) => ({
  value,
  label: OPS_TEAM_LABELS[value],
}));

const TAB_COPY: Record<OpsRequestsTab, { kind: ManualItemKind; noun: string; addLabel: string }> = {
  merge: { kind: "merge", noun: "merge requests", addLabel: "Add merge request" },
  issues: { kind: "issue", noun: "issues", addLabel: "Add issue" },
};

function uploadSummary(dataset: OpsDataset, team: OpsTeam) {
  const upload = dataset.uploads[team];
  if (!upload) return `No data uploaded yet for ${OPS_TEAM_LABELS[team]}`;
  const by = upload.uploadedByEmail ? ` by ${upload.uploadedByEmail}` : "";
  return `Last updated ${formatUploadedAt(upload.uploadedAt)}${by} · ${upload.rowCount} imported`;
}

export function OpsRequestsView({
  dataset,
  isAdmin,
  loadError = null,
  toolbar,
  initialTab = "merge",
  initialTeam = "operations",
}: {
  dataset: OpsDataset;
  isAdmin: boolean;
  loadError?: string | null;
  toolbar?: ReactNode;
  initialTab?: OpsRequestsTab;
  initialTeam?: OpsTeam;
}) {
  const { requests } = dataset;
  const [tab, setTab] = useState<OpsRequestsTab>(initialTab);
  const [team, setTeam] = useState<OpsTeam>(initialTeam);
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const [adding, setAdding] = useState(false);
  const admin = useMemo<OpsAdminContext | undefined>(
    () => (isAdmin ? { onChanged: refresh } : undefined),
    [isAdmin, refresh],
  );
  const teamRequests = useMemo(() => requests.filter((request) => request.team === team), [requests, team]);
  const visibleRequests = useMemo(
    () => teamRequests.filter((request) => request.isMergeRequest === (tab === "merge")),
    [teamRequests, tab],
  );
  const manualInteractionIds = useMemo(
    () =>
      new Set(
        teamRequests.filter((request) => request.source === "manual").map((request) => request.interactionId),
      ),
    [teamRequests],
  );
  const closeAdd = useCallback(() => setAdding(false), []);
  const added = useCallback(() => {
    setAdding(false);
    refresh();
  }, [refresh]);
  const copy = TAB_COPY[tab];
  const teamLabel = OPS_TEAM_LABELS[team];

  function syncUrl(update: (params: URLSearchParams) => void) {
    const url = new URL(window.location.href);
    update(url.searchParams);
    window.history.replaceState(window.history.state, "", url);
  }

  function changeTab(next: OpsRequestsTab) {
    setTab(next);
    syncUrl((params) => {
      if (next === "merge") params.delete("tab");
      else params.set("tab", next);
    });
  }

  function changeTeam(next: OpsTeam) {
    setTeam(next);
    syncUrl((params) => {
      const value = opsTeamToParam(next);
      if (value) params.set("team", value);
      else params.delete("team");
    });
  }

  return (
    <div className="ops-requests-view">
      <div className="kpi-row-header">
        {toolbar}
        <div className="ops-requests-meta">
          <p className="workspace-description">
            {loadError ? "Couldn't load the latest data" : uploadSummary(dataset, team)}
          </p>
          {isAdmin ? (
            <OpsUpload team={team} onUploaded={refresh} manualInteractionIds={manualInteractionIds} />
          ) : null}
        </div>
      </div>

      <div className="kpi-row-header ops-tab-row">
        <div className="ops-tab-toggles">
          <SegmentedToggle label="Request category" options={TAB_OPTIONS} value={tab} onChange={changeTab} />
          <SegmentedToggle label="Team" options={TEAM_OPTIONS} value={team} onChange={changeTeam} />
        </div>
        <div className="ops-tab-actions">
          {isAdmin && !loadError ? (
            <button type="button" className="secondary-button" onClick={() => setAdding(true)}>
              {copy.addLabel}
            </button>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <div className="mutation-notice" role="alert">
          <span>{loadError}</span>
        </div>
      ) : (
        <RequestsPanel
          key={`${team}-${tab}`}
          requests={visibleRequests}
          noun={copy.noun}
          teamLabel={teamLabel}
          isAdmin={isAdmin}
          admin={admin}
        />
      )}
      {adding ? <ManualItemForm kind={copy.kind} team={team} onClose={closeAdd} onSaved={added} /> : null}
    </div>
  );
}
