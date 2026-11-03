/** Manual Digital-style delivery workspaces (shared card/form chrome). */
export function isDigitalStyleWorkspace(slug: string): boolean {
  return slug === "digital" || slug === "data-lake" || slug === "reports-and-insights";
}

/** Workspaces that show Action Owner on cards and in the edit form. */
export function usesActionOwner(slug: string): boolean {
  return isDigitalStyleWorkspace(slug) || slug === "pe-delivery";
}

/** Workspaces that use per-team status + start/end dates instead of project dates. */
export function usesTeamTracks(slug: string): boolean {
  return slug === "data-lake" || slug === "reports-and-insights";
}

/** Label for the “all items” KPI / status filter chip. */
export function allFilterLabel(slug: string): string {
  if (slug === "datalake-ops") return "All Tasks";
  if (slug === "pe-delivery") return "Projects / CRS";
  return "All Projects";
}

/** Workspaces with a Projects / Requests toggle that embeds the Ops Requests view. */
export function hasRequestsView(slug: string): boolean {
  return slug === "datalake-ops";
}

/** PE Development manual workspace (effort notes below KPIs). */
export function isPeDeliveryWorkspace(slug: string): boolean {
  return slug === "pe-delivery";
}
