import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getWorkspace, workspaces } from "@/data/workspaces";
import { loadDashboard } from "@/lib/data/dashboard";
import {
  getAdminStatus,
  mapFixtureWorkspace,
  resolveInitialDashboard,
} from "@/lib/data/initial-dashboard";
import { hasDailyReportView, hasRequestsView } from "@/lib/dashboard/workspace-style";
import { loadOpsDataset } from "@/lib/ops/load";
import { emptyOpsDataset, type OpsDataset } from "@/lib/ops/types";
import { emptyPageData, loadPeDailyPage } from "@/lib/pe-daily/load";
import type { PeDailyPageData } from "@/lib/pe-daily/types";
import { createClient } from "@/lib/supabase/server";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

interface WorkspacePageProps {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ view?: string | string[]; date?: string | string[] }>;
}

// Access controls are derived from the current request's Supabase session.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return workspaces.map((workspace) => ({ workspaceSlug: workspace.slug }));
}

export async function generateMetadata({ params }: WorkspacePageProps): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const workspace = getWorkspace(workspaceSlug);
  return { title: workspace?.name ?? "Workspace not found" };
}

async function loadRequests(isAdmin: boolean) {
  const client = hasSupabasePublicEnv() ? await createClient() : null;
  let dataset: OpsDataset = emptyOpsDataset();
  let loadError: string | null = null;
  try {
    dataset = await loadOpsDataset(client);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load Ops Requests.";
  }
  return { dataset, loadError, isAdmin };
}

async function loadDailyReport(requestedDate: string | null, isAdmin: boolean) {
  const client = hasSupabasePublicEnv() ? await createClient() : null;
  let data: PeDailyPageData = emptyPageData(requestedDate);
  let loadError: string | null = null;
  try {
    data = await loadPeDailyPage(client, requestedDate);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load the PE Daily Report.";
  }
  return { data, loadError, isAdmin };
}

export default async function WorkspacePage({ params, searchParams }: WorkspacePageProps) {
  const { workspaceSlug } = await params;
  const { view, date } = await searchParams;
  const result = await resolveInitialDashboard(workspaceSlug, {
    envConfigured: hasSupabasePublicEnv(),
    createClient,
    load: loadDashboard,
    getAdminStatus,
    getFixture(slug) {
      const workspace = getWorkspace(slug);
      return workspace ? mapFixtureWorkspace(workspace) : undefined;
    },
  });

  if (!result.dashboard) notFound();
  let adminEmail: string | undefined;
  if (result.isAdmin && result.source === "database") {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    adminEmail = data.user?.email;
  }

  const canAdmin = result.isAdmin && result.source === "database";
  const requests = hasRequestsView(workspaceSlug) ? await loadRequests(canAdmin) : undefined;
  const requestedDate = typeof date === "string" && date.trim() ? date.trim().slice(0, 32) : null;
  const dailyReport = hasDailyReportView(workspaceSlug)
    ? await loadDailyReport(requestedDate, canAdmin)
    : undefined;
  const initialView =
    requests && view === "requests" ? "requests"
      : dailyReport && view === "daily-report" ? "daily-report"
        : "projects";

  return (
    <DashboardShell
      initialDashboard={result.dashboard}
      source={result.source}
      isAdmin={result.isAdmin}
      adminEmail={adminEmail}
      requests={requests}
      dailyReport={dailyReport}
      initialView={initialView}
    />
  );
}
