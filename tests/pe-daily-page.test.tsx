import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeDailyPage } from "@/components/pe-daily/pe-daily-page";
import { makePageData, makeReport } from "./fixtures/pe-daily";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

function headings() {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
}

describe("PeDailyPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the header and every deck section in order", () => {
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    expect(screen.getByRole("heading", { level: 1, name: "PE Daily Report" })).toBeInTheDocument();
    expect(screen.getByText("Promo Engine")).toBeInTheDocument();
    expect(screen.getByText(/Uploaded .* by admin@example\.com/)).toBeInTheDocument();
    expect(headings()).toEqual([
      "Promos – TX_PROV",
      "Promos – H_DYNAMIC",
      "Actions",
      "Upselling Layer",
      "SMS",
      "Offer Sheet Tool",
      "Data Lake",
      "IT First Line Cases",
      "Grafana",
    ]);
  });

  it("renders the tables with the deck's columns and formatted numbers", () => {
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);

    const hDynamic = screen.getByRole("table", { name: "Promos – H_DYNAMIC" });
    expect(within(hDynamic).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "#",
      "Promo Name",
      "Last Week Count",
      "Day Before Count",
      "Yesterday Count",
    ]);
    expect(within(hDynamic).getByRole("row", { name: /revive/ })).toHaveTextContent("8,823,587");

    expect(screen.getByRole("table", { name: "Promos – TX_PROV" })).toHaveTextContent("go-2");
    expect(screen.getByRole("table", { name: "Actions" })).toHaveTextContent("Restart provisioning job");
    expect(screen.getByRole("table", { name: "Upselling Layer" })).toHaveTextContent("21 Oct 2026");

    const smsTable = screen.getByRole("table", { name: "SMS" });
    const smsRows = within(smsTable).getAllByRole("row").slice(1);
    expect(smsRows.map((row) => row.textContent)).toEqual([
      "1reviveOffline13,952,68414,335,23814,795,483",
      "Online154,752163,307130,766",
      "2opportunityOffline---",
      "Online3,444,7203,574,4993,061,708",
    ]);

    expect(screen.getAllByText("No entries")).toHaveLength(4);
  });

  it("shows only the deck's charts by default and every chart when enabled", () => {
    const { rerender } = render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    expect(screen.getAllByRole("figure").map((figure) => figure.getAttribute("aria-label"))).toEqual([
      "Promos – TX_PROV chart",
      "Promos – H_DYNAMIC chart",
    ]);

    rerender(
      <PeDailyPage
        data={makePageData({ visibleCharts: ["tx_prov", "h_dynamic", "upselling", "sms"] })}
        isAdmin={false}
      />,
    );
    expect(screen.getAllByRole("figure").map((figure) => figure.getAttribute("aria-label"))).toEqual([
      "Promos – TX_PROV chart",
      "Promos – H_DYNAMIC chart",
      "Upselling trend",
      "SMS chart",
    ]);
  });

  it("hides promos over 1M by default and shows them when the switch is off", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    const toggle = screen.getByRole("checkbox", { name: "Hide promos over 1M" });
    expect(toggle).toBeChecked();
    expect(screen.getByText("Showing 2 of 4 promos · 2 over 1M hidden")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText("Showing all 4 promos")).toBeInTheDocument();
  });

  it("explains the empty H_DYNAMIC chart when every promo is over 1M", async () => {
    const user = userEvent.setup();
    const report = makeReport({
      promos: [
        { promo: "charges-platform", lastWeek: 1959859, dayBefore: 2041804, yesterday: 2024695 },
        { promo: "revive", lastWeek: 7603289, dayBefore: 8471845, yesterday: 1000000 },
      ],
    });
    render(<PeDailyPage data={makePageData({ report })} isAdmin={false} />);
    expect(screen.getByText('All promos are over 1M. Turn off "Hide promos over 1M" to see them.')).toBeInTheDocument();
    expect(screen.queryByRole("figure", { name: "Promos – H_DYNAMIC chart" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Hide promos over 1M" }));
    expect(screen.getByRole("figure", { name: "Promos – H_DYNAMIC chart" })).toBeInTheDocument();
    expect(screen.queryByText(/All promos are over 1M/)).not.toBeInTheDocument();
  });

  it("navigates when another report date is chosen", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    const select = screen.getByLabelText("Report date");
    expect(select).toHaveValue("2026-10-22");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "22 Oct 2026",
      "21 Oct 2026",
    ]);
    await user.selectOptions(select, "2026-10-21");
    expect(push).toHaveBeenCalledWith("/pe-daily-report?date=2026-10-21");
  });

  it("shows empty, unknown-date, and load-error states", () => {
    const { rerender } = render(
      <PeDailyPage data={makePageData({ dates: [], report: null })} isAdmin={false} />,
    );
    expect(screen.getAllByText("No report uploaded yet").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Report date")).not.toBeInTheDocument();

    rerender(
      <PeDailyPage
        data={makePageData({ report: null, requestedDate: "2026-01-01" })}
        isAdmin={false}
      />,
    );
    expect(screen.getByText("No report for 2026-01-01")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the latest report" })).toHaveAttribute(
      "href",
      "/pe-daily-report",
    );

    rerender(
      <PeDailyPage
        data={makePageData({ dates: [], report: null })}
        isAdmin={false}
        loadError="Could not load the PE Daily Report: boom"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load the report. Could not load the PE Daily Report: boom",
    );
    expect(screen.queryByText("No report uploaded yet")).not.toBeInTheDocument();
  });

  it("hides the TX_PROV chart when there are no TX_PROV rows", () => {
    const report = makeReport();
    render(
      <PeDailyPage
        data={makePageData({ report: { ...report, manual: { ...report.manual, tx_prov: [] } } })}
        isAdmin={false}
      />,
    );
    expect(screen.queryByRole("figure", { name: "Promos – TX_PROV chart" })).not.toBeInTheDocument();
  });
});
