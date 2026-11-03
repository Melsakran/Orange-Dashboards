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
import { hasRequestsView } from "@/lib/dashboard/workspace-style";
import { loadOpsDataset } from "@/lib/ops/load";
import type { OpsDataset } from "@/lib/ops/types";
import { createClient } from "@/lib/supabase/server";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

interface WorkspacePageProps {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
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
  let dataset: OpsDataset = { requests: [], upload: null };
  let loadError: string | null = null;
  try {
    dataset = await loadOpsDataset(client);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load Ops Requests.";
  }
  return { dataset, loadError, isAdmin };
}

export default async function WorkspacePage({ params, searchParams }: WorkspacePageProps) {
  const { workspaceSlug } = await params;
  const { view } = await searchParams;
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

  const requests = hasRequestsView(workspaceSlug)
    ? await loadRequests(result.isAdmin && result.source === "database")
    : undefined;

  return (
    <DashboardShell
      initialDashboard={result.dashboard}
      source={result.source}
      isAdmin={result.isAdmin}
      adminEmail={adminEmail}
      requests={requests}
      initialView={requests && view === "requests" ? "requests" : "projects"}
    />
  );
}
