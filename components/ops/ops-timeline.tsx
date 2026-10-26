"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountTooltip } from "@/components/pe-daily/count-tooltip";
import { formatWeekLabel, timestampMs, type WeekBucket } from "@/lib/ops/analytics";

const ASSIGNED_COLOR = "#e56f18";
const CLOSED_COLOR = "#237b4b";
const DAY_MS = 86_400_000;
const CHART_HEIGHT = 340;
const SCROLL_AFTER = 14;
const WEEK_WIDTH = 72;
const INITIAL_WIDTH = 900;

export interface WeekDatum {
  label: string;
  range: string;
  assigned: number;
  closed: number;
}

export function toWeekData(weeks: WeekBucket[]): WeekDatum[] {
  return weeks.map((week) => {
    const label = formatWeekLabel(week.weekStart);
    const weekEnd = new Date(timestampMs(week.weekStart) + 6 * DAY_MS).toISOString().slice(0, 10);
    return {
      label,
      range: `Week of ${label} – ${formatWeekLabel(weekEnd)}`,
      assigned: week.assigned,
      closed: week.closed,
    };
  });
}

interface WeekTooltipEntry {
  dataKey?: unknown;
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: unknown;
}

export function OpsWeekTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<WeekTooltipEntry>;
}) {
  const datum = payload?.[0]?.payload as WeekDatum | undefined;
  return <CountTooltip active={active} payload={payload} label={datum?.range} />;
}

export function OpsTimeline({ weeks }: { weeks: WeekBucket[] }) {
  const data = toWeekData(weeks);
  const minWidth = data.length > SCROLL_AFTER ? data.length * WEEK_WIDTH : undefined;
  return (
    <section className="ops-panel" aria-labelledby="ops-timeline-title">
      <h2 id="ops-timeline-title">Requests per week</h2>
      <p className="ops-legend">
        <span className="ops-legend-assigned" aria-hidden="true" /> Assigned
        <span className="ops-legend-closed" aria-hidden="true" /> Closed
      </p>
      <div className="ops-timeline-scroll">
        <div style={{ minWidth, height: CHART_HEIGHT }}>
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: minWidth ?? INITIAL_WIDTH, height: CHART_HEIGHT }}
          >
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} tickLine={false} />
              <YAxis allowDecimals={false} width={40} tick={{ fontSize: 12 }} />
              <Tooltip content={<OpsWeekTooltip />} cursor={{ fill: "rgba(229, 111, 24, 0.08)" }} />
              <Bar dataKey="assigned" name="Assigned" fill={ASSIGNED_COLOR} radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="closed" name="Closed" fill={CLOSED_COLOR} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ol className="ops-weeks-summary">
        {data.map((week, index) => (
          <li
            key={weeks[index].weekStart}
            aria-label={`Week of ${week.label}: ${week.assigned} assigned, ${week.closed} closed`}
          >
            {`Week of ${week.label}: ${week.assigned} assigned, ${week.closed} closed`}
          </li>
        ))}
      </ol>
    </section>
  );
}
