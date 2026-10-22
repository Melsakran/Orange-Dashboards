"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartDatum } from "@/lib/pe-daily/chart-data";
import { formatCompact } from "@/lib/pe-daily/format";
import { CountTooltip } from "./count-tooltip";
import { INITIAL_WIDTH } from "./promo-bar-chart";

export function UpsellingTrendChart({ data, height = 300 }: { data: ChartDatum[]; height?: number }) {
  return (
    <figure className="pe-daily-chart" aria-label="Upselling trend">
      <div className="pe-daily-chart-canvas" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: INITIAL_WIDTH, height }}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="category" tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={(value: number) => formatCompact(value)}
              width={64}
              tick={{ fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CountTooltip />} filterNull={false} />
            <Line
              type="monotone"
              dataKey="count"
              name="Upselling"
              stroke="#e56f18"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
