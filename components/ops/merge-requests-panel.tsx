"use client";

import { useMemo, useState } from "react";
import {
  breakdownByClosureCode,
  groupByPerson,
  summarizeKpis,
  weeklyBuckets,
  type OpsStatusFilter,
} from "@/lib/ops/analytics";
import type { OpsRequest } from "@/lib/ops/types";
import { OpsBreakdowns } from "./ops-breakdowns";
import { OpsKpis } from "./ops-kpis";
import { OpsTicketList } from "./ops-ticket-list";
import { OpsTimeline } from "./ops-timeline";
import type { OpsAdminContext } from "./request-admin-actions";
import { useClientNow } from "./use-client-now";

export function MergeRequestsPanel({
  requests,
  isAdmin,
  admin,
}: {
  /** Every Ops item; the panel keeps only merge requests. */
  requests: OpsRequest[];
  isAdmin: boolean;
  /** Admin-only edit and delete for manual items; omitted for visitors. */
  admin?: OpsAdminContext;
}) {
  const nowMs = useClientNow();
  const [statusFilter, setStatusFilter] = useState<OpsStatusFilter>("all");
  const merges = useMemo(() => requests.filter((request) => request.isMergeRequest), [requests]);

  const kpis = useMemo(() => summarizeKpis(merges, nowMs), [nowMs, merges]);
  const closureCodes = useMemo(() => breakdownByClosureCode(merges), [merges]);
  const requestors = useMemo(() => groupByPerson(merges, "requestor"), [merges]);
  const weeks = useMemo(() => weeklyBuckets(merges), [merges]);

  if (!merges.length) {
    return requests.length ? (
      <section className="view-state ops-empty">
        <p className="view-state-title">No merge requests yet</p>
        <p>Merge requests from the service-desk export will appear here.</p>
      </section>
    ) : (
      <section className="view-state ops-empty">
        <p className="view-state-title">No data uploaded yet</p>
        <p>
          {isAdmin
            ? "Use Upload above to add a service-desk export."
            : "An admin hasn't uploaded a service-desk export yet."}
        </p>
      </section>
    );
  }

  return (
    <>
      <OpsKpis kpis={kpis} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
      <OpsTimeline weeks={weeks} />
      <OpsBreakdowns closureCodes={closureCodes} requestors={requestors} />
      <OpsTicketList
        requests={merges}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        admin={admin}
      />
    </>
  );
}
