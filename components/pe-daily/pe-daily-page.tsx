"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/ui/brand-mark";
import { formatUploadedAt } from "@/lib/ops/analytics";
import { formatReportDate } from "@/lib/pe-daily/format";
import type { PeDailyPageData } from "@/lib/pe-daily/types";
import { ReportSections } from "./report-sections";
import { ChartSettings } from "./chart-settings";
import { DeleteReport } from "./delete-report";
import { ReportUpload } from "./report-upload";

export const PAGE_PATH = "/pe-daily-report";

export function reportHref(date?: string | null): string {
  return date ? `${PAGE_PATH}?date=${encodeURIComponent(date)}` : PAGE_PATH;
}

function subtitle(data: PeDailyPageData, loadError: string | null): string | null {
  if (loadError) return "Couldn't load the report";
  if (data.report) {
    const by = data.report.uploadedByEmail ? ` by ${data.report.uploadedByEmail}` : "";
    return `Uploaded ${formatUploadedAt(data.report.uploadedAt)}${by}`;
  }
  return data.dates.length ? null : "No report uploaded yet";
}

export function PeDailyPage({
  data,
  isAdmin,
  loadError = null,
}: {
  data: PeDailyPageData;
  isAdmin: boolean;
  loadError?: string | null;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { dates, report, requestedDate, visibleCharts } = data;
  const headerLine = subtitle(data, loadError);

  let body;
  if (loadError) {
    body = (
      <div className="mutation-notice" role="alert">
        <span>Couldn&apos;t load the report. {loadError}</span>
      </div>
    );
  } else if (!dates.length) {
    body = (
      <section className="view-state pe-daily-empty-state">
        <p className="view-state-title">No report uploaded yet</p>
        <p>
          {isAdmin
            ? "Use Upload at the top of the page to add today's export."
            : "An admin hasn't uploaded a daily report yet."}
        </p>
      </section>
    );
  } else if (!report) {
    body = (
      <section className="view-state pe-daily-empty-state">
        <p className="view-state-title">No report for {requestedDate}</p>
        <p>
          <Link href={PAGE_PATH}>View the latest report</Link>
        </p>
      </section>
    );
  } else {
    body = (
      <ReportSections report={report} visibleCharts={visibleCharts} isAdmin={isAdmin} onSaved={refresh} />
    );
  }

  return (
    <main className="dashboard pe-daily-page">
      <header className="dashboard-header">
        <div className="brand-lockup">
          <p className="eyebrow">Promo Engine</p>
          <div className="brand-title-row">
            <BrandMark />
            <h1>PE Daily Report</h1>
          </div>
          {headerLine ? <p className="workspace-description">{headerLine}</p> : null}
        </div>
        <div className="header-tools">
          {isAdmin ? (
            <div className="pe-daily-admin-tools">
              <ReportUpload
                existingDates={dates}
                onUploaded={(date) => {
                  router.push(reportHref(date));
                  router.refresh();
                }}
              />
              <ChartSettings visibleCharts={visibleCharts} onSaved={refresh} />
              {report ? (
                <DeleteReport
                  reportDate={report.reportDate}
                  onDeleted={() => {
                    router.push(PAGE_PATH);
                    router.refresh();
                  }}
                />
              ) : null}
            </div>
          ) : null}
          {dates.length && !loadError ? (
            <label className="form-field pe-daily-date-field">
              <span>Report date</span>
              <select
                value={report?.reportDate ?? ""}
                onChange={(event) => router.push(reportHref(event.target.value))}
              >
                {report ? null : <option value="">Select a date</option>}
                {dates.map((date) => (
                  <option key={date} value={date}>{formatReportDate(date)}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>
      {body}
    </main>
  );
}
