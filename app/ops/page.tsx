import type { Metadata } from "next";
import { OpsRequestsPage } from "@/components/ops/ops-requests-page";
import { getAdminStatus } from "@/lib/data/initial-dashboard";
import { loadOpsDataset } from "@/lib/ops/load";
import type { OpsDataset } from "@/lib/ops/types";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ops Requests",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const client = hasSupabasePublicEnv() ? await createClient() : null;
  let dataset: OpsDataset = { requests: [], upload: null };
  let loadError: string | null = null;
  try {
    dataset = await loadOpsDataset(client);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load Ops Requests.";
  }
  const isAdmin = client ? await getAdminStatus(client) : false;
  return <OpsRequestsPage dataset={dataset} isAdmin={isAdmin} loadError={loadError} />;
}
