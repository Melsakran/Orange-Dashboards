import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualSection } from "@/components/pe-daily/manual-section";
import { SECTIONS } from "@/lib/pe-daily/sections";

const savePeDailySection = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ kind: "browser-client" }));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@/lib/pe-daily/mutations", () => ({ savePeDailySection }));

const onSaved = vi.fn();

function renderActions(isAdmin = true, rows = [{ action: "Restart provisioning job", status: "Done" }]) {
  return render(
    <ManualSection
      section={SECTIONS.actions}
      rows={rows}
      reportDate="2026-10-22"
      isAdmin={isAdmin}
      onSaved={onSaved}
    />,
  );
}

describe("ManualSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePeDailySection.mockResolvedValue(undefined);
  });

  it("shows the table without an Edit button for visitors", () => {
    renderActions(false);
    expect(screen.getByRole("table", { name: "Actions" })).toHaveTextContent("Restart provisioning job");
    expect(screen.queryByRole("button", { name: "Edit Actions" })).not.toBeInTheDocument();
  });

  it("edits, adds a row, and saves the trimmed rows", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));

    const status = screen.getByLabelText("Status, row 1");
    expect(screen.getByLabelText("Action, row 1")).toHaveValue("Restart provisioning job");
    expect(screen.getByLabelText("Action, row 1")).toHaveAttribute("aria-required", "true");
    expect(status).not.toHaveAttribute("aria-required");
    await user.clear(status);
    await user.type(status, "In progress");
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await user.type(screen.getByLabelText("Action, row 2"), "  Check Grafana  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(savePeDailySection).toHaveBeenCalledWith(fakeClient, "2026-10-22", "actions", [
      { action: "Restart provisioning job", status: "In progress" },
      { action: "Check Grafana", status: "" },
    ]);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("blocks editing after a save until fresh rows arrive", async () => {
    const user = userEvent.setup();
    const rows = [{ action: "Restart provisioning job", status: "Done" }];
    const { rerender } = renderActions(true, rows);
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    await user.clear(screen.getByLabelText("Status, row 1"));
    await user.type(screen.getByLabelText("Status, row 1"), "Blocked");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    rerender(
      <ManualSection section={SECTIONS.actions} rows={rows} reportDate="2026-10-22" isAdmin onSaved={onSaved} />,
    );
    expect(screen.queryByRole("button", { name: "Edit Actions" })).not.toBeInTheDocument();

    rerender(
      <ManualSection
        section={SECTIONS.actions}
        rows={[{ action: "Restart provisioning job", status: "Blocked" }]}
        reportDate="2026-10-22"
        isAdmin
        onSaved={onSaved}
      />,
    );
    expect(screen.getByRole("button", { name: "Edit Actions" })).toBeEnabled();
    expect(screen.getByRole("table", { name: "Actions" })).toHaveTextContent("Blocked");
  });

  it("shows field errors and blocks saving", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await user.type(screen.getByLabelText("Status, row 2"), "Pending");

    expect(screen.getByText("Required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Action, row 2")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Delete row 2" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("validates TX_PROV counts", async () => {
    const user = userEvent.setup();
    render(
      <ManualSection
        section={SECTIONS.tx_prov}
        rows={[]}
        reportDate="2026-10-22"
        isAdmin
        onSaved={onSaved}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Promos – TX_PROV" }));
    await user.type(screen.getByLabelText("Promo Name, row 1"), "go-2");
    await user.type(screen.getByLabelText("Last Week Count, row 1"), "12a");
    expect(screen.getByText("Enter a whole number.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Last Week Count, row 1"));
    await user.type(screen.getByLabelText("Last Week Count, row 1"), "1,408");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(savePeDailySection).toHaveBeenCalledWith(
      fakeClient,
      "2026-10-22",
      "tx_prov",
      [{ promo: "go-2", last_week: 1408, day_before: null, yesterday: null }],
    ));
  });

  it("discards edits on Cancel", async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    await user.clear(screen.getByLabelText("Action, row 1"));
    await user.type(screen.getByLabelText("Action, row 1"), "Changed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(savePeDailySection).not.toHaveBeenCalled();
    expect(screen.getByRole("table", { name: "Actions" })).toHaveTextContent("Restart provisioning job");
  });

  it("closes the editor without saving when the report date changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    await user.clear(screen.getByLabelText("Status, row 1"));
    await user.type(screen.getByLabelText("Status, row 1"), "Blocked");

    rerender(
      <ManualSection
        section={SECTIONS.actions}
        rows={[{ action: "Rotate API keys", status: "Pending" }]}
        reportDate="2026-10-21"
        isAdmin
        onSaved={onSaved}
      />,
    );

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Actions" });
    expect(table).toHaveTextContent("Rotate API keys");
    expect(table).not.toHaveTextContent("Restart provisioning job");
    expect(savePeDailySection).not.toHaveBeenCalled();
  });

  it("keeps the edits and offers Retry when saving fails", async () => {
    const user = userEvent.setup();
    savePeDailySection.mockRejectedValueOnce(new Error("Saving the section failed: timeout"));
    renderActions();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    await user.clear(screen.getByLabelText("Status, row 1"));
    await user.type(screen.getByLabelText("Status, row 1"), "Blocked");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Saving the section failed: timeout");
    expect(screen.getByLabelText("Status, row 1")).toHaveValue("Blocked");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(savePeDailySection).toHaveBeenCalledTimes(2));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("starts an empty section with one blank row and can save it empty", async () => {
    const user = userEvent.setup();
    renderActions(true, []);
    expect(screen.getByText("No entries")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Actions" }));
    const editor = screen.getByRole("table", { name: "Edit Actions" });
    expect(within(editor).getAllByRole("row")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(savePeDailySection).toHaveBeenCalledWith(fakeClient, "2026-10-22", "actions", []));
  });
});
