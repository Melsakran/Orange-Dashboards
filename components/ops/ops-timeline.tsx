import { formatWeekLabel, type WeekBucket } from "@/lib/ops/analytics";

export function OpsTimeline({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map((week) => Math.max(week.assigned, week.closed)));
  return (
    <section className="ops-panel" aria-labelledby="ops-timeline-title">
      <h2 id="ops-timeline-title">Requests per week</h2>
      <p className="ops-legend">
        <span className="ops-legend-assigned" aria-hidden="true" /> Assigned
        <span className="ops-legend-closed" aria-hidden="true" /> Closed
      </p>
      <ol className="ops-weeks">
        {weeks.map((week) => {
          const label = formatWeekLabel(week.weekStart);
          return (
            <li
              key={week.weekStart}
              aria-label={`Week of ${label}: ${week.assigned} assigned, ${week.closed} closed`}
            >
              <div className="ops-week-bars" aria-hidden="true">
                <span
                  className="ops-week-bar ops-week-bar-assigned"
                  style={{ height: `${(week.assigned / max) * 100}%` }}
                />
                <span
                  className="ops-week-bar ops-week-bar-closed"
                  style={{ height: `${(week.closed / max) * 100}%` }}
                />
              </div>
              <span className="ops-week-label" aria-hidden="true">{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
