import {
  formatDuration,
  formatPercent,
  type ClosureCodeRow,
  type PersonRow,
} from "@/lib/ops/analytics";

function PersonTable({
  title,
  id,
  rows,
  showResolution,
}: {
  title: string;
  id: string;
  rows: PersonRow[];
  showResolution: boolean;
}) {
  return (
    <section className="ops-panel" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="ops-number">Total</th>
              <th scope="col" className="ops-number">Open</th>
              <th scope="col" className="ops-number">In progress</th>
              <th scope="col" className="ops-number">Pending</th>
              <th scope="col" className="ops-number">Closed</th>
              {showResolution ? (
                <>
                  <th scope="col" className="ops-number">Avg resolution</th>
                  <th scope="col" className="ops-number">Median</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.name}</th>
                <td className="ops-number">{row.total}</td>
                <td className="ops-number">{row.counts.open}</td>
                <td className="ops-number">{row.counts.in_progress}</td>
                <td className="ops-number">{row.counts.pending}</td>
                <td className="ops-number">{row.counts.closed}</td>
                {showResolution ? (
                  <>
                    <td className="ops-number">{formatDuration(row.avgResolutionMs)}</td>
                    <td className="ops-number">{formatDuration(row.medianResolutionMs)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OpsBreakdowns({
  closureCodes,
  assignees,
  requestors,
}: {
  closureCodes: ClosureCodeRow[];
  assignees: PersonRow[];
  requestors: PersonRow[];
}) {
  return (
    <div className="ops-breakdowns">
      <section className="ops-panel" aria-labelledby="ops-closure-title">
        <h2 id="ops-closure-title">Closure codes</h2>
        <ul className="ops-bars">
          {closureCodes.map((row) => (
            <li key={row.label}>
              <span className="ops-bar-label">{row.label}</span>
              <span className="ops-bar-track" aria-hidden="true">
                <span className="ops-bar-fill" style={{ width: `${Math.round(row.share * 100)}%` }} />
              </span>
              <span className="ops-bar-value">
                {row.count} · {formatPercent(row.share)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <PersonTable title="By assignee" id="ops-assignee-title" rows={assignees} showResolution />
      <PersonTable title="By requestor" id="ops-requestor-title" rows={requestors} showResolution={false} />
    </div>
  );
}
