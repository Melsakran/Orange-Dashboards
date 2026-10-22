import {
  formatDuration,
  formatPercent,
  type OpsKpis as OpsKpiValues,
  type OpsStatusFilter,
} from "@/lib/ops/analytics";
import { OPS_STATUSES, OPS_STATUS_LABELS, type OpsStatus } from "@/lib/ops/types";

const STATUS_COLORS: Record<OpsStatus, string> = {
  open: "#b63027",
  pending: "#a94806",
  closed: "#237b4b",
};

function Metric({ label, value, meta }: { label: string; value: string | number; meta: string }) {
  return (
    <div className="kpi-card" style={{ ["--kpi-accent" as string]: "var(--orange)" }}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className="kpi-meta">{meta}</p>
    </div>
  );
}

export function OpsKpis({
  kpis,
  statusFilter,
  onStatusFilterChange,
}: {
  kpis: OpsKpiValues;
  statusFilter: OpsStatusFilter;
  onStatusFilterChange: (filter: OpsStatusFilter) => void;
}) {
  return (
    <section className="kpi-grid kpi-grid-status" aria-label="Ops request overview">
      <Metric label="Total requests" value={kpis.total} meta="In the latest upload" />
      {OPS_STATUSES.map((status) => {
        const active = statusFilter === status;
        return (
          <button
            type="button"
            key={status}
            className="kpi-card kpi-card-button"
            data-active={active}
            aria-pressed={active}
            style={{ ["--kpi-accent" as string]: STATUS_COLORS[status] }}
            onClick={() => onStatusFilterChange(active ? "all" : status)}
          >
            <p className="kpi-label">{OPS_STATUS_LABELS[status]}</p>
            <p className="kpi-value">{kpis.counts[status]}</p>
            <p className="kpi-meta">Click to filter requests</p>
          </button>
        );
      })}
      <Metric label="Closure rate" value={formatPercent(kpis.closureRate)} meta="Closed of all requests" />
      <Metric
        label="Avg resolution"
        value={formatDuration(kpis.avgResolutionMs)}
        meta={`Median ${formatDuration(kpis.medianResolutionMs)}`}
      />
      <Metric
        label="Open aging"
        value={formatDuration(kpis.avgOpenAgeMs)}
        meta={`Oldest ${formatDuration(kpis.oldestOpenAgeMs)}`}
      />
    </section>
  );
}
