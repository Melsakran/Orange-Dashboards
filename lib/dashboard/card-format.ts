import type { DashboardWorkItem } from "@/lib/data/dashboard";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCardDate(date?: string) {
  if (!date) return "Not scheduled";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "Not scheduled" : dateFormatter.format(parsed);
}

export const WORKING_DAYS_ERROR =
  "Enter working days as a number from 0 to 9999.9 with at most one decimal.";

const WORKING_DAYS_PATTERN = /^\d{1,4}(\.\d)?$/;

/** Blank text is `null`; text that is not a valid working-day amount is `undefined`. */
export function parseWorkingDays(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return WORKING_DAYS_PATTERN.test(trimmed) ? Number(trimmed) : undefined;
}

export function formatWorkingDays(value?: number) {
  if (value === undefined) return "Not set";
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${amount} ${value === 1 ? "WD" : "WDs"}`;
}

export function deliverySummary(
  item: Pick<
    DashboardWorkItem,
    "startDate" | "endDate" | "readinessDate" | "teamEffortWd" | "timeToMarketWd"
  >,
) {
  return [
    item.startDate ? `Start ${formatCardDate(item.startDate)}` : null,
    item.endDate ? `Deployment ${formatCardDate(item.endDate)}` : null,
    item.readinessDate ? `Readiness ${formatCardDate(item.readinessDate)}` : null,
    item.teamEffortWd !== undefined ? `Team ${formatWorkingDays(item.teamEffortWd)}` : null,
    item.timeToMarketWd !== undefined
      ? `Time to market ${formatWorkingDays(item.timeToMarketWd)}`
      : null,
  ].filter(Boolean).join(" · ");
}
