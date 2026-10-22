"use client";

import { useState, type ReactNode } from "react";
import {
  groupSms,
  promoChartData,
  smsChartData,
  txProvChartData,
  upsellingChartData,
} from "@/lib/pe-daily/chart-data";
import { formatCount, formatReportDate, splitLargePromos } from "@/lib/pe-daily/format";
import { SECTIONS } from "@/lib/pe-daily/sections";
import type {
  ChartKey,
  PeDailyReport,
  PromoCounts,
  SectionKey,
  SmsCounts,
  UpsellingDay,
} from "@/lib/pe-daily/types";
import { DataTable, type Column } from "./data-table";
import { ManualSection } from "./manual-section";
import { CHANNEL_SERIES, PERIOD_SERIES, PromoBarChart } from "./promo-bar-chart";
import { SectionPanel } from "./section-panel";
import { UpsellingTrendChart } from "./upselling-trend-chart";

const PROMO_COLUMNS: Column<PromoCounts>[] = [
  { key: "#", header: "#", numeric: true, cell: (_row, index) => index + 1 },
  { key: "promo", header: "Promo Name", cell: (row) => row.promo },
  { key: "lastWeek", header: "Last Week Count", numeric: true, cell: (row) => formatCount(row.lastWeek) },
  { key: "dayBefore", header: "Day Before Count", numeric: true, cell: (row) => formatCount(row.dayBefore) },
  { key: "yesterday", header: "Yesterday Count", numeric: true, cell: (row) => formatCount(row.yesterday) },
];

const UPSELLING_COLUMNS: Column<UpsellingDay>[] = [
  { key: "day", header: "Date", cell: (row) => formatReportDate(row.day) },
  { key: "count", header: "Count", numeric: true, cell: (row) => formatCount(row.count) },
];

const CHANNEL_LABELS = { offline: "Offline", online: "Online" } as const;

function SmsTable({ rows }: { rows: SmsCounts[] }) {
  const groups = groupSms(rows);
  if (!groups.length) return <p className="pe-daily-empty">No entries</p>;
  return (
    <div className="pe-daily-table-wrap">
      <table className="pe-daily-table pe-daily-table-grouped" aria-label="SMS">
        <thead>
          <tr>
            <th scope="col" className="pe-daily-number">#</th>
            <th scope="col">Promo Name</th>
            <th scope="col">Type</th>
            <th scope="col" className="pe-daily-number">Last Week Count</th>
            <th scope="col" className="pe-daily-number">Day Before Count</th>
            <th scope="col" className="pe-daily-number">Yesterday Count</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((group, index) =>
            (["offline", "online"] as const).map((channel, channelIndex) => {
              const counts = group[channel];
              return (
                <tr
                  key={`${group.promo}-${channel}`}
                  className={[
                    channelIndex === 0 ? "pe-daily-group-start" : "",
                    index % 2 === 1 ? "pe-daily-group-odd" : "",
                  ].filter(Boolean).join(" ") || undefined}
                >
                  {channelIndex === 0 ? (
                    <>
                      <td rowSpan={2} className="pe-daily-number">{index + 1}</td>
                      <td rowSpan={2}>{group.promo}</td>
                    </>
                  ) : null}
                  <td>{CHANNEL_LABELS[channel]}</td>
                  <td className="pe-daily-number">{formatCount(counts?.lastWeek)}</td>
                  <td className="pe-daily-number">{formatCount(counts?.dayBefore)}</td>
                  <td className="pe-daily-number">{formatCount(counts?.yesterday)}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ReportSections({
  report,
  visibleCharts,
  isAdmin,
  onSaved,
}: {
  report: PeDailyReport;
  visibleCharts: ChartKey[];
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [hideLarge, setHideLarge] = useState(true);
  const show = (key: ChartKey) => visibleCharts.includes(key);
  const { visible, hiddenCount } = splitLargePromos(report.promos, hideLarge);
  const manual = (key: SectionKey, chart?: ReactNode) => (
    <ManualSection
      key={`${key}-${report.reportDate}`}
      section={SECTIONS[key]}
      rows={report.manual[key]}
      reportDate={report.reportDate}
      isAdmin={isAdmin}
      onSaved={onSaved}
    >
      {chart}
    </ManualSection>
  );

  return (
    <div className="pe-daily-sections">
      {manual(
        "tx_prov",
        show("tx_prov") && report.manual.tx_prov.length ? (
          <PromoBarChart
            label="Promos – TX_PROV chart"
            data={txProvChartData(report.manual.tx_prov)}
            series={PERIOD_SERIES}
          />
        ) : null,
      )}

      <SectionPanel id="pe-daily-h-dynamic" title="Promos – H_DYNAMIC">
        <DataTable
          label="Promos – H_DYNAMIC"
          columns={PROMO_COLUMNS}
          rows={report.promos}
          rowKey={(row) => row.promo}
        />
        {show("h_dynamic") ? (
          <>
            <div className="pe-daily-chart-toolbar">
              <label className="pe-daily-switch">
                <input
                  type="checkbox"
                  checked={hideLarge}
                  onChange={(event) => setHideLarge(event.target.checked)}
                />
                Hide promos over 1M
              </label>
              <p className="pe-daily-chart-note">
                {hiddenCount
                  ? `Showing ${visible.length} of ${report.promos.length} promos · ${hiddenCount} over 1M hidden`
                  : `Showing all ${report.promos.length} promos`}
              </p>
            </div>
            {visible.length || !report.promos.length ? (
              <PromoBarChart
                label="Promos – H_DYNAMIC chart"
                data={promoChartData(visible)}
                series={PERIOD_SERIES}
              />
            ) : (
              <p className="pe-daily-empty">All promos are over 1M. Turn off &quot;Hide promos over 1M&quot; to see them.</p>
            )}
          </>
        ) : null}
      </SectionPanel>

      {manual("actions")}

      <SectionPanel id="pe-daily-upselling" title="Upselling Layer">
        <DataTable
          label="Upselling Layer"
          columns={UPSELLING_COLUMNS}
          rows={report.upselling}
          rowKey={(row) => row.day}
        />
        {show("upselling") ? <UpsellingTrendChart data={upsellingChartData(report.upselling)} /> : null}
      </SectionPanel>

      <SectionPanel id="pe-daily-sms" title="SMS">
        <SmsTable rows={report.sms} />
        {show("sms") ? (
          <PromoBarChart label="SMS chart" data={smsChartData(report.sms)} series={CHANNEL_SERIES} />
        ) : null}
      </SectionPanel>

      {manual("offer_sheet")}
      {manual("data_lake")}
      {manual("it_cases")}
      {manual("grafana")}
    </div>
  );
}
