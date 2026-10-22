import { formatCount } from "@/lib/pe-daily/format";

interface TooltipEntry {
  dataKey?: unknown;
  name?: string | number;
  value?: unknown;
  color?: string;
  hide?: boolean;
}

export function CountTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
}) {
  const visible = payload?.filter((entry) => entry.hide !== true) ?? [];
  if (!active || !visible.length) return null;
  return (
    <div className="pe-daily-tooltip">
      <p className="pe-daily-tooltip-title">{label}</p>
      <ul>
        {visible.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)}>
            <span
              className="pe-daily-tooltip-swatch"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            {entry.name}:{" "}
            <strong>{typeof entry.value === "number" ? formatCount(entry.value) : "-"}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
