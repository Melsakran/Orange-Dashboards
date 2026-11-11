import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpsRequestsView } from "@/components/ops/ops-requests-view";
import { timestampMs } from "@/lib/ops/analytics";
import { emptyOpsDataset, type OpsDataset } from "@/lib/ops/types";
import { makeOpsRequest } from "./fixtures/ops-requests";

const refresh = vi.hoisted(() => vi.fn());
const saveOpsManualItem = vi.hoisted(() => vi.fn());
const deleteOpsManualItem = vi.hoisted(() => vi.fn());
const fakeClient = vi.hoisted(() => ({ kind: "browser-client" }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@/lib/ops/mutations", () => ({ saveOpsManualItem, deleteOpsManualItem }));
vi.mock("@/components/ops/use-client-now", () => ({
  useClientNow: () => timestampMs("2026-05-21T08:00:00"),
}));

const dataset: OpsDataset = {
  ...emptyOpsDataset(),
  requests: [
    makeOpsRequest({
      id: "id-merge-import",
      interactionId: "MRG-IMPORT",
      isMergeRequest: true,
      requestTitle: "Imported merge",
    }),
    makeOpsRequest({
      id: "id-merge-manual",
      interactionId: "MRG-MANUAL",
      source: "manual",
      isMergeRequest: true,
      status: "in_progress",
      requestTitle: "Manual merge",
      description: "Merge details",
      requestorName: "Rana",
      assignedTo: "Omar",
      assignmentTime: "2026-05-20T08:30:00",
      closeDate: null,
      closureCode: "",
    }),
    makeOpsRequest({
      id: "id-issue-import",
      interactionId: "ISS-IMPORT",
      requestTitle: "Imported issue",
      status: "open",
      assignmentTime: "2026-05-19T08:00:00",
      closeDate: null,
      closureCode: "",
    }),
    makeOpsRequest({
      id: "id-issue-manual",
      interactionId: "ISS-MANUAL",
      source: "manual",
      requestTitle: "Manual issue",
      status: "pending",
      assignmentTime: "2026-05-18T10:15:00",
      closeDate: null,
      closureCode: "",
    }),
    makeOpsRequest({
      id: "id-da-merge-manual",
      interactionId: "DA-MRG-MANUAL",
      team: "data_analytics",
      source: "manual",
      isMergeRequest: true,
      requestTitle: "DA manual merge",
      status: "open",
      assignmentTime: "2026-05-17T08:00:00",
      closeDate: null,
      closureCode: "",
    }),
    makeOpsRequest({
      id: "id-da-issue-manual",
      interactionId: "DA-ISS-MANUAL",
      team: "data_analytics",
      source: "manual",
      requestTitle: "DA manual issue",
      status: "open",
      assignmentTime: "2026-05-16T08:00:00",
      closeDate: null,
      closureCode: "",
    }),
  ],
};

function renderView(isAdmin = true, data: OpsDataset = dataset) {
  return render(<OpsRequestsView dataset={data} isAdmin={isAdmin} />);
}

async function openDataAnalytics(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByRole("group", { name: "Team" })).getByRole("button", { name: "Data Analytics" }));
}

async function openIssuesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Issues" }));
}

async function openDetails(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(screen.getByRole("button", { name: `View details for ${id}` }));
  return screen.findByRole("dialog");
}

function setValue(label: string, value: string) {
  fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  saveOpsManualItem.mockResolvedValue("new-id");
  deleteOpsManualItem.mockResolvedValue(undefined);
});

