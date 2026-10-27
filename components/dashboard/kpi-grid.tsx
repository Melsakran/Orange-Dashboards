import type { ReactNode } from "react";
import type { DashboardProject, DashboardStatus } from "@/lib/data/dashboard";
import { projectMatchesStatusFilter } from "@/lib/data/dashboard";
import type { StatusFilter } from "@/components/dashboard/status-filters";

interface KpiGridProps {
  statuses: DashboardStatus[];
  projects: DashboardProject[];
  activeFilter: StatusFilter | null;
  onSelect: (filter: StatusFilter) => void;
  allLabel?: string;
  header?: ReactNode;
}

export function KpiGrid({
  statuses,
  projects,
  activeFilter,
  onSelect,
  allLabel = "All Projects",
  header,
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

  const cards = metrics.map((metric) => {
    const active = activeFilter === metric.value;
    return (
      <button
        type="button"
        className="kpi-card kpi-card-button"
        data-active={active}
        aria-pressed={active}
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

  if (!header) {
    return (
      <section className="kpi-grid kpi-grid-status" aria-label="Workspace status overview">
        {cards}
      </section>
    );
  }

  return (
    <section className="kpi-row" aria-label="Workspace status overview">
      <div className="kpi-row-header">{header}</div>
      <div className="kpi-grid kpi-grid-status">{cards}</div>
    </section>
  );
}
