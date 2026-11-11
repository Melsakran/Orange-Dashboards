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

/** One layout for every view: KPIs, weekly chart, closure codes, requestors, and the list. */
export function RequestsPanel({
  requests,
  noun,
  teamLabel,
  isAdmin,
  admin,
}: {
  /** The requests of one kind (merge or issue) and one team; the caller filters. */
  requests: OpsRequest[];
  /** Plural noun for the copy, e.g. "merge requests" or "issues". */
  noun: string;
  teamLabel: string;
  isAdmin: boolean;
  /** Admin-only edit and delete for manual items; omitted for visitors. */
  admin?: OpsAdminContext;
}) {
  const nowMs = useClientNow();
  const [statusFilter, setStatusFilter] = useState<OpsStatusFilter>("all");

  const kpis = useMemo(() => summarizeKpis(requests, nowMs), [nowMs, requests]);
  const closureCodes = useMemo(() => breakdownByClosureCode(requests), [requests]);
  const requestors = useMemo(() => groupByPerson(requests, "requestor"), [requests]);
  const weeks = useMemo(() => weeklyBuckets(requests), [requests]);

  if (!requests.length) {
    return (
      <section className="view-state ops-empty">
        <p className="view-state-title">
          No {noun} for {teamLabel} yet.
        </p>
        <p>
          {isAdmin
            ? "Use Upload above to add a service-desk export, or add one manually."
            : "An admin hasn't added any yet."}
        </p>
      </section>
    );
  }

  return (
    <>
      <OpsKpis kpis={kpis} noun={noun} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
      <OpsTimeline weeks={weeks} />
      <OpsBreakdowns closureCodes={closureCodes} requestors={requestors} />
      <OpsTicketList
        requests={requests}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        admin={admin}
      />
    </>
  );
}
