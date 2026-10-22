import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsRequestsPage } from "@/components/ops/ops-requests-page";

const refresh = vi.hoisted(() => vi.fn());
const replaceOpsRequests = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ kind: "browser-client" }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@/lib/ops/mutations", () => ({ replaceOpsRequests }));

const sampleCsv = readFileSync(resolve(import.meta.dirname, "fixtures/ops-requests-sample.csv"));
const emptyDataset = { requests: [], upload: null };

function chooseFile() {
  return screen.getByLabelText("Choose a CSV or Excel file to upload");
}

describe("Ops Requests upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceOpsRequests.mockResolvedValue("upload-1");
  });

  it("shows Upload only to admins", () => {
    const { rerender } = render(<OpsRequestsPage dataset={emptyDataset} isAdmin={false} />);
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    rerender(<OpsRequestsPage dataset={emptyDataset} isAdmin />);
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("previews a valid file and cancels without saving", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File([sampleCsv], "export.csv", { type: "text/csv" }));

    const dialog = await screen.findByRole("dialog", { name: "export.csv" });
    expect(dialog).toHaveTextContent("19 requests found — 0 open, 0 pending, 19 closed");
    expect(dialog).toHaveTextContent("Replacing will delete all current Ops Requests data");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replaceOpsRequests).not.toHaveBeenCalled();
  });

  it("replaces the data and refreshes the page", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File([sampleCsv], "export.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog", { name: "export.csv" });
    await user.click(within(dialog).getByRole("button", { name: "Replace data" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(replaceOpsRequests).toHaveBeenCalledWith(fakeClient, "export.csv", expect.any(Array));
    expect(replaceOpsRequests.mock.calls[0][2]).toHaveLength(19);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with Retry when saving fails", async () => {
    const user = userEvent.setup();
    replaceOpsRequests.mockRejectedValueOnce(new Error("Upload failed: timeout"));
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File([sampleCsv], "export.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog", { name: "export.csv" });
    await user.click(within(dialog).getByRole("button", { name: "Replace data" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Upload failed: timeout");
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(replaceOpsRequests).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open when closed during a save", async () => {
    const user = userEvent.setup();
    let finishSave: (value: string) => void = () => {};
    replaceOpsRequests.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finishSave = resolve;
      }),
    );
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File([sampleCsv], "export.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog", { name: "export.csv" });
    await user.click(within(dialog).getByRole("button", { name: "Replace data" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "export.csv" })).toBeInTheDocument();

    finishSave("upload-1");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lists every failing row", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);
    const header =
      "Interaction ID,Status,Assignment Time,Title,Request Title,Description,Requestor Name,Close Date,Closure Code,Closure Comments,Assigned To";
    const rows = Array.from(
      { length: 60 },
      (_, index) => `SD${index + 1},Resolved,1/2/2026,Title,,,,,,,`,
    );
    const csv = `${header}\n${rows.join("\n")}\n`;

    await user.upload(chooseFile(), new File([csv], "bad.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog", { name: "bad.csv" });
    const items = within(within(dialog).getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(60);
    expect(items[0]).toHaveTextContent(
      'Row 2 (SD1): Unrecognized status "Resolved". Use Open, Pending, or Closed.',
    );
    expect(items[59]).toHaveTextContent(/^Row 61 \(SD60\): Unrecognized status/);
  });

  it("lists validation problems and offers no way to save", async () => {
    const user = userEvent.setup();
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);
    const csv = "Interaction ID,Status\nSD1,Open\n";

    await user.upload(chooseFile(), new File([csv], "partial.csv", { type: "text/csv" }));
    const dialog = await screen.findByRole("dialog", { name: "partial.csv" });
    expect(dialog).toHaveTextContent("This file can't be uploaded");
    expect(dialog).toHaveTextContent("Missing columns: Assignment Time, Title");
    expect(within(dialog).queryByRole("button", { name: "Replace data" })).not.toBeInTheDocument();
  });

  it("rejects unsupported file types", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<OpsRequestsPage dataset={emptyDataset} isAdmin />);

    await user.upload(chooseFile(), new File(["hello"], "notes.txt", { type: "text/plain" }));
    const dialog = await screen.findByRole("dialog", { name: "notes.txt" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Upload a .csv or .xlsx file.");
  });
});
