import type { Metadata } from "next";
import { PeDailyPage } from "@/components/pe-daily/pe-daily-page";
import { getAdminStatus } from "@/lib/data/initial-dashboard";
import { emptyPageData, loadPeDailyPage } from "@/lib/pe-daily/load";
import type { PeDailyPageData } from "@/lib/pe-daily/types";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "PE Daily Report",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PeDailyReportPageProps {
  searchParams: Promise<{ date?: string | string[] }>;
}

export default async function PeDailyReportPage({ searchParams }: PeDailyReportPageProps) {
  const { date } = await searchParams;
  const requestedDate = typeof date === "string" && date.trim() ? date.trim().slice(0, 32) : null;
  const client = hasSupabasePublicEnv() ? await createClient() : null;
  let data: PeDailyPageData = emptyPageData(requestedDate);
  let loadError: string | null = null;
  try {
    data = await loadPeDailyPage(client, requestedDate);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load the PE Daily Report.";
  }
  const isAdmin = client ? await getAdminStatus(client) : false;
  return <PeDailyPage data={data} isAdmin={isAdmin} loadError={loadError} />;
}
