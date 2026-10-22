import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeDailyPage } from "@/components/pe-daily/pe-daily-page";
import { makePageData } from "./fixtures/pe-daily";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ kind: "browser-client" }));
const mutations = vi.hoisted(() => ({
  savePeDailyReport: vi.fn(),
  savePeDailySection: vi.fn(),
  deletePeDailyReport: vi.fn(),
  savePeDailyChartSettings: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@/lib/pe-daily/mutations", () => mutations);

const sampleCsv = readFileSync(resolve(import.meta.dirname, "fixtures/pe-daily-report-sample.csv"));

function sampleFile() {
  return new File([sampleCsv], "daily report.csv", { type: "text/csv" });
}

describe("PE Daily Report admin tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mutations).forEach((mock) => mock.mockResolvedValue(undefined));
  });

  it("hides every admin control from visitors", () => {
    render(<PeDailyPage data={makePageData()} isAdmin={false} />);
    for (const name of ["Upload", "Chart settings", "Delete this date"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryAllByRole("button", { name: /^Edit / })).toHaveLength(0);
  });

  it("shows admin controls, including Edit on all six admin-entered sections", () => {
    render(<PeDailyPage data={makePageData()} isAdmin />);
    for (const name of ["Upload", "Chart settings", "Delete this date"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /^Edit / }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Edit Promos – TX_PROV",
      "Edit Actions",
      "Edit Offer Sheet Tool",
      "Edit Data Lake",
      "Edit IT First Line Cases",
      "Edit Grafana",
    ]);
  });

  it("previews and saves an upload for an existing date", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData()} isAdmin />);
    await user.upload(screen.getByLabelText("Choose the daily report file"), sampleFile());

    const dialog = await screen.findByRole("dialog", { name: "daily report.csv" });
    expect(dialog).toHaveTextContent("Report for 22 Oct 2026: 29 promos, 11 SMS rows, 7 upselling days");
    expect(dialog).toHaveTextContent(
      "This replaces the uploaded data for 22 Oct 2026. Admin-entered sections are kept.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save report" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/pe-daily-report?date=2026-10-22"));
    expect(refresh).toHaveBeenCalled();
    expect(mutations.savePeDailyReport).toHaveBeenCalledWith(
      fakeClient,
      "daily report.csv",
      expect.objectContaining({ reportDate: "2026-10-22" }),
    );
    expect(mutations.savePeDailyReport.mock.calls[0][2].promos).toHaveLength(29);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("omits the replace note for a new date and lists file problems", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData({ dates: ["2026-10-21"] })} isAdmin />);
    await user.upload(screen.getByLabelText("Choose the daily report file"), sampleFile());
    const dialog = await screen.findByRole("dialog", { name: "daily report.csv" });
    expect(dialog).not.toHaveTextContent("This replaces the uploaded data");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.upload(
      screen.getByLabelText("Choose the daily report file"),
      new File(["REPORT_DATE\n31-02-2026\n"], "bad.csv", { type: "text/csv" }),
    );
    const bad = await screen.findByRole("dialog", { name: "bad.csv" });
    expect(bad).toHaveTextContent("This file can't be uploaded.");
    expect(bad).toHaveTextContent('Row 2: Unrecognized report date "31-02-2026".');
    expect(bad).toHaveTextContent("The file has no PROMO block.");
    expect(within(bad).queryByRole("button", { name: "Save report" })).not.toBeInTheDocument();
  });

  it("keeps the upload dialog open with Retry when saving fails", async () => {
    const user = userEvent.setup();
    mutations.savePeDailyReport.mockRejectedValueOnce(new Error("Saving the report failed: timeout"));
    render(<PeDailyPage data={makePageData()} isAdmin />);
    await user.upload(screen.getByLabelText("Choose the daily report file"), sampleFile());
    const dialog = await screen.findByRole("dialog", { name: "daily report.csv" });
    await user.click(within(dialog).getByRole("button", { name: "Save report" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Saving the report failed: timeout");
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(mutations.savePeDailyReport).toHaveBeenCalledTimes(2));
  });

  it("saves chart settings for everyone", async () => {
    const user = userEvent.setup();
    render(<PeDailyPage data={makePageData()} isAdmin />);
    await user.click(screen.getByRole("button", { name: "Chart settings" }));
    const dialog = screen.getByRole("dialog", { name: "Chart settings" });
    expect(within(dialog).getByRole("checkbox", { name: "Promos – TX_PROV" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Upselling trend" })).not.toBeChecked();

    await user.click(within(dialog).getByRole("checkbox", { name: "Upselling trend" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Promos – TX_PROV" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mutations.savePeDailyChartSettings).toHaveBeenCalledWith(fakeClient, ["h_dynamic", "upselling"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes the shown date after confirmation and offers Retry on failure", async () => {
    const user = userEvent.setup();
    mutations.deletePeDailyReport.mockRejectedValueOnce(new Error("Deleting the report failed: timeout"));
    render(<PeDailyPage data={makePageData()} isAdmin />);

    await user.click(screen.getByRole("button", { name: "Delete this date" }));
    const confirm = screen.getByRole("dialog", { name: "Delete the 22 Oct 2026 report?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Deleting the report failed: timeout");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/pe-daily-report"));
    expect(mutations.deletePeDailyReport).toHaveBeenLastCalledWith(fakeClient, "2026-10-22");
    expect(refresh).toHaveBeenCalled();
  });
});
