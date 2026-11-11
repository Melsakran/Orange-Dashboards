"use client";

import type { OpsRequest } from "@/lib/ops/types";

// Placeholder: replaced by the full Issues board.
export function IssuesPanel({ requests }: { requests: OpsRequest[] }) {
  const issues = requests.filter((request) => !request.isMergeRequest);
  return (
    <section className="ops-panel" aria-labelledby="ops-issues-title">
      <h2 id="ops-issues-title">Issues</h2>
      <p>{issues.length} {issues.length === 1 ? "issue" : "issues"}</p>
    </section>
  );
}
