import type { DashboardStatus } from "@/lib/data/dashboard";

export type StatusFilter = "all" | string;

interface StatusFiltersProps {
  activeFilter: StatusFilter;
  statuses: DashboardStatus[];
  onChange: (filter: StatusFilter) => void;
  allLabel?: string;
}

export function StatusFilters({
  activeFilter,
  statuses,
  onChange,
  allLabel = "All Projects",
}: StatusFiltersProps) {
  const filters: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: allLabel },
    ...statuses.map((status) => ({ value: status.id, label: status.name })),
  ];
  return (
    <div className="filters" aria-label="Filter projects by status">
      {filters.map((filter) => (
        <button
          className="filter-button"
          data-active={activeFilter === filter.value}
          type="button"
          aria-pressed={activeFilter === filter.value}
          key={filter.value}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