describe("admin-only controls", () => {
  it("shows the Add buttons only to admins", async () => {
    const user = userEvent.setup();
    const { unmount } = renderView(false);
    expect(screen.queryByRole("button", { name: "Add merge request" })).not.toBeInTheDocument();
    await openIssuesTab(user);
    expect(screen.queryByRole("button", { name: "Add issue" })).not.toBeInTheDocument();
    unmount();

    renderView(true);
    expect(screen.getByRole("button", { name: "Add merge request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add issue" })).not.toBeInTheDocument();
    await openIssuesTab(user);
    expect(screen.getByRole("button", { name: "Add issue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add merge request" })).not.toBeInTheDocument();
  });

  it("shows Edit/Delete only for manual items, to admins", async () => {
    const user = userEvent.setup();
    renderView(true);

    let dialog = await openDetails(user, "MRG-MANUAL");
    expect(within(dialog).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close request details" }));

    dialog = await openDetails(user, "MRG-IMPORT");
    expect(within(dialog).queryByRole("button", { name: /^(Edit|Delete|Route)$/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close request details" }));

    await openIssuesTab(user);
    dialog = await openDetails(user, "ISS-IMPORT");
    expect(within(dialog).queryByRole("button", { name: /^(Edit|Delete|Route)$/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close request details" }));

    dialog = await openDetails(user, "ISS-MANUAL");
    expect(within(dialog).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Route" })).not.toBeInTheDocument();
  });

  it("shows visitors no Edit or Delete controls", async () => {
    const user = userEvent.setup();
    renderView(false);

    let dialog = await openDetails(user, "MRG-MANUAL");
    expect(within(dialog).queryByRole("button", { name: /^(Edit|Delete|Route)$/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close request details" }));

    await openIssuesTab(user);
    dialog = await openDetails(user, "ISS-MANUAL");
    expect(within(dialog).queryByRole("button", { name: /^(Edit|Delete|Route)$/ })).not.toBeInTheDocument();
  });
});

describe("Add merge request", () => {
  it("saves the form payload and refreshes the page data", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));

    const dialog = await screen.findByRole("dialog", { name: "Add merge request" });
    expect(within(dialog).getByText("Leave blank to generate one")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Area")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Owner")).not.toBeInTheDocument();

    setValue("Title", "  Merge 2501  ");
    setValue("Description", "Please merge");
    setValue("Requestor", "Rana");
    setValue("Assignee", "Omar");
    setValue("Status", "closed");
    setValue("Assignment date and time", "2026-05-21T09:30");
    setValue("Close date and time", "2026-05-22T10:00");
    setValue("Closure code", "Successful");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(saveOpsManualItem).toHaveBeenCalledWith(fakeClient, {
      id: undefined,
      team: "operations",
      kind: "merge",
      interactionId: "",
      status: "closed",
      assignmentTime: "2026-05-21T09:30:00",
      closeDate: "2026-05-22T10:00:00",
      requestTitle: "Merge 2501",
      description: "Please merge",
      requestorName: "Rana",
      assignedTo: "Omar",
      closureCode: "Successful",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends a typed Interaction ID and no close time when left empty", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    await screen.findByRole("dialog");

    setValue("Interaction ID", "MR-77");
    setValue("Title", "Merge");
    setValue("Assignment date and time", "2026-05-21T09:30");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(saveOpsManualItem).toHaveBeenCalledTimes(1));
    expect(saveOpsManualItem.mock.calls[0][1]).toMatchObject({
      interactionId: "MR-77",
      status: "open",
      closeDate: null,
    });
  });

  it("explains missing fields and saves nothing", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Title is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("Assignment time is required.")).toBeInTheDocument();
    expect(saveOpsManualItem).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rejects a close time earlier than the assignment time", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    const dialog = await screen.findByRole("dialog");

    setValue("Title", "Merge");
    setValue("Status", "closed");
    setValue("Assignment date and time", "2026-05-21T09:30");
    setValue("Close date and time", "2026-05-21T09:00");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(within(dialog).getByText("Close time can't be earlier than the assignment time.")).toBeInTheDocument();
    expect(saveOpsManualItem).not.toHaveBeenCalled();
  });

  it("requires a close time for closed items", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    const dialog = await screen.findByRole("dialog");

    setValue("Title", "Merge");
    setValue("Status", "closed");
    setValue("Assignment date and time", "2026-05-21T09:30");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(within(dialog).getByText("Close time is required for closed items.")).toBeInTheDocument();
    expect(saveOpsManualItem).not.toHaveBeenCalled();
  });

  it("saves no close time unless the item is closed", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    const dialog = await screen.findByRole("dialog");

    setValue("Title", "Merge");
    setValue("Status", "closed");
    setValue("Assignment date and time", "2026-05-21T09:30");
    setValue("Close date and time", "2026-05-22T10:00");
    setValue("Status", "pending");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(saveOpsManualItem).toHaveBeenCalledTimes(1));
    expect(saveOpsManualItem.mock.calls[0][1]).toMatchObject({ status: "pending", closeDate: null });
  });

  it("cannot be closed with Escape or the close button while saving", async () => {
    const user = userEvent.setup();
    let finish: (id: string) => void = () => {};
    saveOpsManualItem.mockReturnValueOnce(new Promise<string>((resolve) => { finish = resolve; }));
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    const dialog = await screen.findByRole("dialog");

    setValue("Title", "Merge");
    setValue("Assignment date and time", "2026-05-21T09:30");
    fireEvent.submit(dialog.querySelector("form")!);
    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    await user.click(within(dialog).getByRole("button", { name: "Close form" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    finish("new-id");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open and shows the error when saving fails, then allows a retry", async () => {
    const user = userEvent.setup();
    saveOpsManualItem.mockRejectedValueOnce(new Error("Saving failed: duplicate id"));
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    const dialog = await screen.findByRole("dialog");

    setValue("Title", "Merge");
    setValue("Assignment date and time", "2026-05-21T09:30");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Saving failed: duplicate id");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("blocks double submits while saving", async () => {
    const user = userEvent.setup();
    let finish: (id: string) => void = () => {};
    saveOpsManualItem.mockReturnValueOnce(new Promise<string>((resolve) => { finish = resolve; }));
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    const dialog = await screen.findByRole("dialog");

    setValue("Title", "Merge");
    setValue("Assignment date and time", "2026-05-21T09:30");
    const form = dialog.querySelector("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(saveOpsManualItem).toHaveBeenCalledTimes(1);
    finish("new-id");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("cancels without saving", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Add merge request" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveOpsManualItem).not.toHaveBeenCalled();
  });
});

describe("Add form follows the current kind and team", () => {
  async function openAdd(user: ReturnType<typeof userEvent.setup>, tab: "merge" | "issues", dataTeam: boolean) {
    renderView();
    if (tab === "issues") await openIssuesTab(user);
    if (dataTeam) await openDataAnalytics(user);
    await user.click(screen.getByRole("button", { name: tab === "issues" ? "Add issue" : "Add merge request" }));
    return screen.findByRole("dialog", { name: tab === "issues" ? "Add issue" : "Add merge request" });
  }

  it.each([
    ["merge", false, "merge", "operations", "Operations"],
    ["issues", false, "issue", "operations", "Operations"],
    ["merge", true, "merge", "data_analytics", "Data Analytics"],
    ["issues", true, "issue", "data_analytics", "Data Analytics"],
  ] as const)("on %s (analytics: %s) saves a %s item for %s", async (tab, dataTeam, kind, team, label) => {
    const user = userEvent.setup();
    const dialog = await openAdd(user, tab, dataTeam);
    expect(dialog).toHaveTextContent(label);
    expect(within(dialog).queryByLabelText("Area")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Owner")).not.toBeInTheDocument();

    setValue("Title", "Broken load");
    setValue("Assignment date and time", "2026-05-21T09:30");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const payload = saveOpsManualItem.mock.calls[0][1];
    expect(payload).toMatchObject({ team, kind, requestTitle: "Broken load" });
    expect(payload).not.toHaveProperty("areaId");
    expect(payload).not.toHaveProperty("ownerName");
  });

  it("labels the Add button for the current kind on every team", async () => {
    const user = userEvent.setup();
    renderView();
    await openDataAnalytics(user);
    expect(screen.getByRole("button", { name: "Add merge request" })).toBeInTheDocument();
    await openIssuesTab(user);
    expect(screen.getByRole("button", { name: "Add issue" })).toBeInTheDocument();
  });
});

describe("Edit and delete manual items", () => {
  it("opens the form pre-filled and saves the changes with the item id", async () => {
    const user = userEvent.setup();
    renderView();
    const details = await openDetails(user, "MRG-MANUAL");
    await user.click(within(details).getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit merge request" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(dialog).getByLabelText("Interaction ID")).toHaveValue("MRG-MANUAL");
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Manual merge");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Merge details");
    expect(within(dialog).getByLabelText("Requestor")).toHaveValue("Rana");
    expect(within(dialog).getByLabelText("Assignee")).toHaveValue("Omar");
    expect(within(dialog).getByLabelText("Status")).toHaveValue("in_progress");
    expect(within(dialog).getByLabelText("Assignment date and time")).toHaveValue("2026-05-20T08:30");
    expect(within(dialog).getByLabelText("Close date and time")).toHaveValue("");

    setValue("Title", "Renamed merge");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(saveOpsManualItem).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({
        id: "id-merge-manual",
        kind: "merge",
        interactionId: "MRG-MANUAL",
        requestTitle: "Renamed merge",
        assignmentTime: "2026-05-20T08:30:00",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a Data Analytics item's team when editing it", async () => {
    const user = userEvent.setup();
    renderView();
    await openIssuesTab(user);
    await openDataAnalytics(user);
    const details = await openDetails(user, "DA-ISS-MANUAL");
    await user.click(within(details).getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit issue" });
    expect(within(dialog).queryByLabelText("Area")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Owner")).not.toBeInTheDocument();
    setValue("Title", "Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(saveOpsManualItem).toHaveBeenCalledTimes(1));
    expect(saveOpsManualItem.mock.calls[0][1]).toMatchObject({
      id: "id-da-issue-manual",
      team: "data_analytics",
      kind: "issue",
    });
  });

  it("returns to the details when editing is cancelled", async () => {
    const user = userEvent.setup();
    renderView();
    const details = await openDetails(user, "MRG-MANUAL");
    await user.click(within(details).getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit merge request" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(saveOpsManualItem).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting, then deletes and refreshes", async () => {
    const user = userEvent.setup();
    renderView();
    const details = await openDetails(user, "MRG-MANUAL");
    await user.click(within(details).getByRole("button", { name: "Delete" }));

    const confirm = await screen.findByRole("dialog", { name: "Delete MRG-MANUAL?" });
    expect(deleteOpsManualItem).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(deleteOpsManualItem).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Delete" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const again = await screen.findByRole("dialog", { name: "Delete MRG-MANUAL?" });
    await user.click(within(again).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(deleteOpsManualItem).toHaveBeenCalledTimes(1);
    expect(deleteOpsManualItem).toHaveBeenCalledWith(fakeClient, "id-merge-manual");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open with the error when deleting fails", async () => {
    const user = userEvent.setup();
    deleteOpsManualItem.mockRejectedValueOnce(new Error("Only admins can change Ops Requests."));
    renderView();
    await openIssuesTab(user);
    const details = await openDetails(user, "ISS-MANUAL");
    await user.click(within(details).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete ISS-MANUAL?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(await within(confirm).findByRole("alert")).toHaveTextContent("Only admins can change Ops Requests.");
    expect(screen.getByRole("dialog", { name: "Delete ISS-MANUAL?" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
