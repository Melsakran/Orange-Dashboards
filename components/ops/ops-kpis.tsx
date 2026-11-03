import {
  formatDuration,
  formatPercent,
  type OpsKindFilter,
  type OpsKpis as OpsKpiValues,
  type OpsStatusFilter,
} from "@/lib/ops/analytics";
import {
  OPS_REQUEST_KIND_LABELS,
  OPS_STATUSES,
  OPS_STATUS_LABELS,
  type OpsRequestKind,
  type OpsStatus,
} from "@/lib/ops/types";

const STATUS_COLORS: Record<OpsStatus, string> = {
  open: "#b63027",
  in_progress: "#246a91",
  pending: "#a94806",
  closed: "#237b4b",
};

const KIND_COLORS: Record<OpsRequestKind, string> = {
  merge: "#7c3aed",
  other: "#6b7a8f",
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
  kindFilter,
  onKindFilterChange,
}: {
  kpis: OpsKpiValues;
  statusFilter: OpsStatusFilter;
  onStatusFilterChange: (filter: OpsStatusFilter) => void;
  kindFilter: OpsKindFilter;
  onKindFilterChange: (filter: OpsKindFilter) => void;
}) {
  return (
    <section className="kpi-grid kpi-grid-status" aria-label="Ops request overview">
      <Metric label="Total requests" value={kpis.total} meta="In the latest upload" />
      {(["merge", "other"] as const).map((kind) => {
        const active = kindFilter === kind;
        return (
          <button
            type="button"
            key={kind}
            className="kpi-card kpi-card-button"
            data-active={active}
            aria-pressed={active}
            style={{ ["--kpi-accent" as string]: KIND_COLORS[kind] }}
            onClick={() => onKindFilterChange(active ? "all" : kind)}
          >
            <p className="kpi-label">{OPS_REQUEST_KIND_LABELS[kind]}</p>
            <p className="kpi-value">{kpis.kinds[kind]}</p>
            <p className="kpi-meta">Click to filter requests</p>
          </button>
        );
      })}
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
