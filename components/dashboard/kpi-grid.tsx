import type { DashboardProject, DashboardStatus } from "@/lib/data/dashboard";
import { projectMatchesStatusFilter } from "@/lib/data/dashboard";
import type { StatusFilter } from "@/components/dashboard/status-filters";

interface KpiGridProps {
  statuses: DashboardStatus[];
  projects: DashboardProject[];
  activeFilter: StatusFilter | null;
  onSelect: (filter: StatusFilter) => void;
  allLabel?: string;
  title?: string;
}

export function KpiGrid({
  statuses,
  projects,
  activeFilter,
  onSelect,
  allLabel = "All Projects",
  title,
}: KpiGridProps) {
  // Derived from live workspace.statuses / projects so admin add/rename/reorder
  // and realtime updates show up in the KPI cards automatically.
  const metrics = [
    {
      value: "all" as StatusFilter,
      label: allLabel,
      count: projects.length,
      color: "var(--orange)",
      meta: "Across this workspace",
    },
    ...statuses.map((status) => ({
      value: status.id as StatusFilter,
      label: status.name,
      count: projects.filter((project) => projectMatchesStatusFilter(project, status.id)).length,
      color: status.color,
      meta: "Matching this status",
    })),
  ];

  const headingId = title
    ? `kpi-row-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    : undefined;
  const cards = metrics.map((metric) => {
    const active = activeFilter === metric.value;
    return (
      <button
        type="button"
        className="kpi-card kpi-card-button"
        data-active={active}
        aria-pressed={active}
        aria-describedby={headingId}
        key={metric.value}
        style={{ ["--kpi-accent" as string]: metric.color }}
        onClick={() => onSelect(metric.value)}
      >
        <p className="kpi-label">{metric.label}</p>
        <p className="kpi-value">{metric.count}</p>
        <p className="kpi-meta">{metric.meta}</p>
      </button>
    );
  });

  if (!title) {
    return (
      <section className="kpi-grid kpi-grid-status" aria-label="Workspace status overview">
        {cards}
      </section>
    );
  }

  return (
    <section className="kpi-row" aria-labelledby={headingId}>
      <h2 className="kpi-row-title" id={headingId}>{title}</h2>
      <div className="kpi-grid kpi-grid-status">{cards}</div>
    </section>
  );
}
