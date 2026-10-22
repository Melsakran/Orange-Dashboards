"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDatum } from "@/lib/pe-daily/chart-data";
import { formatCompact } from "@/lib/pe-daily/format";
import { CountTooltip } from "./count-tooltip";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export const PERIOD_SERIES: ChartSeries[] = [
  { key: "lastWeek", label: "Last week", color: "#9aa5b1" },
  { key: "dayBefore", label: "Day before", color: "#f2a65a" },
  { key: "yesterday", label: "Yesterday", color: "#e56f18" },
];

export const CHANNEL_SERIES: ChartSeries[] = [
  { key: "offline", label: "Offline", color: "#6b7a8f" },
  { key: "online", label: "Online", color: "#e56f18" },
];

const SCROLL_AFTER = 15;
const CATEGORY_WIDTH = 48;
const INITIAL_WIDTH = 720;

export function SeriesLegend({
  series,
  hidden,
  onToggle,
}: {
  series: ChartSeries[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="pe-daily-legend" role="group" aria-label="Chart series">
      {series.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className="pe-daily-legend-item"
          aria-pressed={!hidden.has(entry.key)}
          onClick={() => onToggle(entry.key)}
        >
          <span
            className="pe-daily-legend-swatch"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          {entry.label}
        </button>
      ))}
    </div>
  );
}

export function PromoBarChart({
  label,
  data,
  series,
  height = 340,
}: {
  label: string;
  data: ChartDatum[];
  series: ChartSeries[];
  height?: number;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const minWidth = data.length > SCROLL_AFTER ? data.length * CATEGORY_WIDTH : undefined;

  return (
    <figure className="pe-daily-chart" aria-label={label}>
      <SeriesLegend series={series} hidden={hidden} onToggle={toggle} />
      <div className="pe-daily-chart-scroll">
        <div className="pe-daily-chart-canvas" style={{ minWidth, height }}>
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: minWidth ?? INITIAL_WIDTH, height }}
          >
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="category"
                interval={0}
                angle={-35}
                textAnchor="end"
                height={90}
                tick={{ fontSize: 11 }}
              />
              <YAxis tickFormatter={(value: number) => formatCompact(value)} width={56} tick={{ fontSize: 11 }} />
              <Tooltip content={<CountTooltip />} cursor={{ fill: "rgba(229, 111, 24, 0.08)" }} />
              {series.map((entry) => (
                <Bar
                  key={entry.key}
                  dataKey={entry.key}
                  name={entry.label}
                  fill={entry.color}
                  hide={hidden.has(entry.key)}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
}
