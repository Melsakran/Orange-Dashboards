const COUNT_PATTERN = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const LARGE_PROMO_THRESHOLD = 1_000_000;

const countFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function parseCount(raw: string): number | null {
  const value = raw.trim();
  if (!COUNT_PATTERN.test(value)) return null;
  const count = Number(value.replace(/,/g, ""));
  return Number.isSafeInteger(count) ? count : null;
}

export function formatCount(value?: number | null): string {
  return value === null || value === undefined ? "-" : countFormatter.format(value);
}

export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function formatReportDate(iso: string): string {
  const { year, month, day } = dateParts(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatDayLabel(iso: string): string {
  const { month, day } = dateParts(iso);
  return `${day} ${MONTHS[month - 1]}`;
}

export function splitLargePromos<T extends { yesterday: number | null }>(
  rows: T[],
  hideLarge: boolean,
): { visible: T[]; hiddenCount: number } {
  if (!hideLarge) return { visible: rows, hiddenCount: 0 };
  const visible = rows.filter((row) => (row.yesterday ?? 0) < LARGE_PROMO_THRESHOLD);
  return { visible, hiddenCount: rows.length - visible.length };
}
